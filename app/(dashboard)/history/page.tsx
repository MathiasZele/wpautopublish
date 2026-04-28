import { ExternalLink } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  site?: string;
  status?: string;
  mode?: string;
  page?: string;
}

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const userId = session!.user.id;

  const page = Math.max(1, Number(searchParams.page ?? '1'));
  const where = {
    website: { userId },
    ...(searchParams.site ? { websiteId: searchParams.site } : {}),
    ...(searchParams.status ? { status: searchParams.status as 'SUCCESS' | 'FAILED' | 'PENDING' } : {}),
    ...(searchParams.mode ? { mode: searchParams.mode as 'AUTO' | 'MANUAL' } : {}),
  };

  const [logs, total, sites] = await Promise.all([
    prisma.articleLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { website: { select: { id: true, name: true, url: true } } },
    }),
    prisma.articleLog.count({ where }),
    prisma.website.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historique</h1>
        <p className="text-gray-500 text-sm">{total} entrée(s)</p>
      </div>

      <form className="bg-white border rounded-xl p-4 flex flex-wrap gap-3 text-sm">
        <select name="site" defaultValue={searchParams.site ?? ''} className="px-3 py-1.5 border rounded">
          <option value="">Tous les sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={searchParams.status ?? ''} className="px-3 py-1.5 border rounded">
          <option value="">Tous les statuts</option>
          <option value="SUCCESS">Succès</option>
          <option value="FAILED">Échec</option>
          <option value="PENDING">En attente</option>
        </select>
        <select name="mode" defaultValue={searchParams.mode ?? ''} className="px-3 py-1.5 border rounded">
          <option value="">Tous les modes</option>
          <option value="AUTO">Auto</option>
          <option value="MANUAL">Manuel</option>
        </select>
        <button type="submit" className="px-4 py-1.5 bg-brand-600 text-white rounded">
          Filtrer
        </button>
      </form>

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Titre</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Tokens</th>
              <th className="px-4 py-3">Coût</th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  Aucune entrée
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {log.createdAt.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-xs">{log.website.name}</td>
                <td className="px-4 py-3 max-w-md">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-medium">{log.title}</div>
                    {log.wpPostUrl && (
                      <a
                        href={log.wpPostUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-shrink-0 text-brand-600 hover:text-brand-700"
                        title="Voir l'article publié"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  {log.errorMessage && (
                    <div className="text-xs text-red-600 truncate">{log.errorMessage}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">{log.mode}</td>
                <td className="px-4 py-3 text-xs">
                  {(log.inputTokens + log.outputTokens).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs">${log.estimatedCost.toFixed(4)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={log.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            const params = new URLSearchParams({
              ...(searchParams.site ? { site: searchParams.site } : {}),
              ...(searchParams.status ? { status: searchParams.status } : {}),
              ...(searchParams.mode ? { mode: searchParams.mode } : {}),
              page: String(p),
            });
            return (
              <a
                key={p}
                href={`?${params.toString()}`}
                className={`px-3 py-1.5 rounded border ${
                  p === page ? 'bg-brand-600 text-white border-brand-600' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {p}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
