import { RateLimiterRedis, RateLimiterMemory, RateLimiterAbstract } from 'rate-limiter-flexible';
import { NextResponse } from 'next/server';
import IORedis from 'ioredis';

/**
 * Rate limiter avec Redis (prod) ou mémoire (dev/fallback).
 * Fallback automatique si REDIS_URL absent ou indisponible.
 */

const globalForRl = globalThis as unknown as {
  rlRedis: IORedis | null | undefined;
};

function getRedis(): IORedis | null {
  if (globalForRl.rlRedis !== undefined) return globalForRl.rlRedis;
  if (!process.env.REDIS_URL) {
    globalForRl.rlRedis = null;
    return null;
  }
  globalForRl.rlRedis = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  globalForRl.rlRedis.on('error', (e) => console.warn('[rl] redis error:', e.message));
  return globalForRl.rlRedis;
}

function makeLimiter(keyPrefix: string, points: number, durationSec: number): RateLimiterAbstract {
  const redis = getRedis();
  if (redis) {
    return new RateLimiterRedis({
      storeClient: redis,
      keyPrefix,
      points,
      duration: durationSec,
    });
  }
  // Fallback in-memory (par instance — pas distribué, mais OK pour dev)
  return new RateLimiterMemory({ keyPrefix, points, duration: durationSec });
}

// Limiteurs par cas d'usage
export const registerLimit = makeLimiter('rl:reg', 5, 60);          // 5 inscriptions / min / IP
export const publishLimit  = makeLimiter('rl:pub', 30, 3600);       // 30 jobs / heure / userId
export const webhookLimit  = makeLimiter('rl:wh', 60, 60);          // 60 messages WhatsApp / min / sender

/**
 * Tente de consommer 1 point ; renvoie une NextResponse 429 si dépassé,
 * `null` si l'appel peut continuer.
 */
export async function consume(limiter: RateLimiterAbstract, key: string): Promise<NextResponse | null> {
  try {
    await limiter.consume(key);
    return null;
  } catch (rej: any) {
    const retryAfter = Math.ceil((rej?.msBeforeNext ?? 1000) / 1000);
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
