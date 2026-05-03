import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Filet de sécurité global : toute route /api/* qui n'est pas dans la whitelist
 * publique exige une session NextAuth. Ce middleware NE remplace PAS les checks
 * `auth()` + ownership dans les route handlers — il les complète au cas où un
 * développeur en oublie un.
 *
 * Routes publiques explicitement whitelisted (auth interne propre) :
 *   - /api/auth/*           : NextAuth handlers (login, signOut, callback)
 *   - /api/register         : création de compte
 *   - /api/health           : monitoring
 *   - /api/cron/trigger     : protégé par CRON_SECRET (timingSafeEqual)
 *   - /api/webhooks/evolution : protégé par EVOLUTION_WEBHOOK_SECRET (timingSafeEqual)
 */
const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/register',
  '/api/health',
  '/api/cron/trigger',
  '/api/webhooks/',
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // On ne protège que les routes /api/* (les pages dashboard sont déjà gardées
  // par leur layout RSC qui appelle redirect('/login')).
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (isPublicApi(pathname)) return NextResponse.next();

  const session = await auth();
  if (!session?.user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
