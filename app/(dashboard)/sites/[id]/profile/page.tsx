import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProfileForm } from '@/components/sites/ProfileForm';

export const dynamic = 'force-dynamic';

export default async function SiteProfilePage({ params }: { params: { id: string } }) {
  const session = await auth();
  const site = await prisma.website.findFirst({
    where: { id: params.id, userId: session!.user.id },
    include: { profile: true },
  });
  if (!site) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/sites" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-brand-600">
        <ArrowLeft size={14} /> Retour aux sites
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{site.name}</h1>
        <p className="text-gray-500 text-sm">{site.url}</p>
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
        }}
      />
    </div>
  );
}
