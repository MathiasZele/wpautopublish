'use client';

import { useState } from 'react';
import { Send, FileText, ImageIcon, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { CategoryPicker } from './CategoryPicker';
import type { PublishSite } from './PublishTabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function DirectPublishForm({ sites }: { sites: PublishSite[] }) {
  const [websiteId, setWebsiteId] = useState(sites[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedCats, setSelectedCats] = useState<number[]>(
    sites[0]?.defaultCategoryIds ?? [],
  );
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
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="websiteId">Site WordPress</Label>
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
            <Label htmlFor="title" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Titre de l'article
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Entrez le titre…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content">Contenu (HTML ou texte brut)</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={10}
              placeholder="Écrivez votre contenu ici…"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imageUrl" className="flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /> Image à la une (URL)
            </Label>
            <Input
              id="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              type="url"
              placeholder="https://…"
            />
          </div>

          {websiteId && (
            <CategoryPicker
              siteId={websiteId}
              selected={selectedCats}
              onChange={setSelectedCats}
            />
          )}

          <Button
            type="submit"
            disabled={loading || !title.trim() || !content.trim()}
            size="lg"
            className="w-full"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {loading ? 'Publication en cours…' : "Publier l'article maintenant"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
