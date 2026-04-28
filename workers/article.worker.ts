import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../lib/prisma';
import { openai, buildArticlePrompt, parseArticleResponse, calculateCost } from '../lib/openai';
import { publishToWordPress } from '../lib/wordpress';
import { getNewsForQuery } from '../lib/newsapi';
import { uploadImageFromUrl } from '../lib/cloudinary';
import { findImageForTopic } from '../lib/imageSearch';
import type { ArticleJobData } from '../lib/queue';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required');
}

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

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

    let newsContext: string | undefined;
    let topic = manualInput
      || (website.profile.topics.length > 0
        ? website.profile.topics[idx % website.profile.topics.length]
        : 'Actualité');

    if (mode === 'AUTO' && website.profile.newsApiQuery) {
      try {
        const articles = await getNewsForQuery(website.profile.newsApiQuery, 10);
        if (articles.length > 0) {
          const a = articles[idx % articles.length];
          newsContext = `Titre : ${a.title}\nDescription : ${a.description}`;
          topic = a.title;
        }
      } catch (e) {
        console.error('NewsAPI error', e);
      }
    }

    const { system, user } = buildArticlePrompt({
      topic,
      tone: website.profile.tone,
      language: website.profile.language,
      customPrompt: website.profile.customPrompt ?? undefined,
      newsContext,
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
    const { html, seo } = parseArticleResponse(raw);
    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const cost = calculateCost(inputTokens, outputTokens);

    let featuredImageUrl: string | undefined;
    let sourceImageUrl = manualImageUrl;

    if (!sourceImageUrl && website.profile.autoImage) {
      const found = await findImageForTopic(seo.focuskw || seo.title || topic);
      if (found) sourceImageUrl = found;
    }

    if (sourceImageUrl) {
      try {
        featuredImageUrl = await uploadImageFromUrl(sourceImageUrl);
      } catch (e) {
        console.error('Cloudinary upload failed', e);
      }
    }

    const finalCategoryIds =
      categoryIds && categoryIds.length > 0
        ? categoryIds
        : website.profile.defaultCategoryIds;

    const result = await publishToWordPress({
      website,
      title: seo.title || topic,
      content: html,
      yoast_title: seo.title,
      yoast_metadesc: seo.metadesc,
      yoast_focuskw: seo.focuskw,
      featured_image_url: featuredImageUrl,
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

articleWorker.on('failed', async (job, err) => {
  if (!job) return;
  console.error(`Job ${job.id} failed:`, err.message);
  try {
    await prisma.articleLog.create({
      data: {
        websiteId: job.data.websiteId,
        title: 'Échec de génération',
        status: 'FAILED',
        mode: job.data.mode,
        errorMessage: err.message,
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
