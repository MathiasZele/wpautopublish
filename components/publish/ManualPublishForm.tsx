'use client';

import { useEffect, useState } from 'react';
import { Send, Sparkles, ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { CategoryPicker } from './CategoryPicker';
import type { PublishSite } from './PublishTabs';

export function ManualPublishForm({ sites }: { sites: PublishSite[] }) {
  const [websiteId, setWebsiteId] = useState(sites[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedCats, setSelectedCats] = useState<number[]>(sites[0]?.defaultCategoryIds ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const site = sites.find((s) => s.id === websiteId);
    setSelectedCats(site?.defaultCategoryIds ?? []);
  }, [websiteId, sites]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteId,
        topic,
        imageUrl: imageUrl || undefined,
        categoryIds: selectedCats,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Erreur' }));
      toast.error(error || 'Erreur lors de la mise en file');
      return;
    }

    toast.success('Article mis en file. Suivez sa progression dans l\'historique.', { duration: 5000 });
    setTopic('');
    setImageUrl('');
  }

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

      <div>
        <label className="block text-sm font-medium mb-1">Sujet / texte source</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          required
          rows={5}
          placeholder="Décrivez le sujet de l'article à générer..."
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 flex items-center gap-2">
          <ImageIcon size={14} /> URL de l'image à la une (optionnel)
        </label>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          type="url"
          placeholder="https://..."
          className="w-full px-3 py-2 border rounded-lg"
        />
        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
          <Sparkles size={12} className="text-brand-500" />
          Si vide, l'app cherchera automatiquement une image correspondant au sujet.
        </p>
      </div>

      {websiteId && (
        <CategoryPicker
          siteId={websiteId}
          selected={selectedCats}
          onChange={setSelectedCats}
        />
      )}

      <button
        type="submit"
        disabled={loading || !topic.trim()}
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium"
      >
        <Send size={16} />
        {loading ? 'Mise en file...' : 'Générer & publier'}
      </button>
    </form>
  );
}
