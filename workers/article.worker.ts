import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../lib/prisma';
import { openai, buildArticlePrompt, parseArticleResponse, calculateCost } from '../lib/openai';
import { publishToWordPress } from '../lib/wordpress';
import { searchNews, type NewsArticle } from '../lib/newsapi';
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
}): Promise<NewsArticle | null> {
  const { query, language, maxAgeHours, index } = opts;

  const attempts: { query: string; maxAgeHours?: number; pageSize: number }[] = [
    { query, maxAgeHours, pageSize: 10 },
    { query, pageSize: 20 },
    { query: looserQuery(query), pageSize: 20 },
  ];

  for (const a of attempts) {
    if (a.query !== query && a.query === '') continue;
    try {
      const articles = await searchNews({
        query: a.query,
        pageSize: a.pageSize,
        language,
        maxAgeHours: a.maxAgeHours,
      });
      const picked = pickArticleWithImage(articles, index);
      if (picked) return picked;
    } catch (e) {
      console.error('NewsAPI attempt failed', a, e);
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
    sourceName: a.source?.name ?? 'NewsAPI',
    newsImage: a.urlToImage!,
  };
}

export const articleWorker = new Worker<ArticleJobData>(
  'article-generation',
  async (job: Job<ArticleJobData>) => {
    const { websiteId, mode, manualInput, manualImageUrl, articleIndex, categoryIds } = job.data;
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
      });
      if (article) {
        // En AUTO : l'article NewsAPI sert aussi de contexte pour la rédaction
        // En MANUAL : on garde le sujet utilisateur, on récupère juste image + source
        resolvedSource = mapSource(article, mode === 'AUTO', mode === 'MANUAL' ? manualInput : undefined);
        topic = resolvedSource.topic;
        if (!candidateImage) candidateImage = resolvedSource.newsImage;
      }
    }

    // Si on exige une image et qu'on n'en a aucune → échec contrôlé
    if (requireImage && !candidateImage) {
      throw new NoImageFoundError(newsQuery || topic);
    }

    // ─── Génération de l'article ────────────────────────────────────────────
    const { system, user } = buildArticlePrompt({
      topic,
      tone: profile.tone,
      language: profile.language,
      customPrompt: profile.customPrompt ?? undefined,
      newsContext: resolvedSource?.newsContext,
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
      categoryIds && categoryIds.length > 0 ? categoryIds : profile.defaultCategoryIds;

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
        imageUrl: cloudinaryUrl,
        publishedAt: new Date(),
      },
    });

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
  } catch (logErr) {
    console.error('Failed to log error', logErr);
  }
});

articleWorker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed → ${(result as { url?: string })?.url ?? 'no url'}`);
});

console.log('Article worker started');
