'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

export function ClearHistoryButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClear() {
    if (!confirm('Êtes-vous sûr de vouloir vider tout l\'historique ? Cette action est irréversible.')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/history/clear', { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Historique vidé');
      router.refresh();
    } catch (e) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClear}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
    >
      <Trash2 size={16} />
      {loading ? 'Suppression...' : 'Vider l\'historique'}
    </button>
  );
}
