import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../lib/prisma';
import { openai, buildArticlePrompt, parseArticleResponse, calculateCost } from '../lib/openai';
import { publishToWordPress, fetchWordPressCategories } from '../lib/wordpress';
import { sendWhatsAppMessage } from '../lib/evolution';
import { decrypt } from '../lib/encryption';
import { newsOrchestrator } from '../lib/news/orchestrator';
import { type NewsArticle } from '../lib/news/providers/base';
import { uploadImageFromUrl } from '../lib/cloudinary';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml';
import type { ArticleJobData } from '../lib/queue';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required');
}

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

interface ResolvedSource {
  topic: string;
  newsContext?: string;
  sourceUrl: string;
  sourceName: string;
  providerName: string;
  newsImage: string;
}

class NoImageFoundError extends Error {
  constructor(query: string) {
    super(`Aucun article récent avec image trouvé pour : "${query}"`);
    this.name = 'NoImageFoundError';
  }
}

function looserQuery(query: string): string {
  // Garde les 2 premiers mots significatifs (>3 chars) du query original
  const words = query
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(les?|la|des?|de|du|une?|et|ou|sur|pour|avec)$/i.test(w));
  return words.slice(0, 2).join(' ') || query;
}

function pickArticleWithImage(articles: NewsArticle[], index: number): NewsArticle | null {
  const valid = articles.filter(
    (a) => a.title && a.title !== '[Removed]' && a.urlToImage,
  );
  if (valid.length === 0) return null;
  return valid[index % valid.length];
}

/**
 * 3 niveaux de recherche pour trouver un article réel avec image :
 *   1. Query original + filtre d'âge
 *   2. Query original sans filtre d'âge
 *   3. Query simplifié (mots-clés) sans filtre d'âge
 * Renvoie null si rien n'est trouvé.
 */
async function findArticleWithImage(opts: {
  query: string;
  language: string;
  maxAgeHours: number;
  index: number;
  provider?: string;
}): Promise<NewsArticle | null> {
  const { query, language, maxAgeHours, index, provider } = opts;

  const attempts: { query: string; maxAgeHours?: number; pageSize: number }[] = [
    { query, maxAgeHours, pageSize: 10 },
    { query, pageSize: 20 },
    { query: looserQuery(query), pageSize: 20 },
  ];

  for (const a of attempts) {
    if (a.query !== query && a.query === '') continue;
    try {
      const articles = await newsOrchestrator.search({
        query: a.query,
        pageSize: a.pageSize,
        language,
        maxAgeHours: a.maxAgeHours,
      }, provider);
      const picked = pickArticleWithImage(articles, index);
      if (picked) return picked;
    } catch (e) {
      console.error('Orchestrator attempt failed', a, e);
    }
  }

  return null;
}

function mapSource(a: NewsArticle, keepNewsContext: boolean, overrideTopic?: string): ResolvedSource {
  return {
    topic: overrideTopic ?? a.title,
    newsContext: keepNewsContext
      ? `Titre : ${a.title}\nDescription : ${a.description ?? ''}`
      : undefined,
    sourceUrl: a.url,
    sourceName: a.sourceName,
    providerName: a.providerName,
    newsImage: a.urlToImage!,
  };
}

