import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logoutWhatsApp } from '@/lib/evolution';

const INSTANCE_NAME = process.env.WHATSAPP_INSTANCE_NAME || 'WPAutoPublish';

export async function POST() {
  const session = await auth();
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const success = await logoutWhatsApp(INSTANCE_NAME);
  if (!success) {
    console.warn('WhatsApp logout from Evolution API failed, but continuing local logout.');
  }
  
  return NextResponse.json({ success: true });
}
