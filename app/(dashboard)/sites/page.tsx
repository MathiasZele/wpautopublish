import Link from 'next/link';
import { Plus, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SiteRowActions } from '@/components/sites/SiteRowActions';

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  const session = await auth();
  const sites = await prisma.website.findMany({
    where: { userId: session!.user.id },
    include: { profile: true, _count: { select: { articles: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sites WordPress</h1>
          <p className="text-gray-500 text-sm">Gérez vos sites connectés</p>
        </div>
        <Link
          href="/sites/new"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Ajouter un site
        </Link>
      </div>

      {sites.length === 0 ? (
        <div className="bg-white border rounded-xl p-12 text-center">
          <p className="text-gray-500 mb-4">Aucun site connecté pour le moment.</p>
          <Link
            href="/sites/new"
            className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            <Plus size={16} /> Connecter un premier site
          </Link>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3">Nom</th>
                <th className="px-6 py-3">URL</th>
                <th className="px-6 py-3">Statut</th>
                <th className="px-6 py-3">Auto</th>
                <th className="px-6 py-3">Articles</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sites.map((site) => (
                <tr key={site.id}>
                  <td className="px-6 py-4 font-medium">
                    <Link href={`/sites/${site.id}/profile`} className="hover:text-brand-600">
                      {site.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-gray-600 hover:text-brand-600"
                    >
                      {site.url.replace(/^https?:\/\//, '')}
                      <ExternalLink size={12} />
                    </a>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={site.status} />
                  </td>
                  <td className="px-6 py-4 text-xs">
                    {site.profile?.autoMode ? (
                      <span className="text-green-600 font-medium">ON</span>
                    ) : (
                      <span className="text-gray-400">OFF</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{site._count.articles}</td>
                  <td className="px-6 py-4 text-right">
                    <SiteRowActions siteId={site.id} isActive={site.status === 'ACTIVE'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
