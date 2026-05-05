import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import IORedis from 'ioredis';
import { prisma } from '@/lib/prisma';
import { getArticleQueue } from '@/lib/queue';

const LOCK_KEY = 'cron:trigger:lock';
const LOCK_TTL_SECONDS = 55; // Cron Railway tourne toutes les ~minutes ; lock dort avant la prochaine fenêtre

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided = req.headers.get('x-cron-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Acquiert un lock distribué Redis (SET NX EX).
 * Renvoie true si on a obtenu le lock, false si une autre instance l'a déjà.
 * Évite que 2 instances Railway exécutent le cron en parallèle (race au déploiement).
 */
async function tryAcquireLock(): Promise<{ acquired: boolean; redis: IORedis | null }> {
  if (!process.env.REDIS_URL) return { acquired: true, redis: null }; // pas de Redis → pas de lock
  const redis = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const result = await redis.set(LOCK_KEY, String(Date.now()), 'EX', LOCK_TTL_SECONDS, 'NX');
    return { acquired: result === 'OK', redis };
  } catch (e) {
    console.warn('[cron] redis lock unavailable, proceeding without lock:', (e as Error).message);
    try { await redis.quit(); } catch { /* noop */ }
    return { acquired: true, redis: null };
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const lock = await tryAcquireLock();
  if (!lock.acquired) {
    console.log('[cron] another instance holds the lock, skipping this run');
    if (lock.redis) {
      try { await lock.redis.quit(); } catch { /* noop */ }
    }
    return NextResponse.json({ status: 'skipped_locked' }, { status: 200 });
  }

  try {
    const sites = await prisma.website.findMany({
      where: {
        status: 'ACTIVE',
        profile: { autoMode: true },
      },
      include: { profile: true },
    });

    const queue = getArticleQueue();
    const enqueued: string[] = [];

    for (const site of sites) {
      if (!site.profile) continue;
      const count = site.profile.articlesPerDay ?? 1;
      for (let i = 0; i < count; i++) {
        const job = await queue.add(
          'auto',
          {
            websiteId: site.id,
            mode: 'AUTO',
            articleIndex: i,
            provider: site.profile.preferredProvider,
            // Cron auto = on laisse l'IA choisir 1-3 catégories pertinentes parmi
            // celles du site, sinon le worker tombe en fallback sur defaultCategoryIds
            // qui peut contenir TOUTES les catégories du site (pollution).
            autoCategorize: true,
          },
          { delay: i * 60_000 },
        );
        if (job.id) enqueued.push(job.id);
      }
    }

    return NextResponse.json({ enqueued: enqueued.length, sites: sites.length });
  } finally {
    if (lock.redis) {
      try { await lock.redis.quit(); } catch { /* noop */ }
    }
  }
}
