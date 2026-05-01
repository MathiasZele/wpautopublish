import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { MobileNav } from '@/components/dashboard/MobileNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50/50">
      <Sidebar userEmail={session.user.email} />
      <MobileNav userEmail={session.user.email} />
      
      <main className="flex-1 overflow-x-hidden">
        <div className="w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <div className="animate-fade-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
