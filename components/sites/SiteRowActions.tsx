'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Settings, Trash2, Zap, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function SiteRowActions({
  siteId,
  isActive,
}: {
  siteId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'test' | 'delete' | 'run' | null>(null);

  async function handleTest() {
    setBusy('test');
    try {
      const res = await fetch(`/api/sites/${siteId}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) toast.success('Connexion OK');
      else toast.error(`Échec : ${data.error ?? 'inconnue'}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleRun() {
    const raw = prompt("Combien d'articles à publier maintenant ?", '3');
    if (!raw) return;
    const count = parseInt(raw, 10);
    if (Number.isNaN(count) || count < 1 || count > 50) {
      toast.error('Nombre invalide (1-50)');
      return;
    }
    setBusy('run');
    try {
      const res = await fetch(`/api/sites/${siteId}/run-auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, spacingSeconds: 60 }),
      });
      if (res.ok) {
        const { enqueued } = await res.json();
        toast.success(`${enqueued} article${enqueued > 1 ? 's' : ''} mis en file`);
      } else {
        const { error } = await res.json().catch(() => ({ error: 'Erreur' }));
        toast.error(error || 'Échec');
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce site ? Cette action est irréversible.')) return;
    setBusy('delete');
    try {
      const res = await fetch(`/api/sites/${siteId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Site supprimé');
        router.refresh();
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="inline-flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleTest}
            disabled={busy !== null}
          >
            {busy === 'test' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Tester la connexion</TooltipContent>
      </Tooltip>

      {isActive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-warning hover:text-warning hover:bg-warning/10"
              onClick={handleRun}
              disabled={busy !== null}
            >
              {busy === 'run' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Lancer publication auto</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/sites/${siteId}/profile`}>
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Configurer</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={busy !== null}
          >
            {busy === 'delete' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Supprimer</TooltipContent>
      </Tooltip>
    </div>
  );
}
