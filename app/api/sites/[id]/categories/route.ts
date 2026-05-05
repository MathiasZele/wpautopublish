import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { fetchWordPressCategories } from '@/lib/wordpress';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const site = await prisma.website.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!site) return new NextResponse('Not Found', { status: 404 });

  try {
    const password = decrypt(site.wpAppPassword);
    const categories = await fetchWordPressCategories(site.url, site.wpUsername, password);
    return NextResponse.json(categories);
  } catch (e: any) {
    console.error('fetchWordPressCategories failed', e);
    if (e?.name === 'CloudflareBlockError') {
      return NextResponse.json(
        {
          error:
            'Bloqué par Cloudflare Bot Protection. Désactive Bot Fight Mode ou crée la WAF custom rule.',
        },
        { status: 502 },
      );
    }
    const message = e?.message ?? '';
    const hint = message.includes('403')
      ? "Accès refusé (403) — vérifiez les identifiants WP, que l'API REST est activée, et qu'aucun plugin de sécurité ne bloque les requêtes."
      : `Impossible de récupérer les catégories : ${message.slice(0, 150)}`;
    return NextResponse.json({ error: hint }, { status: 502 });
  }
}
