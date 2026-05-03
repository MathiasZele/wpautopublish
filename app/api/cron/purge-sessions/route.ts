import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';

const SESSION_TTL_MINUTES = 15;

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
 * Supprime les `WhatsAppSession` orphelines / abandonnées depuis plus de 15 min.
 * À déclencher via Railway Cron Service toutes les 5 min.
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const cutoff = new Date(Date.now() - SESSION_TTL_MINUTES * 60 * 1000);
  const result = await prisma.whatsAppSession.deleteMany({
    where: { updatedAt: { lt: cutoff } },
  });

  return NextResponse.json({
    deleted: result.count,
    ttl_minutes: SESSION_TTL_MINUTES,
    timestamp: new Date().toISOString(),
  });
}
