'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'wpa-theme';

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as 'light' | 'dark' | null) ?? null;
    const initial =
      saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  if (!theme) {
    // Évite le flash : on attend l'effet client avant de rendre l'icône.
    return <Button variant="ghost" size="icon" disabled className="h-8 w-8" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={toggle}
      title={theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
