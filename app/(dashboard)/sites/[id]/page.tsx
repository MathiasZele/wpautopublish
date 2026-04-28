import { redirect } from 'next/navigation';

export default function SiteDetailPage({ params }: { params: { id: string } }) {
  redirect(`/sites/${params.id}/profile`);
}
