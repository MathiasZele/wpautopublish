'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LayoutDashboard, Globe, Send, History, MessageCircle, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

const links = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/sites', label: 'Sites', icon: Globe },
  { href: '/publish', label: 'Publier', icon: Send },
  { href: '/history', label: 'Historique', icon: History },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

export function MobileNav({ userEmail }: { userEmail?: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Fermer le menu lors du changement de page
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      <header className="flex items-center justify-between p-4 bg-white border-b sticky top-0 z-30">
        <h1 className="text-xl font-bold text-brand-600 font-outfit">WP AutoPublish</h1>
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          <Menu size={24} />
        </button>
      </header>

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={`fixed top-0 right-0 bottom-0 w-72 bg-white z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full shadow-none'}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b flex items-center justify-between">
            <span className="font-bold text-gray-900 font-outfit">Menu</span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {links.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-base transition ${
                    active
                      ? 'bg-brand-50 text-brand-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={20} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="p-6 border-t bg-slate-50">
            {userEmail && <p className="text-sm text-gray-500 mb-4 truncate">{userEmail}</p>}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-gray-600 hover:text-red-600 hover:border-red-100 hover:bg-red-50 transition shadow-sm"
            >
              <LogOut size={18} />
              Déconnexion
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
