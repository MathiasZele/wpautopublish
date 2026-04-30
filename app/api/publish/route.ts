import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getArticleQueue } from '@/lib/queue';
import { assertPublicUrl, UnsafeUrlError } from '@/lib/safeUrl';

const schema = z.object({
  websiteId: z.string().min(1),
  topic: z.string().optional(),
  title: z.string().min(3).optional(),
  content: z.string().min(10).optional(),
  provider: z.string().optional(),
  imageUrl: z.string().url().optional(),
  categoryIds: z.array(z.number().int()).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const site = await prisma.website.findFirst({
    where: { id: parsed.data.websiteId, userId: session.user.id },
  });
  if (!site) return new NextResponse('Not Found', { status: 404 });

  if (parsed.data.imageUrl) {
    try {
      await assertPublicUrl(parsed.data.imageUrl);
    } catch (e) {
      const msg = e instanceof UnsafeUrlError ? e.message : 'URL d\'image refusée';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const job = await getArticleQueue().add('manual', {
    websiteId: site.id,
    mode: 'MANUAL',
    manualInput: parsed.data.topic,
    title: parsed.data.title,
    content: parsed.data.content,
    provider: parsed.data.provider,
    manualImageUrl: parsed.data.imageUrl,
    categoryIds: parsed.data.categoryIds,
  });

  return NextResponse.json({ jobId: job.id, status: 'queued' }, { status: 202 });
}
