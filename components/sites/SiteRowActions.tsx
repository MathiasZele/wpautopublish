'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Settings, Trash2, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

export function SiteRowActions({ siteId, isActive }: { siteId: string; isActive: boolean }) {
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
    const raw = prompt('Combien d\'articles à publier maintenant ?', '3');
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
    <div className="inline-flex items-center gap-1">
      <button
        onClick={handleTest}
        disabled={busy !== null}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-50"
        title="Tester la connexion"
      >
        <Activity size={16} />
      </button>
      {isActive && (
        <button
          onClick={handleRun}
          disabled={busy !== null}
          className="p-1.5 rounded hover:bg-amber-50 text-amber-600 disabled:opacity-50"
          title="Lancer publication auto"
        >
          <Zap size={16} />
        </button>
      )}
      <Link
        href={`/sites/${siteId}/profile`}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title="Configurer"
      >
        <Settings size={16} />
      </Link>
      <button
        onClick={handleDelete}
        disabled={busy !== null}
        className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-50"
        title="Supprimer"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
