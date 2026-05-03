import { ExternalLink, Newspaper, Image as ImageIcon, Search, DollarSign, Cpu, CheckCircle2, XCircle, Tag, Folder, AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ClearHistoryButton } from '@/components/history/ClearHistoryButton';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  site?: string;
  status?: string;
  mode?: string;
  page?: string;
  q?: string;
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
    ...(searchParams.q ? { title: { contains: searchParams.q, mode: 'insensitive' as const } } : {}),
  };

  const [logs, total, sites, stats, byStatus] = await Promise.all([
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
    prisma.articleLog.aggregate({
      where,
      _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
      _count: { id: true },
    }),
    // groupBy en parallèle avec total et stats → on évite un round-trip DB séparé pour successCount
    prisma.articleLog.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const successCount = byStatus.find((s) => s.status === 'SUCCESS')?._count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Historique & Logs</h1>
          <p className="text-gray-500 text-sm">{total} publication(s) enregistrée(s)</p>
        </div>
        <ClearHistoryButton />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
            <DollarSign size={20} />
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Coût Total</div>
            <div className="text-lg font-bold">${(stats._sum.estimatedCost || 0).toFixed(2)}</div>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
            <Cpu size={20} />
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Tokens</div>
            <div className="text-lg font-bold">
              {((stats._sum.inputTokens || 0) + (stats._sum.outputTokens || 0)).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Succès</div>
            <div className="text-lg font-bold">{successCount}</div>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600">
            <XCircle size={20} />
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Échecs</div>
            <div className="text-lg font-bold">{(stats._count.id || 0) - successCount}</div>
          </div>
        </div>
      </div>

      <form className="bg-white border rounded-xl p-4 flex flex-wrap gap-3 text-sm shadow-sm">
        <div className="relative flex-grow min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Rechercher par titre..."
            className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>
        <select name="site" defaultValue={searchParams.site ?? ''} className="px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Tous les sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={searchParams.status ?? ''} className="px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Tous les statuts</option>
          <option value="SUCCESS">Succès</option>
          <option value="FAILED">Échec</option>
          <option value="PENDING">En attente</option>
        </select>
        <select name="mode" defaultValue={searchParams.mode ?? ''} className="px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Tous les modes</option>
          <option value="AUTO">Auto</option>
          <option value="MANUAL">Manuel</option>
        </select>
        <button type="submit" className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium transition-colors">
          Filtrer
        </button>
      </form>

      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 font-bold border-b">
              <tr>
                <th className="px-4 py-4">Date</th>
                <th className="px-4 py-4">Site</th>
                <th className="px-4 py-4" colSpan={2}>Article</th>
                <th className="px-4 py-4">Taxonomie</th>
                <th className="px-4 py-4">Source</th>
                <th className="px-4 py-4">Détails</th>
                <th className="px-4 py-4">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 italic">
                    Aucun résultat trouvé pour ces filtres
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4 text-xs text-gray-500 whitespace-nowrap">
                    {log.createdAt.toLocaleDateString('fr-FR')}
                    <div className="text-[10px] opacity-75">{log.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-xs">{log.website.name}</div>
                  </td>
                  <td className="px-4 py-4 w-12">
                    {log.imageUrl ? (
                      <img
                        src={log.imageUrl}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover bg-gray-100 shadow-sm border"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-300 border">
                        <ImageIcon size={14} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 max-w-sm">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-semibold text-gray-900" title={log.title}>{log.title}</div>
                      {log.wpPostUrl && (
                        <a
                          href={log.wpPostUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-shrink-0 text-brand-600 hover:scale-110 transition-transform"
                          title="Voir l'article"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                    {log.errorMessage && (
                      <div className="text-[11px] text-red-500 mt-1 font-medium bg-red-50 px-2 py-0.5 rounded border border-red-100 inline-block max-w-full truncate">
                        {log.errorMessage}
                      </div>
                    )}
                    {(log.warnings || []).length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {log.warnings.map((w, i) => (
                          <div
                            key={i}
                            className="text-[10px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-100 inline-flex items-center gap-1 max-w-full"
                            title={w}
                          >
                            <AlertTriangle size={10} className="flex-shrink-0" />
                            <span className="truncate">{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 max-w-[180px]">
                    <div className="space-y-1">
                      {(log.categoryIds || []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {log.categoryIds.map(id => (
                            <span key={id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold border border-blue-100">
                              <Folder size={8} /> ID:{id}
                            </span>
                          ))}
                        </div>
                      )}
                      {(log.tags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {log.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded text-[9px] font-medium border border-gray-100">
                              <Tag size={8} /> {tag}
                            </span>
                          ))}
                          {log.tags && log.tags.length > 3 && <span className="text-[9px] text-gray-400">+{log.tags.length - 3}</span>}
                        </div>
                      )}
                      {!(log.categoryIds || []).length && !(log.tags || []).length && <span className="text-gray-300 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <div className="flex flex-col gap-1">
                      {log.sourceUrl && log.sourceName ? (
                        <a
                          href={log.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                          title={log.sourceName}
                        >
                          <Newspaper size={12} className="flex-shrink-0" />
                          <span className="truncate max-w-[80px]">{log.sourceName}</span>
                        </a>
                      ) : (
                        <span className="text-gray-300 italic">Direct</span>
                      )}
                      {log.providerName && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100 self-start">
                          {log.providerName}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <div className="text-gray-600 font-mono text-[10px]">{(log.inputTokens + log.outputTokens).toLocaleString()} tokens</div>
                    <div className="font-bold text-gray-900">${log.estimatedCost.toFixed(3)}</div>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={log.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          {Array.from({ length: Math.min(10, totalPages) }).map((_, i) => {
            const p = i + 1;
            const params = new URLSearchParams({
              ...(searchParams.site ? { site: searchParams.site } : {}),
              ...(searchParams.status ? { status: searchParams.status } : {}),
              ...(searchParams.mode ? { mode: searchParams.mode } : {}),
              ...(searchParams.q ? { q: searchParams.q } : {}),
              page: String(p),
            });
            return (
              <a
                key={p}
                href={`?${params.toString()}`}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                  p === page ? 'bg-brand-600 text-white border-brand-600 shadow-md scale-105' : 'bg-white hover:bg-gray-50 text-gray-600'
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
