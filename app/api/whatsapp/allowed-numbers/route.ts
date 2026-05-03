import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  phoneNumber: z.string().min(5).max(20).regex(/^\d+$/, 'Numérique uniquement'),
  label: z.string().max(50).optional(),
});

// GET — list allowed numbers (de l'utilisateur connecté uniquement)
export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const numbers = await prisma.whatsAppAllowedNumber.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(numbers);
}

// POST — add a new number scoped to the current user
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const entry = await prisma.whatsAppAllowedNumber.create({
      data: {
        userId: session.user.id,
        phoneNumber: parsed.data.phoneNumber,
        label: parsed.data.label ?? null,
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e: any) {
    // P2002 = violation de la contrainte unique sur phoneNumber.
    // Comme phoneNumber est globalement unique, le numéro est soit déjà chez ce user,
    // soit chez un autre. On reste vague côté message pour ne pas leak d'info cross-tenant.
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Ce numéro est déjà associé à un autre compte.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Erreur lors de l\'ajout du numéro.' }, { status: 500 });
  }
}
