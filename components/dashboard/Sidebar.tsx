'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Globe,
  Send,
  History,
  LogOut,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

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
    <aside className="hidden lg:flex w-60 bg-card border-r border-border min-h-screen flex-col sticky top-0 h-screen">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">WP AutoPublish</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Admin
          </div>
        </div>
      </div>

      <Separator />

      <nav className="flex-1 p-3 space-y-0.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-2 py-2">
          Navigation
        </div>
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      <Separator />

      <div className="p-3 space-y-2">
        {userEmail && (
          <div className="px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-0.5">
              Session
            </div>
            <div className="text-xs font-medium text-foreground/90 truncate">
              {userEmail}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </div>
    </aside>
  );
}
