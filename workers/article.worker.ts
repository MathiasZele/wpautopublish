import 'dotenv/config';
import { Worker, Job, UnrecoverableError } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../lib/prisma';
import { openai, buildArticlePrompt, parseArticleResponse, calculateCost } from '../lib/openai';
import { publishToWordPress, fetchWordPressCategories, CloudflareBlockError } from '../lib/wordpress';
import { sendWhatsAppMessage } from '../lib/evolution';
import { decrypt } from '../lib/encryption';
import { newsOrchestrator } from '../lib/news/orchestrator';
import { type NewsArticle } from '../lib/news/providers/base';
import { uploadImageFromUrl } from '../lib/cloudinary';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml';
import { logger } from '../lib/logger';
import type { ArticleJobData } from '../lib/queue';

/**
 * Anti-spam Cloudflare/WP : on étale les requêtes vers chaque site WP.
 *
 * - PUBLISH_COOLDOWN_MS : sleep humain après chaque publish réussie pour
 *   éviter de ressembler à un bot. Avec concurrency=1 et 5s de sleep, on
 *   plafonne naturellement à ~10 publishes/minute (publish ~5s + sleep 5s).
 *
 * - CF_FAILURE_WINDOW_S : fenêtre Redis pour compter les blocs Cloudflare
 *   par site. Au-dessus du seuil (CF_FAILURE_THRESHOLD), on auto-pause le
 *   site (Website.status = PAUSED) pour stopper la cascade d'erreurs.
 */
