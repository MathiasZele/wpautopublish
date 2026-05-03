import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

// Refresh du rôle depuis la DB toutes les 5 minutes pour qu'une promotion
// ADMIN soit prise en compte sans déconnexion forcée.
const ROLE_REFRESH_INTERVAL_MS = 5 * 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // PrismaAdapter retiré : il est inutile en stratégie JWT pure et embrouillait
  // l'architecture (les tables Account/Session sont là pour Auth.js mais jamais
  // alimentées). On garde uniquement les providers + callbacks.
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        (token as Record<string, unknown>).roleRefreshedAt = Date.now();
      }

      // Refresh périodique du rôle depuis la DB.
      // Sans ça, un user promu en ADMIN gardait son ancien rôle dans le JWT
      // jusqu'à expiration (30j par défaut).
      // ⚠️ Le callback jwt s'exécute aussi dans le middleware Next.js (Edge Runtime)
      // où Prisma ne fonctionne pas. On try/catch : en edge la lookup échoue, on
      // garde le rôle existant, et le refresh aura lieu au prochain hit en Node
      // runtime (server component / route handler).
      const refreshedAt = ((token as Record<string, unknown>).roleRefreshedAt as number | undefined) ?? 0;
      const tokenId = token.id as string | undefined;
      if (tokenId && Date.now() - refreshedAt > ROLE_REFRESH_INTERVAL_MS) {
        try {
          const fresh = await prisma.user.findUnique({
            where: { id: tokenId },
            select: { role: true },
          });
          if (fresh) {
            token.role = fresh.role;
            (token as Record<string, unknown>).roleRefreshedAt = Date.now();
          }
        } catch {
          // Edge runtime ou DB momentanément indisponible : on conserve le rôle JWT actuel.
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
});
