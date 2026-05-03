import Link from 'next/link';
import { Send } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PublishTabs } from '@/components/publish/PublishTabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
        <h1 className="text-2xl font-semibold tracking-tight">Publication</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Génère et publie des articles à la demande.
        </p>
      </div>

      {sitesForUI.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Send className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Aucun site actif</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Connecte un site WordPress et teste la connexion avant de publier.
            </p>
            <Button asChild className="mt-5" size="sm">
              <Link href="/sites">Aller aux sites</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PublishTabs sites={sitesForUI} />
      )}
    </div>
  );
}
