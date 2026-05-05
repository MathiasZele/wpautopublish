'use client';

import { useEffect, useState } from 'react';
import { Zap, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { CategoryPicker } from './CategoryPicker';
import type { PublishSite } from './PublishTabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AutoRunForm({ sites }: { sites: PublishSite[] }) {
  const [websiteId, setWebsiteId] = useState(sites[0]?.id ?? '');
  const [count, setCount] = useState(3);
  const [spacing, setSpacing] = useState(60);
  const [selectedCats, setSelectedCats] = useState<number[]>(
    sites[0]?.defaultCategoryIds ?? [],
  );
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
    toast.success(
      `${enqueued} article${enqueued > 1 ? 's' : ''} mis en file. Suivez l'historique.`,
      { duration: 5000 },
    );
  }

  const noSource = currentSite && !currentSite.hasNewsQuery && !currentSite.hasTopics;

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="websiteId">Site cible</Label>
            <Select value={websiteId} onValueChange={setWebsiteId}>
              <SelectTrigger id="websiteId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {s.url.replace(/^https?:\/\//, '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {noSource && (
            <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-warning" />
              <div>
                Ce site n&apos;a ni requ&ecirc;te NewsAPI ni th&eacute;matiques configur&eacute;es. Va sur le profil du
                site pour les ajouter.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="count">Nombre d&apos;articles</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                required
              />
              <p className="text-xs text-muted-foreground">Entre 1 et 50.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spacing">Espacement (sec)</Label>
              <Input
                id="spacing"
                type="number"
                min={0}
                max={3600}
                step={10}
                value={spacing}
                onChange={(e) => setSpacing(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">0 = parallèle, 60 = un par minute.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
            <Checkbox
              id="autoCategorize"
              checked={autoCategorize}
              onCheckedChange={(v) => setAutoCategorize(!!v)}
            />
            <Label htmlFor="autoCategorize" className="cursor-pointer flex-1">
              Laisser l&apos;IA choisir la meilleure cat&eacute;gorie (Intelligent)
            </Label>
          </div>

          {websiteId && (
            <div className="space-y-2">
              <Label>
                {autoCategorize
                  ? "Restreindre le choix de l'IA (optionnel)"
                  : 'Catégories forcées'}
              </Label>
              <CategoryPicker
                siteId={websiteId}
                selected={selectedCats}
                onChange={setSelectedCats}
              />
              {autoCategorize && selectedCats.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  Aucune s&eacute;lection : l&apos;IA piochera dans toutes les cat&eacute;gories du site.
                </p>
              )}
            </div>
          )}

          <Separator />

          <div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-semibold text-foreground">Source des sujets :</div>
            {currentSite?.hasNewsQuery && (
              <div className="text-muted-foreground">• NewsAPI (configuré)</div>
            )}
            {currentSite?.hasTopics && (
              <div className="text-muted-foreground">• Liste de thématiques (rotation)</div>
            )}
            <div className="text-muted-foreground">
              • Image : recherche automatique si activée dans le profil
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || !websiteId || !!noSource}
            size="lg"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {loading
              ? 'Lancement…'
              : `Lancer ${count} publication${count > 1 ? 's' : ''}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
