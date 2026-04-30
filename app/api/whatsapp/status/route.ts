import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getWhatsAppStatus } from '@/lib/evolution';

const INSTANCE_NAME = process.env.WHATSAPP_INSTANCE_NAME || 'WPAutoPublish';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const status = await getWhatsAppStatus(INSTANCE_NAME);
  return NextResponse.json(status);
}
