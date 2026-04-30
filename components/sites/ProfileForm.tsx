'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, ImageIcon, Sparkles, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface WPCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

interface ProfileFormProps {
  siteId: string;
  initial: {
    language: string;
    tone: string;
    topics: string[];
    articlesPerDay: number;
    autoMode: boolean;
    customPrompt: string;
    newsApiQuery: string;
    maxArticleAgeHours: number;
    defaultCategoryIds: number[];
    autoImage: boolean;
  };
}

const AGE_PRESETS = [
  { hours: 6, label: '6 dernières heures' },
  { hours: 24, label: '24 heures' },
  { hours: 48, label: '2 jours' },
  { hours: 72, label: '3 jours' },
  { hours: 168, label: '1 semaine' },
  { hours: 720, label: '1 mois' },
];

export function ProfileForm({ siteId, initial }: ProfileFormProps) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [topicsInput, setTopicsInput] = useState(initial.topics.join(', '));
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<WPCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reasoning, setReasoning] = useState<string | null>(null);

  async function loadCategories() {
    setLoadingCats(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/categories`);
      if (res.ok) {
        const cats = await res.json();
        setCategories(cats);
      } else {
        const { error } = await res.json().catch(() => ({ error: 'Erreur' }));
        toast.error(`Catégories : ${error || 'échec'}`);
      }
    } finally {
      setLoadingCats(false);
    }
  }

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAutoGenerate() {
    if (
      (state.newsApiQuery || topicsInput) &&
      !confirm('Cela va remplacer la requête NewsAPI et les thématiques actuelles. Continuer ?')
    ) {
      return;
    }
    setGenerating(true);
    setReasoning(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/auto-generate`, { method: 'POST' });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Erreur' }));
        toast.error(error || 'Échec de la génération');
        return;
      }
      const data = await res.json();
      setState((s) => ({ ...s, newsApiQuery: data.newsApiQuery }));
      setTopicsInput(data.topics.join(', '));
      setReasoning(data.reasoning || null);
      toast.success(`${data.topics.length} thématiques générées`);
    } finally {
      setGenerating(false);
    }
  }

  function toggleCategory(id: number) {
    setState((s) => ({
      ...s,
      defaultCategoryIds: s.defaultCategoryIds.includes(id)
        ? s.defaultCategoryIds.filter((c) => c !== id)
        : [...s.defaultCategoryIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const profile = {
      language: state.language,
      tone: state.tone,
      articlesPerDay: state.articlesPerDay,
      autoMode: state.autoMode,
      autoImage: state.autoImage,
      customPrompt: state.customPrompt || null,
      newsApiQuery: state.newsApiQuery || null,
      maxArticleAgeHours: state.maxArticleAgeHours,
      defaultCategoryIds: state.defaultCategoryIds,
      topics: topicsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };

    const res = await fetch(`/api/sites/${siteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success('Profil enregistré');
      router.refresh();
    } else {
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Langue</label>
          <select
            value={state.language}
            onChange={(e) => setState({ ...state, language: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Ton</label>
          <select
            value={state.tone}
            onChange={(e) => setState({ ...state, tone: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="informatif">Informatif</option>
            <option value="expert">Expert</option>
            <option value="vulgarisé">Vulgarisé</option>
            <option value="engageant">Engageant</option>
            <option value="formel">Formel</option>
          </select>
        </div>
      </div>

      <div className="bg-gradient-to-br from-brand-50 to-purple-50 border border-brand-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
              <Sparkles size={16} />
              Configuration automatique
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Analyse les catégories, articles récents et infos SEO du site WordPress pour générer
              une requête NewsAPI et des thématiques cohérentes.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoGenerate}
            disabled={generating}
            className="flex-shrink-0 inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? 'Génération…' : 'Générer avec l\'IA'}
          </button>
        </div>
        {reasoning && (
          <div className="mt-2 text-xs text-gray-700 italic border-l-2 border-brand-300 pl-3">
            {reasoning}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Thématiques (séparées par virgules)</label>
        <input
          value={topicsInput}
          onChange={(e) => setTopicsInput(e.target.value)}
          placeholder="tech, IA, startups"
          className="w-full px-3 py-2 border rounded-lg"
        />
        <p className="text-xs text-gray-500 mt-1">Utilisées en mode auto si aucune requête NewsAPI ne ramène de résultat.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Requête NewsAPI</label>
          <input
            value={state.newsApiQuery}
            onChange={(e) => setState({ ...state, newsApiQuery: e.target.value })}
            placeholder="intelligence artificielle"
            className="w-full px-3 py-2 border rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">Sujets et images viendront de vrais articles trouvés.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Articles datant de moins de</label>
          <select
            value={state.maxArticleAgeHours}
            onChange={(e) => setState({ ...state, maxArticleAgeHours: Number(e.target.value) })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            {AGE_PRESETS.map((p) => (
              <option key={p.hours} value={p.hours}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">Catégories WordPress par défaut</label>
          <button
            type="button"
            onClick={loadCategories}
            disabled={loadingCats}
            className="text-xs text-brand-600 hover:underline flex items-center gap-1"
          >
            <RefreshCcw size={12} /> {loadingCats ? 'Chargement…' : 'Recharger'}
          </button>
        </div>
        {categories.length === 0 ? (
          <div className="text-xs text-gray-500 border rounded-lg px-3 py-2">
            {loadingCats ? 'Récupération des catégories…' : 'Aucune catégorie chargée. Vérifie la connexion WP.'}
          </div>
        ) : (
          <div className="border rounded-lg p-3 max-h-48 overflow-y-auto grid grid-cols-2 gap-2">
            {categories.map((cat) => (
              <label key={cat.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.defaultCategoryIds.includes(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                  className="accent-brand-600"
                />
                <span className="truncate">{cat.name}</span>
                <span className="text-xs text-gray-400">({cat.count})</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Les articles publiés depuis cette app seront classés dans ces catégories.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Prompt personnalisé (optionnel)</label>
        <textarea
          value={state.customPrompt}
          onChange={(e) => setState({ ...state, customPrompt: e.target.value })}
          rows={4}
          placeholder="Instructions supplémentaires pour le rédacteur..."
          className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Articles par jour (cron auto)</label>
          <input
            type="number"
            min={0}
            max={20}
            value={state.articlesPerDay}
            onChange={(e) => setState({ ...state, articlesPerDay: Number(e.target.value) })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <label className="flex items-center gap-3 mt-6 cursor-pointer">
          <input
            type="checkbox"
            checked={state.autoMode}
            onChange={(e) => setState({ ...state, autoMode: e.target.checked })}
            className="w-5 h-5 accent-brand-600"
          />
          <span className="text-sm font-medium">Activer le mode automatique (cron)</span>
        </label>
      </div>

      <label className="flex items-start gap-3 cursor-pointer pt-2 border-t">
        <input
          type="checkbox"
          checked={state.autoImage}
          onChange={(e) => setState({ ...state, autoImage: e.target.checked })}
          className="w-5 h-5 accent-brand-600 mt-0.5"
        />
        <ImageIcon size={16} className="text-gray-500 mt-1" />
        <div className="flex-1">
          <div className="text-sm font-medium">Exiger une image à la une</div>
          <div className="text-xs text-gray-500">
            L'image vient toujours d'un vrai article NewsAPI (3 niveaux de recherche).
            Si activé : la publication échoue si aucune image n'est trouvée.
            Si désactivé : l'article est publié sans image plutôt que d'échouer.
          </div>
        </div>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </form>
  );
}
