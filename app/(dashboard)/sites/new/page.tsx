'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

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
      // customEndpointKey volontairement omis : généré côté serveur
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

  // ─── Modal display-once ───────────────────────────────────────────────────
  if (created) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Site créé : {created.name}</h1>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-amber-900">Clé secrète d'endpoint — à copier MAINTENANT</h2>
              <p className="text-sm text-amber-800 mt-1">
                Cette clé ne sera <strong>plus jamais affichée</strong>. Si vous la perdez,
                il faudra la regénérer depuis le profil du site (et la recopier dans WordPress).
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <input
              readOnly
              value={created.endpointSecret}
              className="flex-1 px-3 py-2 border border-amber-300 rounded-lg bg-white font-mono text-sm select-all"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                copied ? 'bg-emerald-600 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span className="ml-1.5">{copied ? 'Copié' : 'Copier'}</span>
            </button>
          </div>

          <div className="mt-5 text-sm text-amber-900 space-y-1">
            <p className="font-semibold">Étapes côté WordPress :</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Connectez-vous sur <code className="text-xs bg-amber-100 px-1 rounded">{created.url}/wp-admin</code></li>
              <li>Allez dans <strong>Réglages → WP AutoPublish</strong></li>
              <li>Collez la clé dans le champ "Clé secrète" et enregistrez</li>
            </ol>
          </div>
        </div>

        <button
          onClick={handleContinue}
          className="mt-6 w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg font-medium"
        >
          J'ai copié la clé — Continuer vers le profil
        </button>
      </div>
    );
  }

  // ─── Formulaire de création ───────────────────────────────────────────────
  return (
    <div className="max-w-2xl">
      <Link href="/sites" className="inline-flex items-center gap-1 text-sm text-gray-600 mb-4 hover:text-brand-600">
        <ArrowLeft size={14} /> Retour aux sites
      </Link>
      <h1 className="text-2xl font-bold mb-2">Connecter un site WordPress</h1>
      <p className="text-gray-500 text-sm mb-6">
        Vous aurez besoin d'un Application Password WordPress et du plugin WP AutoPublish Helper installé.
        La clé secrète d'endpoint sera générée automatiquement par le serveur après création.
      </p>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nom du site</label>
          <input
            name="name"
            required
            placeholder="Mon Blog"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">URL du site</label>
          <input
            name="url"
            type="url"
            required
            placeholder="https://monsite.com"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Nom d'utilisateur WordPress</label>
          <input
            name="wpUsername"
            required
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Application Password</label>
          <input
            name="wpAppPassword"
            type="password"
            required
            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            wp-admin → Utilisateurs → Profil → Application Passwords
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
        >
          {loading ? 'Création...' : 'Créer le site'}
        </button>
      </form>
    </div>
  );
}
