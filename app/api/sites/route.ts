import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
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
  // Optionnel : si non fourni, le serveur génère une clé sécurisée et la
  // renvoie une seule fois dans la réponse (pattern display-once).
  customEndpointKey: z.string().min(8).max(256).optional(),
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

  // Génération côté serveur si pas fournie : 24 bytes hex = 192 bits d'entropie.
  // Renvoyée en clair dans la réponse, jamais accessible de nouveau ensuite.
  const endpointSecret = data.customEndpointKey ?? randomBytes(24).toString('hex');

  const website = await prisma.website.create({
    data: {
      userId: session.user.id,
      name: data.name,
      url: data.url.replace(/\/$/, ''),
      wpUsername: data.wpUsername,
      wpAppPassword: encrypt(data.wpAppPassword),
      customEndpointKey: encrypt(endpointSecret),
      profile: { create: {} },
    },
    select: { id: true, name: true, url: true, status: true },
  });

  // Display-once : on renvoie la clé en clair UNIQUEMENT à la création.
  // Le client doit l'afficher avec un avertissement et inviter l'utilisateur
  // à la copier dans le plugin WordPress (page Réglages → WP AutoPublish).
  return NextResponse.json({ ...website, endpointSecret }, { status: 201 });
}
