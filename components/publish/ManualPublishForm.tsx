'use client';

import { useEffect, useState } from 'react';
import { Send, Sparkles, ImageIcon, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { CategoryPicker } from './CategoryPicker';
import type { PublishSite } from './PublishTabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ManualPublishForm({ sites }: { sites: PublishSite[] }) {
  const [websiteId, setWebsiteId] = useState(sites[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedCats, setSelectedCats] = useState<number[]>(
    sites[0]?.defaultCategoryIds ?? [],
  );
  const [provider, setProvider] = useState('AUTO');
  const [formatOnly, setFormatOnly] = useState(false);
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
        provider,
        imageUrl: imageUrl || undefined,
        categoryIds: selectedCats,
        formatOnly,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Erreur' }));
      toast.error(error || 'Erreur lors de la mise en file');
      return;
    }

    toast.success("Article mis en file. Suivez la progression dans l'historique.", {
      duration: 5000,
    });
    setTopic('');
    setImageUrl('');
  }

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

          <div className="space-y-1.5">
            <Label htmlFor="topic">Sujet / texte source</Label>
            <Textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
              rows={5}
              placeholder="Décrivez le sujet de l'article à générer…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imageUrl" className="flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> URL de l&apos;image &agrave; la une (optionnel)
            </Label>
            <Input
              id="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              type="url"
              placeholder="https://…"
            />
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" />
              Si vide, l&apos;app cherchera automatiquement une image correspondant au sujet.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Source de l&apos;actualit&eacute;</Label>
            <Select value={provider} onValueChange={setProvider} disabled={formatOnly}>
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
            <p className="text-xs text-muted-foreground">
              L&apos;orchestrateur choisira la meilleure source ou combinera les r&eacute;sultats en mode Auto.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
            <Checkbox
              id="formatOnly"
              checked={formatOnly}
              onCheckedChange={(v) => setFormatOnly(!!v)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="formatOnly" className="cursor-pointer">
                Ne pas reformuler, formater uniquement (Mode direct)
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                L&apos;IA conservera votre texte exact. Elle se contentera d&apos;ajouter les balises HTML
                et de g&eacute;n&eacute;rer le SEO. Id&eacute;al si vous collez un article d&eacute;j&agrave; r&eacute;dig&eacute;.
              </p>
            </div>
          </div>

          {websiteId && (
            <CategoryPicker
              siteId={websiteId}
              selected={selectedCats}
              onChange={setSelectedCats}
            />
          )}

          <Button type="submit" disabled={loading || !topic.trim()} size="lg">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {loading ? 'Mise en file…' : 'Générer & publier'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
