import Link from 'next/link';
import { Globe, FileText, Coins, Zap, ExternalLink, Send, Newspaper, Image as ImageIcon } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StatsCard } from '@/components/ui/StatsCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TokenChart } from '@/components/dashboard/TokenChart';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [activeSites, totalArticles, monthAgg, recent, dailyRows] = await Promise.all([
    prisma.website.count({ where: { userId, status: 'ACTIVE' } }),
    prisma.articleLog.count({ where: { website: { userId }, status: 'SUCCESS' } }),
    prisma.articleLog.aggregate({
      where: { website: { userId }, createdAt: { gte: monthStart } },
      _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
    }),
    prisma.articleLog.findMany({
      where: { website: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { website: { select: { name: true } } },
    }),
    prisma.articleLog.findMany({
      where: {
        website: { userId },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { createdAt: true, inputTokens: true, outputTokens: true, estimatedCost: true },
    }),
  ]);

  const monthTokens = (monthAgg._sum.inputTokens ?? 0) + (monthAgg._sum.outputTokens ?? 0);
  const monthCost = monthAgg._sum.estimatedCost ?? 0;

  const buckets = new Map<string, { tokens: number; cost: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(5, 10);
    buckets.set(key, { tokens: 0, cost: 0 });
  }
  for (const row of dailyRows) {
    const key = row.createdAt.toISOString().slice(5, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.tokens += (row.inputTokens ?? 0) + (row.outputTokens ?? 0);
      bucket.cost += row.estimatedCost ?? 0;
    }
  }
  const chartData = Array.from(buckets.entries()).map(([date, v]) => ({
    date,
    tokens: v.tokens,
    cost: v.cost,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-500 text-sm">Vue d'ensemble de votre activité</p>
        </div>
        <Link
          href="/publish"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Send size={14} /> Publier
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Sites actifs" value={activeSites} icon={Globe} />
        <StatsCard label="Articles publiés" value={totalArticles} icon={FileText} />
        <StatsCard label="Tokens ce mois" value={monthTokens.toLocaleString()} icon={Zap} />
        <StatsCard
          label="Coût estimé ce mois"
          value={`$${monthCost.toFixed(4)}`}
          icon={Coins}
          hint="OpenAI"
        />
      </div>

      <TokenChart data={chartData} />

      <div className="bg-white rounded-xl border">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="font-semibold">Activité récente</h3>
          <Link href="/history" className="text-xs text-brand-600 hover:underline">
            Voir tout →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">Aucune publication pour l'instant.</div>
        ) : (
          <ul className="divide-y">
            {recent.map((log) => (
              <li key={log.id} className="px-6 py-3 flex items-center justify-between text-sm gap-3">
                {log.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={log.imageUrl}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-300">
                    <ImageIcon size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{log.title}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                    <span>{log.website.name}</span>
                    <span>·</span>
                    <span>{log.mode}</span>
                    <span>·</span>
                    <span>{log.createdAt.toLocaleString('fr-FR')}</span>
                    {log.sourceName && log.sourceUrl && (
                      <>
                        <span>·</span>
                        <a
                          href={log.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                        >
                          <Newspaper size={11} />
                          {log.sourceName}
                        </a>
                      </>
                    )}
                    {log.providerName && (
                      <>
                        <span>·</span>
                        <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100">
                          {log.providerName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {log.wpPostUrl && (
                  <a
                    href={log.wpPostUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline whitespace-nowrap"
                  >
                    Voir <ExternalLink size={12} />
                  </a>
                )}
                <StatusBadge status={log.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
