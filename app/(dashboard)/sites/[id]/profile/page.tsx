import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProfileForm } from '@/components/sites/ProfileForm';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

export default async function SiteProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const site = await prisma.website.findFirst({
    where: { id: params.id, userId: session!.user.id },
    include: { profile: true },
  });
  if (!site) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link href="/sites">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour aux sites
        </Link>
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{site.name}</h1>
            <StatusBadge status={site.status} />
          </div>
          <a
            href={site.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {site.url}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <ProfileForm
        siteId={site.id}
        initial={{
          language: site.profile?.language ?? 'fr',
          tone: site.profile?.tone ?? 'informatif',
          topics: site.profile?.topics ?? [],
          articlesPerDay: site.profile?.articlesPerDay ?? 1,
          autoMode: site.profile?.autoMode ?? false,
          customPrompt: site.profile?.customPrompt ?? '',
          newsApiQuery: site.profile?.newsApiQuery ?? '',
          maxArticleAgeHours: site.profile?.maxArticleAgeHours ?? 72,
          defaultCategoryIds: site.profile?.defaultCategoryIds ?? [],
          autoImage: site.profile?.autoImage ?? true,
          preferredProvider: site.profile?.preferredProvider ?? 'AUTO',
        }}
      />
    </div>
  );
}
