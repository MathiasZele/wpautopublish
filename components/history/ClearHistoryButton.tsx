'use client';

import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ClearHistoryButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClear() {
    if (
      !confirm(
        "Êtes-vous sûr de vouloir vider tout l'historique ? Cette action est irréversible.",
      )
    )
      return;

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
    <Button
      variant="outline"
      size="sm"
      onClick={handleClear}
      disabled={loading}
      className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {loading ? 'Suppression…' : "Vider l'historique"}
    </Button>
  );
}
