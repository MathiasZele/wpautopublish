'use client';

import { useEffect, useState } from 'react';
import { RefreshCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface WPCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export function CategoryPicker({
  siteId,
  selected,
  onChange,
}: {
  siteId: string;
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [cats, setCats] = useState<WPCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/categories`);
      if (res.ok) {
        setCats(await res.json());
      } else {
        const { error: e } = await res.json().catch(() => ({ error: 'Erreur' }));
        setError(e || 'Erreur de chargement');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setCats([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Catégories pour cette publication</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={load}
          disabled={loading}
          className="h-7 text-xs"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCcw className="h-3 w-3" />
          )}
          {loading ? '…' : 'Recharger'}
        </Button>
      </div>
      {error ? (
        <div className="text-xs text-destructive border border-destructive/30 bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </div>
      ) : cats.length === 0 ? (
        <div className="text-xs text-muted-foreground border rounded-md px-3 py-2">
          {loading ? 'Chargement…' : 'Aucune catégorie'}
        </div>
      ) : (
        <div className="rounded-md border p-3 max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cats.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground transition-colors"
            >
              <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
              <span className="truncate flex-1">{c.name}</span>
              <span className="text-xs text-muted-foreground">({c.count})</span>
            </label>
          ))}
        </div>
      )}
      {selected.length === 0 && cats.length > 0 && (
        <p className="text-xs text-warning">
          Aucune catégorie sélectionnée → l'article ira dans la catégorie par défaut WordPress.
        </p>
      )}
    </div>
  );
}
