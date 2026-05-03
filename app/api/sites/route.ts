import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { assertPublicUrl, UnsafeUrlError } from '@/lib/safeUrl';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().max(500),
  wpUsername: z.string().min(1).max(60),
  wpAppPassword: z.string().min(1).max(200),
  customEndpointKey: z.string().min(8).max(256),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const websites = await prisma.website.findMany({
    where: { userId: session.user.id },
    include: { profile: true, _count: { select: { articles: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    websites.map((w) => ({
      id: w.id,
      name: w.name,
      url: w.url,
      status: w.status,
      lastTestedAt: w.lastTestedAt,
      autoMode: w.profile?.autoMode ?? false,
      articleCount: w._count.articles,
      createdAt: w.createdAt,
    })),
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const data = parsed.data;

  try {
    await assertPublicUrl(data.url);
  } catch (e) {
    const msg = e instanceof UnsafeUrlError ? e.message : 'URL refusée';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const website = await prisma.website.create({
    data: {
      userId: session.user.id,
      name: data.name,
      url: data.url.replace(/\/$/, ''),
      wpUsername: data.wpUsername,
      wpAppPassword: encrypt(data.wpAppPassword),
      customEndpointKey: encrypt(data.customEndpointKey),
      profile: { create: {} },
    },
    select: { id: true, name: true, url: true, status: true },
  });

  return NextResponse.json(website, { status: 201 });
}
