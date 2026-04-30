import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  try {
    await prisma.articleLog.deleteMany({
      where: {
        website: {
          userId: session.user.id,
        },
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to clear history:', error);
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }
}
