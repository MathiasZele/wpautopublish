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
    <aside className="w-64 bg-white border-r min-h-screen flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold text-brand-600">WP AutoPublish</h1>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t">
        {userEmail && <p className="text-xs text-gray-500 mb-2 truncate">{userEmail}</p>}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 transition"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
