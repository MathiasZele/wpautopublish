import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// DELETE — remove a number by id (scopé par userId)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  // deleteMany permet de filtrer par userId ET id en une seule requête.
  // Si rien ne match (pas le bon user, ou id inexistant), count sera 0.
  const result = await prisma.whatsAppAllowedNumber.deleteMany({
    where: { id: params.id, userId: session.user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Numéro introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
