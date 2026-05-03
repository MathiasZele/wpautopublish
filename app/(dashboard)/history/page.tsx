import {
  ExternalLink,
  Newspaper,
  Image as ImageIcon,
  Search,
  DollarSign,
  Cpu,
  CheckCircle2,
  XCircle,
  Tag,
  Folder,
  AlertTriangle,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ClearHistoryButton } from '@/components/history/ClearHistoryButton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatsCard } from '@/components/ui/StatsCard';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  site?: string;
  status?: string;
  mode?: string;
  page?: string;
  q?: string;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const userId = session!.user.id;

  const page = Math.max(1, Number(searchParams.page ?? '1'));
  const where = {
    website: { userId },
    ...(searchParams.site ? { websiteId: searchParams.site } : {}),
    ...(searchParams.status
      ? { status: searchParams.status as 'SUCCESS' | 'FAILED' | 'PENDING' }
      : {}),
    ...(searchParams.mode ? { mode: searchParams.mode as 'AUTO' | 'MANUAL' } : {}),
    ...(searchParams.q
      ? { title: { contains: searchParams.q, mode: 'insensitive' as const } }
      : {}),
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
    prisma.articleLog.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const successCount = byStatus.find((s) => s.status === 'SUCCESS')?._count ?? 0;
  const failCount = (stats._count.id || 0) - successCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Historique & Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total.toLocaleString()} publication{total > 1 ? 's' : ''} enregistrée
            {total > 1 ? 's' : ''}
          </p>
        </div>
        <ClearHistoryButton />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard
          label="Coût total"
          value={`$${(stats._sum.estimatedCost || 0).toFixed(2)}`}
          icon={DollarSign}
        />
        <StatsCard
          label="Tokens"
          value={(
            (stats._sum.inputTokens || 0) + (stats._sum.outputTokens || 0)
          ).toLocaleString()}
          icon={Cpu}
        />
        <StatsCard label="Succès" value={successCount} icon={CheckCircle2} />
        <StatsCard label="Échecs" value={failCount} icon={XCircle} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap gap-2 items-end">
            <div className="relative flex-grow min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={searchParams.q ?? ''}
                placeholder="Rechercher par titre…"
                className="pl-8"
              />
            </div>
            <select
              name="site"
              defaultValue={searchParams.site ?? ''}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">Tous les sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={searchParams.status ?? ''}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">Tous les statuts</option>
              <option value="SUCCESS">Succès</option>
              <option value="FAILED">Échec</option>
              <option value="PENDING">En attente</option>
            </select>
            <select
              name="mode"
              defaultValue={searchParams.mode ?? ''}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">Tous les modes</option>
              <option value="AUTO">Auto</option>
              <option value="MANUAL">Manuel</option>
            </select>
            <Button type="submit">Filtrer</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Site</TableHead>
              <TableHead colSpan={2}>Article</TableHead>
              <TableHead>Taxonomie</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Détails</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground italic">
                  Aucun résultat trouvé pour ces filtres
                </TableCell>
              </TableRow>
            )}
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  <div>{log.createdAt.toLocaleDateString('fr-FR')}</div>
                  <div className="text-[10px] opacity-70">
                    {log.createdAt.toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-medium">{log.website.name}</TableCell>
                <TableCell className="w-12">
                  {log.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={log.imageUrl}
                      alt=""
                      className="h-10 w-10 rounded-md object-cover bg-muted border"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground/50 border">
                      <ImageIcon className="h-3.5 w-3.5" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-sm">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-medium" title={log.title}>
                      {log.title}
                    </div>
                    {log.wpPostUrl && (
                      <a
                        href={log.wpPostUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-shrink-0 text-primary hover:opacity-70 transition-opacity"
                        title="Voir l'article"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {log.errorMessage && (
                    <Badge
                      variant="destructive"
                      className="mt-1 max-w-full truncate text-[10px]"
                      title={log.errorMessage}
                    >
                      {log.errorMessage}
                    </Badge>
                  )}
                  {(log.warnings || []).length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {log.warnings.map((w, i) => (
                        <div
                          key={i}
                          className="text-[10px] text-warning font-medium bg-warning/10 px-2 py-0.5 rounded border border-warning/20 inline-flex items-center gap-1 max-w-full"
                          title={w}
                        >
                          <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />
                          <span className="truncate">{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-[180px]">
                  <div className="space-y-1">
                    {(log.categoryIds || []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {log.categoryIds.map((id) => (
                          <Badge key={id} variant="outline" className="text-[9px] py-0 h-4 gap-0.5">
                            <Folder className="h-2.5 w-2.5" /> ID:{id}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {(log.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {log.tags.slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[9px] py-0 h-4 gap-0.5"
                          >
                            <Tag className="h-2.5 w-2.5" /> {tag}
                          </Badge>
                        ))}
                        {log.tags.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">
                            +{log.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    {!(log.categoryIds || []).length && !(log.tags || []).length && (
                      <span className="text-muted-foreground/50 text-xs">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-col gap-1">
                    {log.sourceUrl && log.sourceName ? (
                      <a
                        href={log.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        title={log.sourceName}
                      >
                        <Newspaper className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate max-w-[80px]">{log.sourceName}</span>
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50 italic">Direct</span>
                    )}
                    {log.providerName && (
                      <Badge variant="outline" className="text-[9px] h-4 self-start">
                        {log.providerName}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="num text-muted-foreground text-[10px]">
                    {(log.inputTokens + log.outputTokens).toLocaleString()} tokens
                  </div>
                  <div className="num font-semibold">${log.estimatedCost.toFixed(3)}</div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={log.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-1 pt-4">
          {Array.from({ length: Math.min(10, totalPages) }).map((_, i) => {
            const p = i + 1;
            const params = new URLSearchParams({
              ...(searchParams.site ? { site: searchParams.site } : {}),
              ...(searchParams.status ? { status: searchParams.status } : {}),
              ...(searchParams.mode ? { mode: searchParams.mode } : {}),
              ...(searchParams.q ? { q: searchParams.q } : {}),
              page: String(p),
            });
            const isActive = p === page;
            return (
              <Button
                key={p}
                asChild
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                className="h-8 w-8 p-0 num"
              >
                <a href={`?${params.toString()}`}>{p}</a>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
