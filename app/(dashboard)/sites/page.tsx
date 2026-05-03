import Link from 'next/link';
import { Plus, ExternalLink, Globe } from 'lucide-react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SiteRowActions } from '@/components/sites/SiteRowActions';
import { Button } from '@/components/ui/button';
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

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const sites = await prisma.website.findMany({
    where: { userId: session.user.id },
    include: { profile: true, _count: { select: { articles: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sites WordPress</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gérez vos sites connectés
          </p>
        </div>
        <Button asChild>
          <Link href="/sites/new">
            <Plus className="h-4 w-4" /> Ajouter un site
          </Link>
        </Button>
      </div>

      {sites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Globe className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Aucun site connecté</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Connectez un site WordPress pour commencer à publier automatiquement.
            </p>
            <Button asChild className="mt-5" size="sm">
              <Link href="/sites/new">
                <Plus className="h-4 w-4" /> Connecter un premier site
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Auto</TableHead>
                <TableHead className="text-right">Articles</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/sites/${site.id}/profile`}
                      className="hover:text-primary transition-colors"
                    >
                      {site.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors text-xs"
                    >
                      {site.url.replace(/^https?:\/\//, '')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={site.status} />
                  </TableCell>
                  <TableCell>
                    {site.profile?.autoMode ? (
                      <Badge variant="success">ON</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        OFF
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right num text-muted-foreground">
                    {site._count.articles}
                  </TableCell>
                  <TableCell className="text-right">
                    <SiteRowActions
                      siteId={site.id}
                      isActive={site.status === 'ACTIVE'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
