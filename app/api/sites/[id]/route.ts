import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { assertPublicUrl, UnsafeUrlError } from '@/lib/safeUrl';
import { invalidate } from '@/lib/cache';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().max(500).optional(),
  wpUsername: z.string().max(60).optional(),
  wpAppPassword: z.string().max(200).optional(),
  customEndpointKey: z.string().min(8).max(256).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'ERROR', 'PAUSED']).optional(),
  profile: z
    .object({
      language: z.string().max(8).optional(),
      topics: z.array(z.string().max(120)).max(50).optional(),
      tone: z.string().max(40).optional(),
      articlesPerDay: z.number().int().min(0).max(20).optional(),
      autoMode: z.boolean().optional(),
      autoImage: z.boolean().optional(),
      customPrompt: z.string().max(2000).nullable().optional(),
      newsApiQuery: z.string().max(500).nullable().optional(),
      maxArticleAgeHours: z.number().int().min(1).max(8760).optional(),
      defaultCategoryIds: z.array(z.number().int()).max(20).optional(),
      preferredProvider: z.string().max(40).optional(),
    })
    .optional(),
});

async function ownedSite(siteId: string, userId: string) {
  return prisma.website.findFirst({
    where: { id: siteId, userId },
    include: { profile: true },
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const site = await ownedSite(params.id, session.user.id);
  if (!site) return new NextResponse('Not Found', { status: 404 });

  // customEndpointKey: on ne renvoie JAMAIS la valeur en clair, juste un indicateur
  return NextResponse.json({
    id: site.id,
    name: site.name,
    url: site.url,
    wpUsername: site.wpUsername,
    customEndpointKeySet: !!site.customEndpointKey,
    status: site.status,
    lastTestedAt: site.lastTestedAt,
    profile: site.profile,
  });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const existing = await ownedSite(params.id, session.user.id);
  if (!existing) return new NextResponse('Not Found', { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const { profile, wpAppPassword, customEndpointKey, url, ...rest } = parsed.data;

  if (url) {
    try {
      await assertPublicUrl(url);
    } catch (e) {
      const msg = e instanceof UnsafeUrlError ? e.message : 'URL refusée';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const updated = await prisma.website.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(url ? { url: url.replace(/\/$/, '') } : {}),
      ...(wpAppPassword ? { wpAppPassword: encrypt(wpAppPassword) } : {}),
      ...(customEndpointKey ? { customEndpointKey: encrypt(customEndpointKey) } : {}),
      ...(profile
        ? {
            profile: {
              upsert: {
                create: profile,
                update: profile,
              },
            },
          }
        : {}),
    },
    include: { profile: true },
  });

  // Invalide le cache des catégories WP si l'URL ou les credentials ont changé
  if (url || wpAppPassword) {
    const baseUrl = (url ?? existing.url).replace(/\/$/, '');
    invalidate(`wp-cats:${baseUrl}:${existing.wpUsername}`).catch(() => {});
  }

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    url: updated.url,
    status: updated.status,
    profile: updated.profile,
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const existing = await ownedSite(params.id, session.user.id);
  if (!existing) return new NextResponse('Not Found', { status: 404 });

  await prisma.website.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
