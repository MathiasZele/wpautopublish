import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getArticleQueue } from '@/lib/queue';
import { consume, publishLimit } from '@/lib/rateLimit';

// Spacing minimum 10s : avec concurrency=1 + cooldown 5s côté worker, on
// sérialise déjà naturellement, mais le `delay` BullMQ étale les jobs en file
// pour que le worker puisse traiter d'autres tâches entre temps. Anti-spam
// supplémentaire : si tu enqueues 50 jobs avec spacing 0, ça ressemble à un
// bot pour Cloudflare/WAF.
const schema = z.object({
  count: z.number().int().min(1).max(50),
  spacingSeconds: z.number().int().min(10).max(3600).default(30),
  categoryIds: z.array(z.number().int()).optional(),
  autoCategorize: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  // Rate limit par userId : 30 jobs / heure (partagé avec /api/publish — somme totale)
  const limited = await consume(publishLimit, session.user.id);
  if (limited) return limited;

  const site = await prisma.website.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { profile: true },
  });
  if (!site) return new NextResponse('Not Found', { status: 404 });
  if (site.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Site non actif. Testez la connexion d\'abord.' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const { count, spacingSeconds, categoryIds, autoCategorize } = parsed.data;
  const queue = getArticleQueue();
  const jobs: string[] = [];

  for (let i = 0; i < count; i++) {
    const job = await queue.add(
      'auto-on-demand',
      {
        websiteId: site.id,
        mode: 'AUTO',
        articleIndex: i,
        categoryIds,
        autoCategorize,
      },
      {
        delay: spacingSeconds * 1000 * i,
      },
    );
    if (job.id) jobs.push(job.id);
  }

  return NextResponse.json({ enqueued: jobs.length, jobIds: jobs }, { status: 202 });
}
