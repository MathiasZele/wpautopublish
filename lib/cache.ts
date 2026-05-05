import IORedis from 'ioredis';

const globalForCache = globalThis as unknown as {
  cacheRedis: IORedis | null | undefined;
};

function getRedis(): IORedis | null {
  if (globalForCache.cacheRedis !== undefined) return globalForCache.cacheRedis;
  if (!process.env.REDIS_URL) {
    globalForCache.cacheRedis = null;
    return null;
  }
  globalForCache.cacheRedis = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    lazyConnect: true,
  });
  return globalForCache.cacheRedis;
}

/**
 * Cache memoize avec Redis. Si Redis est indisponible, on fallback sur l'appel direct.
 * - `key` : clé unique (préfixer par un namespace ex: "wp-cats:")
 * - `ttlSeconds` : durée de vie de l'entrée
 * - `loader` : fonction qui produit la valeur si cache miss
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return loader();

  // 1. Tenter de lire depuis Redis
  let cached: string | null = null;
  try {
    if (redis.status !== 'ready' && redis.status !== 'connecting') {
      await redis.connect().catch(() => {});
    }
    cached = await redis.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // entrée corrompue → fall-through vers loader
      }
    }
  } catch (e) {
    console.warn(`[cache] redis read error on ${key}: ${(e as Error).message} — fallback to direct loader`);
  }

  // 2. Appeler le loader (erreurs du loader propagées telles quelles, sans retry)
  const value = await loader();

  // 3. Stocker le résultat en cache (fire-and-forget)
  try {
    redis.setex(key, ttlSeconds, JSON.stringify(value)).catch((e) => {
      console.warn(`[cache] set failed for ${key}: ${e.message}`);
    });
  } catch {
    // ignore write errors
  }
  return value;
}

/**
 * Invalidation manuelle (à appeler quand on sait que les données ont changé,
 * ex: PUT /api/sites/[id] qui modifie les credentials).
 */
export async function invalidate(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (e) {
    console.warn(`[cache] del failed for ${key}: ${(e as Error).message}`);
  }
}