export const articleWorker = new Worker<ArticleJobData>(
  'article-generation',
  async (job: Job<ArticleJobData>) => {
    const { websiteId, mode, manualInput, manualImageUrl, articleIndex, categoryIds, autoCategorize, whatsAppRequestId, provider } = job.data;
    const idx = articleIndex ?? 0;

    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      include: { profile: true },
    });
    if (!website || !website.profile) throw new Error('Site ou profil introuvable');

    const profile = website.profile;
    const requireImage = profile.autoImage; // true = échec si pas d'image, false = post sans image

    // ─── Résolution de la source + image ────────────────────────────────────
    let topic = manualInput || (profile.topics.length > 0 ? profile.topics[idx % profile.topics.length] : 'Actualité');
    let resolvedSource: ResolvedSource | null = null;
    let candidateImage: string | undefined = manualImageUrl;

    // En AUTO ou MANUAL : on essaie toujours de trouver un article réel pour avoir image + source
    const newsQuery = mode === 'AUTO'
      ? (profile.newsApiQuery || profile.topics[idx % profile.topics.length] || '')
      : (manualInput || '');

    if (newsQuery) {
      const article = await findArticleWithImage({
        query: newsQuery,
        language: profile.language,
        maxAgeHours: profile.maxArticleAgeHours,
        index: idx,
        provider,
      });
      if (article) {
        resolvedSource = mapSource(article, mode === 'AUTO', mode === 'MANUAL' ? manualInput : undefined);
        topic = resolvedSource.topic;
        if (!candidateImage) candidateImage = resolvedSource.newsImage;

        // ─── Détection de doublons ───────────────────────────────────────────
        const existing = await prisma.articleLog.findFirst({
          where: { websiteId, sourceUrl: resolvedSource.sourceUrl, status: 'SUCCESS' },
        });
        if (existing) {
          console.log(`Doublon détecté pour ${websiteId} : ${resolvedSource.sourceUrl}`);
          return { skipped: true, reason: 'Duplicate source URL', url: existing.wpPostUrl };
        }
      }
    }

    // Si on exige une image et qu'on n'en a aucune → échec contrôlé
    if (requireImage && !candidateImage) {
      throw new NoImageFoundError(newsQuery || topic);
    }

    // ─── Récupération des catégories si auto-catégorisation activée ──────────
    let availableCategories: { id: number; name: string }[] | undefined;
    if (autoCategorize) {
      try {
        const wpCats = await fetchWordPressCategories(
          website.url,
          website.wpUsername,
          decrypt(website.wpAppPassword)
        );
        availableCategories = wpCats.map((c) => ({ id: c.id, name: c.name }));
      } catch (e) {
        console.error('Failed to fetch WP categories', e);
      }
    }

    // ─── Génération de l'article ────────────────────────────────────────────
    const { system, user } = buildArticlePrompt({
      topic,
      tone: profile.tone,
      language: profile.language,
      customPrompt: profile.customPrompt ?? undefined,
      newsContext: resolvedSource?.newsContext,
      availableCategories,
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 2000,
    });

    const raw = completion.choices[0].message.content ?? '';
    const { html: rawHtml, seo } = parseArticleResponse(raw);
    const html = sanitizeArticleHtml(rawHtml);
    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const cost = calculateCost(inputTokens, outputTokens);

    // ─── Upload de l'image vers Cloudinary ──────────────────────────────────
    let cloudinaryUrl: string | undefined;
    if (candidateImage) {
      try {
        cloudinaryUrl = await uploadImageFromUrl(candidateImage);
      } catch (e) {
        console.error('Cloudinary upload failed', e);
        if (requireImage) {
          throw new Error(`Échec upload Cloudinary : ${(e as Error).message}`);
        }
      }
    }

    // ─── Publication WordPress ──────────────────────────────────────────────
    const finalCategoryIds =
      autoCategorize && seo.categoryIds && seo.categoryIds.length > 0
        ? seo.categoryIds
        : categoryIds && categoryIds.length > 0
        ? categoryIds
        : profile.defaultCategoryIds;

    const result = await publishToWordPress({
      website,
      title: seo.title || topic,
      content: html,
      yoast_title: seo.title,
      yoast_metadesc: seo.metadesc,
      yoast_focuskw: seo.focuskw,
      featured_image_url: cloudinaryUrl,
      status: 'publish',
      categories: finalCategoryIds,
      tags: seo.tags,
    });

    await prisma.articleLog.create({
      data: {
        websiteId,
        title: seo.title || topic,
        wpPostId: result.post_id,
        wpPostUrl: result.url,
        status: 'SUCCESS',
        mode,
        inputTokens,
        outputTokens,
        estimatedCost: cost,
        sourceUrl: resolvedSource?.sourceUrl,
        sourceName: resolvedSource?.sourceName,
        providerName: resolvedSource?.providerName,
        imageUrl: cloudinaryUrl,
        categoryIds: finalCategoryIds,
        tags: seo.tags || [],
        publishedAt: new Date(),
      },
    });

    // Update WhatsApp Request if needed
    if (whatsAppRequestId) {
      const updatedRequest = await prisma.whatsAppRequest.update({
        where: { id: whatsAppRequestId },
        data: {
          successCount: { increment: 1 },
          articleLinks: { push: result.url }
        }
      });

      if (updatedRequest.successCount + updatedRequest.failedCount >= updatedRequest.totalCount) {
        const links = updatedRequest.articleLinks.map((l) => `🔗 ${l}`).join('\n');
        const message = `🏁 *Batch terminé pour ${website.name}*

✅ Réussis: ${updatedRequest.successCount}
❌ Échecs: ${updatedRequest.failedCount}

*Articles publiés :*
${links || '_Aucun article publié_'}`;

        await sendWhatsAppMessage(updatedRequest.instanceId, updatedRequest.senderJid, message);
        
        await prisma.whatsAppRequest.update({
          where: { id: whatsAppRequestId },
          data: { status: 'COMPLETED' }
        });
      }
    }

    return { post_id: result.post_id, url: result.url, cost };
  },
  {
    connection,
    concurrency: 3,
  },
);

