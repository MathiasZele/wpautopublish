import { NextResponse } from 'next/server';
import IORedis from 'ioredis';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Health check pour Railway / monitoring externe.
 * Retourne 200 si DB + Redis répondent en < 2s, 503 sinon.
 * Pas d'auth (volontaire — c'est un health check).
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // Postgres
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (e) {
    checks.db = { ok: false, error: (e as Error).message.slice(0, 120) };
  }

  // Redis
  const redisStart = Date.now();
  let redis: IORedis | null = null;
  try {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL not set');
    redis = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    checks.redis = { ok: true, latencyMs: Date.now() - redisStart };
  } catch (e) {
    checks.redis = { ok: false, error: (e as Error).message.slice(0, 120) };
  } finally {
    if (redis) {
      try { await redis.quit(); } catch { /* noop */ }
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 },
  );
}
