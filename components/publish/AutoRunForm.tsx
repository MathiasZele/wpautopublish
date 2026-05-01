'use client';

import { useEffect, useState } from 'react';
import { Zap, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { CategoryPicker } from './CategoryPicker';
import type { PublishSite } from './PublishTabs';

export function AutoRunForm({ sites }: { sites: PublishSite[] }) {
  const [websiteId, setWebsiteId] = useState(sites[0]?.id ?? '');
  const [count, setCount] = useState(3);
  const [spacing, setSpacing] = useState(60);
  const [selectedCats, setSelectedCats] = useState<number[]>(sites[0]?.defaultCategoryIds ?? []);
  const [autoCategorize, setAutoCategorize] = useState(true);
  const [loading, setLoading] = useState(false);

  const currentSite = sites.find((s) => s.id === websiteId);

  useEffect(() => {
    setSelectedCats(currentSite?.defaultCategoryIds ?? []);
  }, [websiteId, currentSite]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch(`/api/sites/${websiteId}/run-auto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count,
        spacingSeconds: spacing,
        categoryIds: selectedCats,
        autoCategorize,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Erreur' }));
      toast.error(error || 'Erreur lors du lancement');
      return;
    }

    const { enqueued } = await res.json();
    toast.success(`${enqueued} article${enqueued > 1 ? 's' : ''} mis en file. Suivez l\'historique.`, {
      duration: 5000,
    });
  }

  const noSource = currentSite && !currentSite.hasNewsQuery && !currentSite.hasTopics;

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Site cible</label>
        <select
          value={websiteId}
          onChange={(e) => setWebsiteId(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-lg"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.url.replace(/^https?:\/\//, '')}
            </option>
          ))}
        </select>
      </div>

      {noSource && (
        <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Ce site n'a ni requête NewsAPI ni thématiques configurées.
            Va sur le profil du site pour les ajouter.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nombre d'articles</label>
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            required
            className="w-full px-3 py-2 border rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">Entre 1 et 50.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Espacement entre publications (sec)</label>
          <input
            type="number"
            min={0}
            max={3600}
            step={10}
            value={spacing}
            onChange={(e) => setSpacing(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">0 = en parallèle, 60 = un par minute.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 py-2">
        <input
          type="checkbox"
          id="autoCategorize"
          checked={autoCategorize}
          onChange={(e) => setAutoCategorize(e.target.checked)}
          className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
        />
        <label htmlFor="autoCategorize" className="text-sm font-medium text-gray-700 cursor-pointer">
          Laisser l'IA choisir la meilleure catégorie (Intelligent)
        </label>
      </div>

      {websiteId && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {autoCategorize 
              ? "Restreindre le choix de l'IA à ces catégories (optionnel)" 
              : "Catégories forcées"}
          </label>
          <CategoryPicker
            siteId={websiteId}
            selected={selectedCats}
            onChange={setSelectedCats}
          />
          {autoCategorize && selectedCats.length === 0 && (
            <p className="text-xs text-gray-500 italic">
              Aucune sélection : l'IA piochera dans toutes les catégories du site.
            </p>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500 bg-gray-50 border rounded-lg p-3 space-y-1">
        <div><strong>Source des sujets</strong> :</div>
        {currentSite?.hasNewsQuery && <div>• NewsAPI (configuré)</div>}
        {currentSite?.hasTopics && <div>• Liste de thématiques (rotation)</div>}
        <div>• Image : recherche automatique si activée dans le profil</div>
      </div>

      <button
        type="submit"
        disabled={loading || !websiteId || noSource}
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium"
      >
        <Zap size={16} />
        {loading ? 'Lancement...' : `Lancer ${count} publication${count > 1 ? 's' : ''}`}
      </button>
    </form>
  );
}
