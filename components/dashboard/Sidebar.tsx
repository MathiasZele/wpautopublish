'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Globe, Send, History, LogOut, MessageCircle } from 'lucide-react';
import { signOut } from 'next-auth/react';

const links = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/sites', label: 'Sites', icon: Globe },
  { href: '/publish', label: 'Publier', icon: Send },
  { href: '/history', label: 'Historique', icon: History },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

export function Sidebar({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-72 bg-white border-r min-h-screen flex-col sticky top-0 h-screen">
      <div className="p-8">
        <h1 className="text-2xl font-bold text-brand-600 font-outfit tracking-tight">WP AutoPublish</h1>
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">Admin Panel</p>
      </div>
      
      <nav className="flex-1 px-4 space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold px-3 mb-2">Navigation</div>
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 group ${
                active
                  ? 'bg-brand-50 text-brand-600 font-semibold shadow-sm shadow-brand-100/50'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={18} className={`${active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-6 m-4 bg-slate-50 rounded-2xl border border-slate-100">
        {userEmail && (
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Session</p>
            <p className="text-xs text-slate-700 font-medium truncate">{userEmail}</p>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors group"
        >
          <LogOut size={16} className="text-slate-400 group-hover:text-red-500" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
