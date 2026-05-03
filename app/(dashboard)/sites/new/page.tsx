'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Copy, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreatedSite {
  id: string;
  name: string;
  url: string;
  endpointSecret: string;
}

export default function NewSitePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedSite | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get('name'),
      url: formData.get('url'),
      wpUsername: formData.get('wpUsername'),
      wpAppPassword: formData.get('wpAppPassword'),
    };

    const res = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Erreur' }));
      toast.error(error || 'Erreur lors de la création');
      setLoading(false);
      return;
    }

    const site = (await res.json()) as CreatedSite;
    setCreated(site);
    setLoading(false);
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.endpointSecret);
      setCopied(true);
      toast.success('Clé copiée');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Échec de la copie. Sélectionnez et copiez manuellement.');
    }
  }

  function handleContinue() {
    if (!created) return;
    router.push(`/sites/${created.id}/profile`);
    router.refresh();
  }

  if (created) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Site créé — {created.name}
        </h1>

        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <CardTitle className="text-base">
                  Clé secrète d'endpoint — à copier maintenant
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Cette clé ne sera <strong>plus jamais affichée</strong>. Si vous la perdez,
                  il faudra la regénérer depuis le profil du site et la recopier dans WordPress.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                readOnly
                value={created.endpointSecret}
                className="font-mono text-sm select-all"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant={copied ? 'default' : 'default'}
                onClick={handleCopy}
                className={copied ? 'bg-success hover:bg-success/90' : ''}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copié' : 'Copier'}
              </Button>
            </div>

            <div className="text-sm space-y-1.5">
              <p className="font-semibold text-foreground">Étapes côté WordPress :</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>
                  Connectez-vous sur{' '}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {created.url}/wp-admin
                  </code>
                </li>
                <li>
                  Allez dans <strong className="text-foreground">Réglages → WP AutoPublish</strong>
                </li>
                <li>Collez la clé dans le champ "Clé secrète" et enregistrez</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleContinue} className="w-full" size="lg">
          J'ai copié la clé — Continuer vers le profil
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link href="/sites">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour aux sites
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connecter un site WordPress</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vous aurez besoin d'un Application Password WordPress et du plugin WP AutoPublish
          Helper installé. La clé secrète d'endpoint sera générée automatiquement par le serveur
          après création.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nom du site</Label>
              <Input id="name" name="name" required placeholder="Mon Blog" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="url">URL du site</Label>
              <Input id="url" name="url" type="url" required placeholder="https://monsite.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wpUsername">Nom d'utilisateur WordPress</Label>
              <Input id="wpUsername" name="wpUsername" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wpAppPassword">Application Password</Label>
              <Input
                id="wpAppPassword"
                name="wpAppPassword"
                type="password"
                required
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                wp-admin → Utilisateurs → Profil → Application Passwords
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Création…' : 'Créer le site'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
