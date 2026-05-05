'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, ImageIcon, Sparkles, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    preferredProvider: string;
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
      preferredProvider: state.preferredProvider,
      topics: topicsInput.split(',').map((s) => s.trim()).filter(Boolean),
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
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Auto-generate IA panel */}
          <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-primary/0 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Configuration automatique par IA
                </div>
                <p className="text-xs text-muted-foreground">
                  Analyse les catégories et articles existants du site WordPress pour générer
                  une requête NewsAPI et des thématiques cohérentes.
                </p>
              </div>
              <Button
                type="button"
                onClick={handleAutoGenerate}
                disabled={generating}
                size="sm"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generating ? 'Génération…' : "Générer avec l'IA"}
              </Button>
            </div>
            {reasoning && (
              <div className="mt-3 text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-3">
                {reasoning}
              </div>
            )}
          </div>

          {/* Language + Tone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Langue</Label>
              <Select
                value={state.language}
                onValueChange={(v) => setState({ ...state, language: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="it">Italiano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ton</Label>
              <Select
                value={state.tone}
                onValueChange={(v) => setState({ ...state, tone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="informatif">Informatif</SelectItem>
                  <SelectItem value="expert">Expert</SelectItem>
                  <SelectItem value="vulgarisé">Vulgarisé</SelectItem>
                  <SelectItem value="engageant">Engageant</SelectItem>
                  <SelectItem value="formel">Formel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Topics */}
          <div className="space-y-1.5">
            <Label htmlFor="topics">Thématiques (séparées par virgules)</Label>
            <Input
              id="topics"
              value={topicsInput}
              onChange={(e) => setTopicsInput(e.target.value)}
              placeholder="tech, IA, startups"
            />
            <p className="text-xs text-muted-foreground">
              Utilisées en mode auto si aucune actualité ne correspond à la requête.
            </p>
          </div>

          {/* News query + provider + age */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="newsApiQuery">Requête NewsAPI</Label>
              <Input
                id="newsApiQuery"
                value={state.newsApiQuery}
                onChange={(e) => setState({ ...state, newsApiQuery: e.target.value })}
                placeholder="intelligence artificielle"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Source de l&apos;actualit&eacute;</Label>
              <Select
                value={state.preferredProvider}
                onValueChange={(v) => setState({ ...state, preferredProvider: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Intelligent (Auto)</SelectItem>
                  <SelectItem value="NewsAPI">NewsAPI</SelectItem>
                  <SelectItem value="GNews">GNews</SelectItem>
                  <SelectItem value="Mediastack">Mediastack</SelectItem>
                  <SelectItem value="The Guardian">The Guardian</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Articles de moins de</Label>
              <Select
                value={String(state.maxArticleAgeHours)}
                onValueChange={(v) =>
                  setState({ ...state, maxArticleAgeHours: Number(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGE_PRESETS.map((p) => (
                    <SelectItem key={p.hours} value={String(p.hours)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Categories */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Catégories WordPress par défaut</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadCategories}
                disabled={loadingCats}
                className="h-7 text-xs"
              >
                {loadingCats ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3 w-3" />
                )}
                {loadingCats ? 'Chargement…' : 'Recharger'}
              </Button>
            </div>
            {categories.length === 0 ? (
              <div className="text-xs text-muted-foreground border rounded-md px-3 py-2">
                {loadingCats
                  ? 'Récupération des catégories…'
                  : 'Aucune catégorie chargée. Vérifie la connexion WP.'}
              </div>
            ) : (
              <div className="rounded-md border p-3 max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                {categories.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground transition-colors"
                  >
                    <Checkbox
                      checked={state.defaultCategoryIds.includes(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                    />
                    <span className="truncate flex-1">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">({cat.count})</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Les articles publiés depuis cette app seront classés dans ces catégories.
            </p>
          </div>

          {/* Custom prompt */}
          <div className="space-y-1.5">
            <Label htmlFor="customPrompt">Prompt personnalisé (optionnel)</Label>
            <Textarea
              id="customPrompt"
              value={state.customPrompt}
              onChange={(e) => setState({ ...state, customPrompt: e.target.value })}
              rows={4}
              placeholder="Instructions supplémentaires pour le rédacteur…"
              className="font-mono text-xs"
            />
          </div>

          <Separator />

          {/* Auto mode + frequency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <Label htmlFor="articlesPerDay">Articles par jour (cron auto)</Label>
              <Input
                id="articlesPerDay"
                type="number"
                min={0}
                max={20}
                value={state.articlesPerDay}
                onChange={(e) =>
                  setState({ ...state, articlesPerDay: Number(e.target.value) })
                }
              />
            </div>
            <div className="rounded-md border bg-card p-3 flex items-start gap-3 mt-7 md:mt-0 md:self-end">
              <Switch
                id="autoMode"
                checked={state.autoMode}
                onCheckedChange={(v) => setState({ ...state, autoMode: v })}
              />
              <Label htmlFor="autoMode" className="cursor-pointer flex-1">
                <div>Mode automatique</div>
                <div className="text-xs font-normal text-muted-foreground mt-0.5">
                  Active la publication automatique selon la fréquence définie.
                </div>
              </Label>
            </div>
          </div>

          {/* Auto image */}
          <div className="rounded-md border p-3 flex items-start gap-3">
            <Checkbox
              id="autoImage"
              checked={state.autoImage}
              onCheckedChange={(v) => setState({ ...state, autoImage: !!v })}
              className="mt-0.5"
            />
            <ImageIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1 min-w-0">
              <Label htmlFor="autoImage" className="cursor-pointer">
                Exiger une image à la une
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                L&apos;image vient toujours d&apos;un vrai article NewsAPI (3 niveaux de recherche). Si
                activ&eacute; : la publication &eacute;choue si aucune image n&apos;est trouv&eacute;e. Si d&eacute;sactiv&eacute; :
                l&apos;article est publi&eacute; sans image plut&ocirc;t que d&apos;&eacute;chouer.
              </p>
            </div>
          </div>

          <Button type="submit" disabled={saving} size="lg">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
