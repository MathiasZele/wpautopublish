import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { testWordPressConnection } from '@/lib/wordpress';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const site = await prisma.website.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!site) return new NextResponse('Not Found', { status: 404 });

  const password = decrypt(site.wpAppPassword);
  const result = await testWordPressConnection(site.url, site.wpUsername, password);

  await prisma.website.update({
    where: { id: site.id },
    data: {
      status: result.success ? 'ACTIVE' : 'ERROR',
      lastTestedAt: new Date(),
    },
  });

  return NextResponse.json(result);
}
