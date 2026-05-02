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

const STOPWORDS_LOOSER = /^(les?|la|des?|de|du|une?|et|ou|sur|pour|avec|dans|chez|aux?|en)$/i;

/**
 * Simplifie une requête pour le 3ème niveau de fallback NewsAPI.
 * - Garde les mots ≥ 2 chars hors stopwords courants
 * - Si la query simplifiée est vide, garde les 2 mots les plus longs sans filtre stopwords
 * - Si la query originale fait moins de 3 mots, ne simplifie pas
 */
function looserQuery(query: string): string {
  const allWords = query.split(/\s+/).filter(Boolean);
  if (allWords.length < 3) return query;

  const filtered = allWords.filter(w => w.length >= 2 && !STOPWORDS_LOOSER.test(w));
  if (filtered.length >= 2) return filtered.slice(0, 3).join(' ');

  // Fallback : 2 plus longs mots de la query originale sans filtre
  const sortedByLen = [...allWords].sort((a, b) => b.length - a.length);
  return sortedByLen.slice(0, 2).join(' ') || query;
}

function pickArticleWithImage(articles: NewsArticle[], index: number, existingUrls?: Set<string>): NewsArticle | null {
  // Les filtres durs (urlToImage, [Removed], description, dates) sont déjà appliqués par l'orchestrator.
  // Ici on filtre uniquement les doublons déjà publiés sur ce site.
  const valid = existingUrls
    ? articles.filter(a => !existingUrls.has(a.url))
    : articles;
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
  existingUrls?: Set<string>;
}): Promise<NewsArticle | null> {
  const { query, language, maxAgeHours, index, provider, existingUrls } = opts;

  const page = Math.floor(index / 100) + 1;
  const attempts: { query: string; maxAgeHours?: number; pageSize: number; page?: number }[] = [
    { query, maxAgeHours, pageSize: 100, page },
    { query, pageSize: 100, page },
    { query: looserQuery(query), pageSize: 100, page },
  ];

  for (const a of attempts) {
    if (a.query !== query && a.query === '') continue;
    try {
      const articles = await newsOrchestrator.search({
        query: a.query,
        pageSize: a.pageSize,
        page: a.page,
        language,
        maxAgeHours: a.maxAgeHours,
      }, provider);
      const picked = pickArticleWithImage(articles, index, existingUrls);
      if (picked) return picked;
    } catch (e) {
      console.error('Orchestrator attempt failed', a, e);
    }
  }

  return null;
}

function mapSource(a: NewsArticle, keepNewsContext: boolean, overrideTopic?: string): ResolvedSource {
  // Contexte source enrichi : titre + description + body (si dispo) + URL + date
  // L'IA s'en sert comme matière pour grounder l'article (anti-hallucination).
  let newsContext: string | undefined;
  if (keepNewsContext) {
    const parts: string[] = [];
    parts.push(`Titre : ${a.title}`);
    if (a.description) parts.push(`Description : ${a.description}`);
    if (a.body && a.body.length > a.description.length) {
      // On tronque à 1500 chars pour éviter de faire exploser le prompt
      const body = a.body.slice(0, 1500);
      parts.push(`Contenu (extrait) : ${body}`);
    }
    parts.push(`URL source : ${a.url}`);
    parts.push(`Source : ${a.sourceName}`);
    if (a.publishedAt) parts.push(`Date : ${a.publishedAt}`);
    newsContext = parts.join('\n');
  }

  return {
    topic: overrideTopic ?? a.title,
    newsContext,
    sourceUrl: a.url,
    sourceName: a.sourceName,
    providerName: a.providerName,
    newsImage: a.urlToImage!,
  };
}

