import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logoutWhatsApp } from '@/lib/evolution';

const INSTANCE_NAME = process.env.WHATSAPP_INSTANCE_NAME || 'WPAutoPublish';

export async function POST() {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

  const success = await logoutWhatsApp(INSTANCE_NAME);
  if (!success) {
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
