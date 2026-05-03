'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  LayoutDashboard,
  Globe,
  Send,
  History,
  MessageCircle,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from './sheet-mobile';
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

export function MobileNav({ userEmail }: { userEmail?: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      <header className="flex items-center justify-between border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 px-4 py-3 sticky top-0 z-30">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold">WP AutoPublish</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div className="flex flex-col h-full">
                <div className="px-2 py-3">
                  <div className="flex items-center gap-2.5 px-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold leading-tight">WP AutoPublish</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin</div>
                    </div>
                  </div>
                </div>
                <Separator />
                <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
                  {links.map(({ href, label, icon: Icon, exact }) => {
                    const active = exact ? pathname === href : pathname?.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                          active
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
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
                      <div className="text-xs font-medium truncate">{userEmail}</div>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => signOut({ callbackUrl: '/login' })}
                  >
                    <LogOut className="h-4 w-4" />
                    Déconnexion
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </div>
  );
}