const PUBLISH_COOLDOWN_MS = 5_000;
const CF_FAILURE_WINDOW_S = 300; // 5 min
const CF_FAILURE_THRESHOLD = 3;

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required');
}

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const log = logger.child({ module: 'worker' });

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
      log.error({ err: e, attempt: a }, 'Orchestrator attempt failed');
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

    // Idempotence : si ce job.id a déjà produit un ArticleLog SUCCESS,
    // c'est un retry après une publication WP réussie (ex: kill -9 entre publish
    // et articleLog.create dans une version précédente). On skip pour éviter le doublon WP.
    if (job.id) {
      const existingLog = await prisma.articleLog.findUnique({
        where: { jobId: job.id },
        select: { id: true, status: true, wpPostId: true, wpPostUrl: true, estimatedCost: true },
      });
      if (existingLog && existingLog.status === 'SUCCESS') {
        log.info({ jobId: job.id, articleLogId: existingLog.id }, 'Job déjà traité (idempotence) — skip');
        return { post_id: existingLog.wpPostId, url: existingLog.wpPostUrl, cost: existingLog.estimatedCost };
      }
    }

    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      include: { profile: true },
    });
    if (!website || !website.profile) throw new Error('Site ou profil introuvable');

    const profile = website.profile;
    const requireImage = profile.autoImage;

    // ─── Direct Post Bypass ──────────────────────────────────────────────────
    if (title && content) {
      log.info({ websiteId, jobId: job.id }, 'Direct post detected, skipping AI generation');
      
      let finalImageUrl: string | undefined = undefined;
      if (manualImageUrl) {
        try {
          finalImageUrl = await uploadImageFromUrl(manualImageUrl);
        } catch (e) {
          log.warn({ err: e }, 'Failed to upload direct image');
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
          jobId: job.id ?? null,
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
          log.info({ websiteId, sourceUrl: resolvedSource.sourceUrl }, 'Doublon détecté (race condition fallback)');
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
        log.error({ err: e }, 'Failed to fetch WP categories');
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

    // Avertissements non bloquants accumulés pendant le traitement (visibles côté UI)
    const warnings: string[] = [];

    // Filet de sécurité langue : si l'IA déclare avoir écrit dans une autre langue, on échoue net
    if (languageCheck && languageCheck !== profile.language.toLowerCase()) {
      throw new Error(`Langue incorrecte : attendu "${profile.language}", IA a renvoyé "${languageCheck}"`);
    }

    // Garde-fou : l'IA renvoie parfois 10+ catégories alors qu'on en veut 1-3 max
    if (seo.categoryIds && seo.categoryIds.length > 3) {
      const original = seo.categoryIds.length;
      log.warn({ count: original }, 'IA returned too many categories, truncating to 3');
      warnings.push(`Catégories tronquées : l'IA en a proposé ${original}, conservées les 3 premières`);
      seo.categoryIds = seo.categoryIds.slice(0, 3);
    }

    // Garde-fou : retire un éventuel <h2>Conclusion</h2> ajouté en violation de la consigne
    const beforeConclusion = rawHtml;
    rawHtml = rawHtml.replace(/<h2[^>]*>\s*conclusion\s*<\/h2>/gi, '');
    if (rawHtml !== beforeConclusion) {
      warnings.push("Section <h2>Conclusion</h2> retirée (violation consigne)");
    }

    // Garde-fou : si la source n'est pas mentionnée dans le corps malgré la directive,
    // on l'injecte en fin d'article pour respecter la traçabilité éditoriale.
    // Sécurité : on échappe l'URL et le nom — un sourceUrl malveillant ne peut pas
    // injecter de javascript: ou de balise via la concaténation (qui passe ENSUITE
    // par sanitizeArticleHtml).
    if (resolvedSource?.sourceName && resolvedSource?.sourceUrl) {
      const lowerHtml = rawHtml.toLowerCase();
      const lowerSource = resolvedSource.sourceName.toLowerCase();
      if (!lowerHtml.includes(lowerSource)) {
        // Validation stricte de l'URL : seul http(s) est accepté
        let safeHref: string | null = null;
        try {
          const u = new URL(resolvedSource.sourceUrl);
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            safeHref = u.toString();
          }
        } catch { /* invalid URL */ }

        if (safeHref) {
          const escapeHtml = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          log.warn({ sourceName: resolvedSource.sourceName }, 'Source non mentionnée par l\'IA, injection auto en fin d\'article');
          warnings.push(`Source "${resolvedSource.sourceName}" injectée automatiquement (non mentionnée par l'IA)`);
          const sourceLine = `<p><em>Source : <a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(resolvedSource.sourceName)}</a></em></p>`;
          rawHtml = rawHtml.trim() + '\n' + sourceLine;
        } else {
          log.warn({ sourceUrl: resolvedSource.sourceUrl.slice(0, 80) }, 'Source URL refusée (protocole non http/https)');
          warnings.push("Source URL refusée (protocole non http/https)");
        }
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
        log.error({ err: e, candidateImage }, 'Cloudinary upload failed');
        warnings.push("Upload Cloudinary échoué — article publié sans image");
        // On ne bloque plus la publication si l'image échoue, sauf si c'est critique
        // (On peut aussi imaginer un fallback vers une image par défaut ici)
      }
    }

    // ─── Publication WordPress ──────────────────────────────────────────────
    // Garde-fou défensif : on cap toujours à 3 catégories max au final, même
    // si profile.defaultCategoryIds en contient plus (cas observé : 22 cats
    // sélectionnées dans le profil polluaient chaque article).
    const MAX_FINAL_CATEGORIES = 3;
    let finalCategoryIds =
      autoCategorize && seo.categoryIds && seo.categoryIds.length > 0
        ? seo.categoryIds
        : categoryIds && categoryIds.length > 0
        ? categoryIds
        : profile.defaultCategoryIds;
    if (finalCategoryIds.length > MAX_FINAL_CATEGORIES) {
      const original = finalCategoryIds.length;
      log.warn(
        { count: original, source: 'finalCategoryIds' },
        'Cap final categoryIds to 3 (defensive)',
      );
      warnings.push(
        `Catégories tronquées : ${original} → ${MAX_FINAL_CATEGORIES} (limite article)`,
      );
      finalCategoryIds = finalCategoryIds.slice(0, MAX_FINAL_CATEGORIES);
    }

    log.info(
      { siteName: website.name, categoryIds: finalCategoryIds, tags: seo.tags },
      'Publishing to WordPress',
    );

    let result: { post_id: number; url: string };
    try {
      result = await publishToWordPress({
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
    } catch (e) {
      // Cloudflare bloque → inutile de retry, BullMQ skip directement.
      // Le handler 'failed' incrémente le compteur et auto-pause le site.
      if (e instanceof CloudflareBlockError) {
        throw new UnrecoverableError(e.message);
      }
      throw e;
    }

    try {
      await prisma.articleLog.create({
        data: {
          jobId: job.id ?? null,
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
          warnings,
          publishedAt: new Date(),
        },
      });
    } catch (e: any) {
      // P2002 = unique constraint violation : un autre worker a déjà publié ce sourceUrl
      // pour ce site (race gagnée par lui). On log mais on ne fail pas le job — l'article
      // a tout de même été publié sur WP, on ne veut pas que BullMQ retente.
      if (e?.code === 'P2002') {
        log.warn(
          { websiteId, sourceUrl: resolvedSource?.sourceUrl },
          'Doublon DB (race condition gagnée par autre worker) — log ignoré',
        );
      } else {
        throw e;
      }
    }

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
      log.info({ senderJid: senderJid?.slice(-6), instanceId }, 'Sending direct notification');
      const statusStr = draftMode ? 'enregistré en *BROUILLON*' : 'publié avec succès';
      const summaryStr = (draftMode && seo.metadesc) ? `\n\n📝 *Résumé :* ${seo.metadesc}` : '';
      
      const message = `✅ *Article ${statusStr} !*
      
📌 *Titre :* ${seo.title || topic}
🔗 *Lien :* ${result.url}${summaryStr}`;
      await sendWhatsAppMessage(instanceId, senderJid, message);
    } else {
      log.debug('No WhatsApp notification sent (no whatsAppRequestId and no senderJid/instanceId)');
    }

    // Sleep "humain" avant de retourner pour étaler les publishes vers WP
    // (évite que Cloudflare nous prenne pour un bot lors d'un burst de jobs).
    await new Promise((r) => setTimeout(r, PUBLISH_COOLDOWN_MS));

    return { post_id: result.post_id, url: result.url, cost };
  },
  {
    connection,
    // concurrency 1 : les jobs sont sérialisés, pas de bursts parallèles vers
    // le même domaine WP. Suffisant tant qu'on a peu de sites — à upgrader
    // (rate limiter par-domaine via Redis) si on doit servir 10+ sites en // parallèle.
    concurrency: 1,
    // Un job de génération (NewsAPI + OpenAI + Cloudinary + WP) peut dépasser 30s
    // largement. Sans ces tunings, BullMQ libère le lock à 30s par défaut, croit
    // le worker mort, et retente le job déjà en cours → publication dupliquée.
    lockDuration: 120_000,    // 2 min : marge confortable pour un job standard
    lockRenewTime: 60_000,    // renouvelle à 1 min pour les jobs très longs (>2 min)
    stalledInterval: 60_000,  // check des jobs bloqués toutes les minutes
    maxStalledCount: 1,       // si un job stall, on l'échoue après 1 retry max
  },
);

function sanitizeErrorForLog(message: string): string {
  // Tronque, retire les URLs avec credentials, masque les tokens longs
  return message
    .replace(/https?:\/\/[^@\s]+@[^\s]+/gi, '[url-with-credentials]')
    .replace(/(sk-|gQ|npg_|Bearer\s+)[A-Za-z0-9_\-+/=]{10,}/g, '[redacted-token]')
    .slice(0, 500);
}

/**
 * Circuit breaker Cloudflare : on compte les blocs CF par site dans une
 * fenêtre glissante de 5 min. Au-dessus du seuil, on auto-pause le site
 * pour stopper la cascade (le user devra ré-activer après avoir réglé CF).
 */
async function trackCloudflareBlock(websiteId: string): Promise<void> {
  const key = `cf-block:${websiteId}`;
  try {
    const count = await connection.incr(key);
    if (count === 1) {
      await connection.expire(key, CF_FAILURE_WINDOW_S);
    }
    if (count >= CF_FAILURE_THRESHOLD) {
      await prisma.website.update({
        where: { id: websiteId },
        data: { status: 'PAUSED' },
      });
      log.warn(
        { websiteId, count },
        `Site auto-paused après ${CF_FAILURE_THRESHOLD} blocs Cloudflare en ${CF_FAILURE_WINDOW_S}s`,
      );
      // Reset le compteur pour qu'au ré-test après fix CF, on reparte propre
      await connection.del(key);
    }
  } catch (e) {
    log.warn({ err: e }, 'trackCloudflareBlock failed (non-blocking)');
  }
}

articleWorker.on('failed', async (job, err) => {
  if (!job) return;
  log.error({ jobId: job.id, errMessage: err.message }, 'Job failed');

  // Circuit breaker CF : si l'erreur est un bloc Cloudflare, on incrémente
  // le compteur et on auto-pause le site au-dessus du seuil. La détection
  // marche aussi via UnrecoverableError.cause si BullMQ a wrappé.
  const cause = (err as Error & { cause?: unknown }).cause;
  const isCfBlock =
    err instanceof CloudflareBlockError ||
    err.name === 'CloudflareBlockError' ||
    cause instanceof CloudflareBlockError ||
    (typeof err.message === 'string' && err.message.includes('Cloudflare Bot Protection'));
  if (isCfBlock && job.data.websiteId) {
    await trackCloudflareBlock(job.data.websiteId);
  }

  try {
    // Idempotence : si un log existe déjà pour ce jobId (par ex. SUCCESS
    // créé en amont puis BullMQ a re-fired un retry), on ne crée pas un
    // log FAILED contradictoire.
    if (job.id) {
      const already = await prisma.articleLog.findUnique({
        where: { jobId: job.id },
        select: { status: true },
      });
      if (already) {
        log.info({ jobId: job.id, existingStatus: already.status }, 'Skip FAILED log: jobId déjà loggé');
        return;
      }
    }
    await prisma.articleLog.create({
      data: {
        jobId: job.id ?? null,
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
    log.error({ err: logErr }, 'Failed to log job failure to DB');
  }
});

articleWorker.on('completed', (job, result) => {
  log.info({ jobId: job.id, url: (result as { url?: string })?.url ?? null }, 'Job completed');
});

log.info('Article worker started');
