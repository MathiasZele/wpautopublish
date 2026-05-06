import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resyncEvolutionWebhook } from '@/lib/evolution';

const INSTANCE_NAME = process.env.WHATSAPP_INSTANCE_NAME || 'WPAutoPublish';

export async function POST() {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const result = await resyncEvolutionWebhook(INSTANCE_NAME);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
