import Link from 'next/link';
import {
  Globe,
  FileText,
  Coins,
  Zap,
  ExternalLink,
  Send,
  Newspaper,
  History,
  Image as ImageIcon,
  ArrowRight,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StatsCard } from '@/components/ui/StatsCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TokenChart } from '@/components/dashboard/TokenChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

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
      take: 8,
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vue d&apos;ensemble de votre activit&eacute; automatis&eacute;e
          </p>
        </div>
        <Button asChild>
          <Link href="/publish">
            <Send className="h-4 w-4" /> Publier un article
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard label="Sites actifs" value={activeSites} icon={Globe} />
        <StatsCard label="Articles publiés" value={totalArticles} icon={FileText} />
        <StatsCard
          label="Tokens ce mois"
          value={monthTokens.toLocaleString()}
          icon={Zap}
        />
        <StatsCard
          label="Coût estimé"
          value={`$${monthCost.toFixed(4)}`}
          icon={Coins}
          hint="OpenAI ce mois"
        />
      </div>

      <TokenChart data={chartData} />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Activité récente
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/history">
              Tout l&apos;historique <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucune publication pour l&apos;instant.
              <div className="mt-3">
                <Button asChild size="sm">
                  <Link href="/publish">Publier le premier article</Link>
                </Button>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
                >
                  {log.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={log.imageUrl}
                      alt=""
                      className="h-10 w-10 rounded-md object-cover bg-muted flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground/50">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{log.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span>{log.website.name}</span>
                      <span>·</span>
                      <span>{log.mode}</span>
                      <span>·</span>
                      <span>{log.createdAt.toLocaleString('fr-FR')}</span>
                      {log.providerName && (
                        <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">
                          {log.providerName}
                        </Badge>
                      )}
                      {log.sourceName && log.sourceUrl && (
                        <a
                          href={log.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Newspaper className="h-3 w-3" />
                          {log.sourceName}
                        </a>
                      )}
                    </div>
                  </div>
                  {log.wpPostUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="h-8 w-8 flex-shrink-0"
                    >
                      <a href={log.wpPostUrl} target="_blank" rel="noreferrer" title="Voir l'article">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <StatusBadge status={log.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
