'use client';

import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';

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
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium">Catégories pour cette publication</label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs text-brand-600 hover:underline flex items-center gap-1"
        >
          <RefreshCcw size={12} /> {loading ? '...' : 'Recharger'}
        </button>
      </div>
      {error ? (
        <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      ) : cats.length === 0 ? (
        <div className="text-xs text-gray-500 border rounded-lg px-3 py-2">
          {loading ? 'Chargement…' : 'Aucune catégorie'}
        </div>
      ) : (
        <div className="border rounded-lg p-3 max-h-32 overflow-y-auto grid grid-cols-2 gap-2">
          {cats.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => toggle(c.id)}
                className="accent-brand-600"
              />
              <span className="truncate">{c.name}</span>
              <span className="text-xs text-gray-400">({c.count})</span>
            </label>
          ))}
        </div>
      )}
      {selected.length === 0 && cats.length > 0 && (
        <p className="text-xs text-amber-600 mt-1">
          Aucune catégorie sélectionnée → l'article ira dans la catégorie par défaut WordPress (ex: "Non classé").
        </p>
      )}
    </div>
  );
}
