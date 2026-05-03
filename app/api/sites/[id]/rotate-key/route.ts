import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';

/**
 * POST /api/sites/[id]/rotate-key
 *
 * Régénère le `customEndpointKey` du site. La nouvelle clé est renvoyée en
 * clair une seule fois (display-once). L'utilisateur doit ensuite la coller
 * dans wp-admin → Réglages → WP AutoPublish, sinon la publication WP cessera
 * de fonctionner pour ce site.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const site = await prisma.website.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true, name: true },
  });
  if (!site) return new NextResponse('Not Found', { status: 404 });

  const newSecret = randomBytes(24).toString('hex');

  await prisma.website.update({
    where: { id: site.id },
    data: { customEndpointKey: encrypt(newSecret) },
  });

  return NextResponse.json({
    siteId: site.id,
    siteName: site.name,
    endpointSecret: newSecret,
    warning: 'Cette clé ne sera plus jamais affichée. Copiez-la maintenant dans wp-admin → Réglages → WP AutoPublish.',
  });
}