export const articleWorker = new Worker<ArticleJobData>(
  'article-generation',
  async (job: Job<ArticleJobData>) => {
    const { 
      websiteId, mode, manualInput, manualImageUrl, title, content, 
      articleIndex, categoryIds, autoCategorize, draftMode, whatsAppRequestId, 
      senderJid, instanceId, provider 
    } = job.data;
    const idx = articleIndex ?? 0;

    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      include: { profile: true },
    });
    if (!website || !website.profile) throw new Error('Site ou profil introuvable');

    const profile = website.profile;
    const requireImage = profile.autoImage;

    // ─── Direct Post Bypass ──────────────────────────────────────────────────
    if (title && content) {
      console.log('Direct post detected, skipping AI generation...');
      
      let finalImageUrl: string | undefined = undefined;
      if (manualImageUrl) {
        try {
          finalImageUrl = await uploadImageFromUrl(manualImageUrl);
        } catch (e) {
          console.warn('Failed to upload direct image:', e);
        }
      }

      const wpResult = await publishToWordPress({
        website,
        title,
        content,
        status: draftMode ? 'draft' : 'publish',
        yoast_title: title,
        yoast_metadesc: '',
        yoast_focuskw: '',
        categories: categoryIds,
        featured_image_url: finalImageUrl,
      });

      await prisma.articleLog.create({
        data: {
          websiteId: website.id,
          title,
          wpPostId: wpResult.post_id,
          wpPostUrl: wpResult.url,
          status: 'SUCCESS',
          mode: 'MANUAL',
          imageUrl: finalImageUrl,
          categoryIds: categoryIds || [],
          publishedAt: new Date(),
        },
      });

      // Update WhatsApp request if needed
      if (whatsAppRequestId) {
        await prisma.whatsAppRequest.update({
          where: { id: whatsAppRequestId },
          data: {
            successCount: { increment: 1 },
            articleLinks: { push: wpResult.url }
          }
        });
      }

      return { success: true, url: wpResult.url };
    }

    // ─── Résolution de la source + image (Standard Mode) ────────────────────
    let topic = manualInput || (profile.topics.length > 0 ? profile.topics[idx % profile.topics.length] : 'Actualité');
    let resolvedSource: ResolvedSource | null = null;
    let candidateImage: string | undefined = manualImageUrl;

    // ─── Fetch Existing URLs ────────────────────────────────────────────────
    const existingLogs = await prisma.articleLog.findMany({
      where: { websiteId, status: 'SUCCESS' },
      select: { sourceUrl: true }
    });
    const existingUrls = new Set(existingLogs.map(l => l.sourceUrl).filter(Boolean) as string[]);

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
        existingUrls,
      });
      if (article) {
        resolvedSource = mapSource(article, mode === 'AUTO', mode === 'MANUAL' ? manualInput : undefined);
        topic = resolvedSource.topic;
        if (!candidateImage) candidateImage = resolvedSource.newsImage;

        // ─── Détection de doublons (Race condition fallback) ────────────────
        const existing = await prisma.articleLog.findFirst({
          where: { websiteId, sourceUrl: resolvedSource.sourceUrl, status: 'SUCCESS' },
        });
        if (existing) {
          console.log(`Doublon détecté (race condition) pour ${websiteId} : ${resolvedSource.sourceUrl}`);
          throw new Error(`Doublon détecté (race condition): ${resolvedSource.sourceUrl}`);
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
        
        // Si l'utilisateur a déjà choisi une liste de catégories, on restreint le choix de l'IA à cette liste
        if (categoryIds && categoryIds.length > 0) {
          availableCategories = wpCats
            .filter(c => categoryIds.includes(c.id))
            .map((c) => ({ id: c.id, name: c.name }));
        } else {
          // Sinon, l'IA choisit parmi toutes les catégories du site
          availableCategories = wpCats.map((c) => ({ id: c.id, name: c.name }));
        }
      } catch (e) {
        console.error('Failed to fetch WP categories', e);
      }
    }

    const websiteTheme = profile.topics.join(', ') || website.name;
    const promptMode = job.data.formatOnly ? 'format-only' : (manualInput ? 'manual' : 'standard');
    const { system, user } = buildArticlePrompt({
      topic,
      tone: profile.tone,
      language: profile.language,
      customPrompt: profile.customPrompt ?? undefined,
      newsContext: resolvedSource?.newsContext,
      availableCategories,
      websiteTheme,
      manualInput,
      mode: promptMode,
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 4000,
    });

    const raw = completion.choices[0].message.content ?? '';
    const parsed = parseArticleResponse(raw); // throw si malformé
    let { html: rawHtml, seo, languageCheck } = parsed;

    // Filet de sécurité langue : si l'IA déclare avoir écrit dans une autre langue, on échoue net
    if (languageCheck && languageCheck !== profile.language.toLowerCase()) {
      throw new Error(`Langue incorrecte : attendu "${profile.language}", IA a renvoyé "${languageCheck}"`);
    }

    // Garde-fou : l'IA renvoie parfois 10+ catégories alors qu'on en veut 1-3 max
    if (seo.categoryIds && seo.categoryIds.length > 3) {
      console.warn(`[worker] ${seo.categoryIds.length} catégories retournées par l'IA, on tronque à 3`);
      seo.categoryIds = seo.categoryIds.slice(0, 3);
    }

    // Garde-fou : retire un éventuel <h2>Conclusion</h2> ajouté en violation de la consigne
    rawHtml = rawHtml.replace(/<h2[^>]*>\s*conclusion\s*<\/h2>/gi, '');

    // Garde-fou : si la source n'est pas mentionnée dans le corps malgré la directive,
    // on l'injecte en fin d'article pour respecter la traçabilité éditoriale.
    if (resolvedSource?.sourceName && resolvedSource?.sourceUrl) {
      const lowerHtml = rawHtml.toLowerCase();
      const lowerSource = resolvedSource.sourceName.toLowerCase();
      if (!lowerHtml.includes(lowerSource)) {
        console.warn(`[worker] Source "${resolvedSource.sourceName}" non mentionnée par l'IA, injection auto`);
        const sourceLine = `<p><em>Source : <a href="${resolvedSource.sourceUrl}" target="_blank" rel="noopener noreferrer">${resolvedSource.sourceName}</a></em></p>`;
        rawHtml = rawHtml.trim() + '\n' + sourceLine;
      }
    }

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
        console.error(`Cloudinary upload failed for URL "${candidateImage}":`, e);
        // On ne bloque plus la publication si l'image échoue, sauf si c'est critique
        // (On peut aussi imaginer un fallback vers une image par défaut ici)
      }
    }

    // ─── Publication WordPress ──────────────────────────────────────────────
    const finalCategoryIds =
      autoCategorize && seo.categoryIds && seo.categoryIds.length > 0
        ? seo.categoryIds
        : categoryIds && categoryIds.length > 0
        ? categoryIds
        : profile.defaultCategoryIds;

    console.log(`[Worker] Publication for site: ${website.name}`);
    console.log(`[Worker] Final Categories: ${JSON.stringify(finalCategoryIds)}`);
    console.log(`[Worker] Final Tags: ${JSON.stringify(seo.tags)}`);

    const result = await publishToWordPress({
      website,
      title: seo.title || topic,
      content: html,
      yoast_title: seo.title,
      yoast_metadesc: seo.metadesc,
      yoast_focuskw: seo.focuskw,
      featured_image_url: cloudinaryUrl,
      status: draftMode ? 'draft' : 'publish',
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
          articleLinks: { push: result.url },
          articleSummaries: { push: seo.metadesc || '' }
        }
      });

      if (updatedRequest.successCount + updatedRequest.failedCount >= updatedRequest.totalCount) {
        const items = updatedRequest.articleLinks.map((l, i) => {
          const summary = updatedRequest.articleSummaries[i];
          const summaryText = (draftMode && summary) ? `\n   _Résumé : ${summary}_` : '';
          return `🔗 ${l}${summaryText}`;
        }).join('\n\n');

        const message = `🏁 *Batch terminé pour ${website.name}*
${draftMode ? '_Articles enregistrés en BROUILLON_' : ''}

✅ Réussis: ${updatedRequest.successCount}
❌ Échecs: ${updatedRequest.failedCount}

*Articles :*
${items || '_Aucun article publié_'}`;

        await sendWhatsAppMessage(updatedRequest.instanceId, updatedRequest.senderJid, message);
        
        await prisma.whatsAppRequest.update({
          where: { id: whatsAppRequestId },
          data: { status: 'COMPLETED' }
        });
      }
    } else if (senderJid && instanceId) {
      // Notification directe pour /direct ou posts manuels unitaires
      console.log(`Sending direct notification to ${senderJid} on instance ${instanceId}`);
      const statusStr = draftMode ? 'enregistré en *BROUILLON*' : 'publié avec succès';
      const summaryStr = (draftMode && seo.metadesc) ? `\n\n📝 *Résumé :* ${seo.metadesc}` : '';
      
      const message = `✅ *Article ${statusStr} !*
      
📌 *Titre :* ${seo.title || topic}
🔗 *Lien :* ${result.url}${summaryStr}`;
      await sendWhatsAppMessage(instanceId, senderJid, message);
    } else {
      console.log('No WhatsApp notification sent (no whatsAppRequestId and no senderJid/instanceId)');
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
        const draftMode = job.data.draftMode;

        const items = updatedRequest.articleLinks.map((l, i) => {
          const summary = updatedRequest.articleSummaries[i];
          const summaryText = (draftMode && summary) ? `\n   _Résumé : ${summary}_` : '';
          return `🔗 ${l}${summaryText}`;
        }).join('\n\n');

        const message = `🏁 *Batch terminé pour ${websiteName}*
${draftMode ? '_Articles enregistrés en BROUILLON_' : ''}

✅ Réussis: ${updatedRequest.successCount}
❌ Échecs: ${updatedRequest.failedCount}

*Articles :*
${items || '_Aucun article publié_'}`;

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
