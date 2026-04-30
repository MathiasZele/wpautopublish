import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getArticleQueue } from '@/lib/queue';

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided = req.headers.get('x-cron-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

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
        },
        { delay: i * 60_000 },
      );
      if (job.id) enqueued.push(job.id);
    }
  }

  return NextResponse.json({ enqueued: enqueued.length, sites: sites.length });
}
