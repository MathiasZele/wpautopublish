import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { fetchSiteContext } from '@/lib/wordpress';
import { generateAutoConfig } from '@/lib/autoConfig';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const site = await prisma.website.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { profile: true },
  });
  if (!site) return new NextResponse('Not Found', { status: 404 });

  try {
    const password = decrypt(site.wpAppPassword);
    const ctx = await fetchSiteContext(site.url, site.wpUsername, password);
    const result = await generateAutoConfig(ctx, site.profile?.language ?? 'fr');

    return NextResponse.json({
      newsApiQuery: result.newsApiQuery,
      topics: result.topics,
      reasoning: result.reasoning,
      siteContext: {
        name: ctx.name,
        description: ctx.description,
        categoriesCount: ctx.categories.length,
        recentPostsCount: ctx.recentTitles.length,
      },
    });
  } catch (e) {
    console.error('auto-generate failed', e);
    return NextResponse.json(
      { error: 'Génération automatique impossible. Vérifie que la connexion WP fonctionne.' },
      { status: 502 },
    );
  }
}
