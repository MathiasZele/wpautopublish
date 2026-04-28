import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getArticleQueue } from '@/lib/queue';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
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
        { websiteId: site.id, mode: 'AUTO' },
        { delay: i * 60_000 },
      );
      if (job.id) enqueued.push(job.id);
    }
  }

  return NextResponse.json({ enqueued: enqueued.length, sites: sites.length });
}

export async function GET(req: Request) {
  return POST(req);
}
