import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PublishTabs } from '@/components/publish/PublishTabs';

export const dynamic = 'force-dynamic';

export default async function PublishPage() {
  const session = await auth();
  const sites = await prisma.website.findMany({
    where: { userId: session!.user.id, status: 'ACTIVE' },
    include: { profile: true },
    orderBy: { name: 'asc' },
  });

  const sitesForUI = sites.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    hasNewsQuery: !!s.profile?.newsApiQuery,
    hasTopics: (s.profile?.topics?.length ?? 0) > 0,
    defaultCategoryIds: s.profile?.defaultCategoryIds ?? [],
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Publication</h1>
        <p className="text-gray-500 text-sm">Génère et publie des articles à la demande.</p>
      </div>

      {sitesForUI.length === 0 ? (
        <div className="bg-white border rounded-xl p-12 text-center text-sm text-gray-500">
          Aucun site actif.{' '}
          <Link href="/sites" className="text-brand-600 hover:underline">
            Connecte d'abord un site
          </Link>{' '}
          et teste la connexion.
        </div>
      ) : (
        <PublishTabs sites={sitesForUI} />
      )}
    </div>
  );
}