function sanitizeErrorForLog(message: string): string {
  // Tronque, retire les URLs avec credentials, masque les tokens longs
  return message
    .replace(/https?:\/\/[^@\s]+@[^\s]+/gi, '[url-with-credentials]')
    .replace(/(sk-|gQ|npg_|Bearer\s+)[A-Za-z0-9_\-+/=]{10,}/g, '[redacted-token]')
    .slice(0, 500);
}

articleWorker.on('failed', async (job, err) => {
  if (!job) return;
  console.error(`Job ${job.id} failed:`, err.message);
  try {
    await prisma.articleLog.create({
      data: {
        websiteId: job.data.websiteId,
        title: err.name === 'NoImageFoundError' ? 'Aucune image trouvée' : 'Échec de génération',
        status: 'FAILED',
        mode: job.data.mode,
        errorMessage: sanitizeErrorForLog(err.message),
      },
    });

    // Update WhatsApp Request on failure
    if (job.data.whatsAppRequestId) {
      const updatedRequest = await prisma.whatsAppRequest.update({
        where: { id: job.data.whatsAppRequestId },
        data: { failedCount: { increment: 1 } }
      });

      if (updatedRequest.successCount + updatedRequest.failedCount >= updatedRequest.totalCount) {
        const website = await prisma.website.findUnique({ where: { id: job.data.websiteId } });
        const websiteName = website ? website.name : 'le site';
        const links = updatedRequest.articleLinks.map((l) => `🔗 ${l}`).join('\n');
        const message = `🏁 *Batch terminé pour ${websiteName}*

✅ Réussis: ${updatedRequest.successCount}
❌ Échecs: ${updatedRequest.failedCount}

*Articles publiés :*
${links || '_Aucun article publié_'}`;

        await sendWhatsAppMessage(updatedRequest.instanceId, updatedRequest.senderJid, message);
        
        await prisma.whatsAppRequest.update({
          where: { id: job.data.whatsAppRequestId },
          data: { status: updatedRequest.successCount > 0 ? 'COMPLETED' : 'FAILED' }
        });
      }
    }
  } catch (logErr) {
    console.error('Failed to log error', logErr);
  }
});

articleWorker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed → ${(result as { url?: string })?.url ?? 'no url'}`);
});

console.log('Article worker started');
