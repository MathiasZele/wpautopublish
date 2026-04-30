'use client';

import { useState } from 'react';
import { Send, FileText, ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { CategoryPicker } from './CategoryPicker';
import type { PublishSite } from './PublishTabs';

export function DirectPublishForm({ sites }: { sites: PublishSite[] }) {
  const [websiteId, setWebsiteId] = useState(sites[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedCats, setSelectedCats] = useState<number[]>(sites[0]?.defaultCategoryIds ?? []);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    
    setLoading(true);

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteId,
          title,
          content,
          imageUrl: imageUrl || undefined,
          categoryIds: selectedCats,
        }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(error || 'Erreur lors de la publication');
      }

      toast.success('Article posté avec succès !');
      setTitle('');
      setContent('');
      setImageUrl('');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">Site WordPress</label>
        <select
          value={websiteId}
          onChange={(e) => setWebsiteId(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.url.replace(/^https?:\/\//, '')}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 flex items-center gap-2">
            <FileText size={14} className="text-gray-400" /> Titre de l'article
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Entrez le titre..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">Contenu (HTML ou texte brut)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={10}
            placeholder="Écrivez votre contenu ici..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 flex items-center gap-2">
            <ImageIcon size={14} className="text-gray-400" /> Image à la une (URL)
          </label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            type="url"
            placeholder="https://..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
      </div>

      {websiteId && (
        <CategoryPicker
          siteId={websiteId}
          selected={selectedCats}
          onChange={setSelectedCats}
        />
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading || !title.trim() || !content.trim()}
          className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-3 rounded-lg font-semibold transition-all shadow-sm"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Publication en cours...
            </span>
          ) : (
            <>
              <Send size={18} />
              Publier l'article maintenant
            </>
          )}
        </button>
      </div>
    </form>
  );
}
