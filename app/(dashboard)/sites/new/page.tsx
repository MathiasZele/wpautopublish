'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';

function generateSecret(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function NewSitePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState(() => generateSecret());

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get('name'),
      url: formData.get('url'),
      wpUsername: formData.get('wpUsername'),
      wpAppPassword: formData.get('wpAppPassword'),
      customEndpointKey: secret,
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

    const site = await res.json();
    toast.success('Site créé. Configurez maintenant son profil.');
    router.push(`/sites/${site.id}/profile`);
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <Link href="/sites" className="inline-flex items-center gap-1 text-sm text-gray-600 mb-4 hover:text-brand-600">
        <ArrowLeft size={14} /> Retour aux sites
      </Link>
      <h1 className="text-2xl font-bold mb-2">Connecter un site WordPress</h1>
      <p className="text-gray-500 text-sm mb-6">
        Vous aurez besoin d'un Application Password WordPress et du plugin WP AutoPublish Helper installé.
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
        <div>
          <label className="block text-sm font-medium mb-1">Clé secrète d'endpoint</label>
          <div className="flex gap-2">
            <input
              value={secret}
              readOnly
              className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setSecret(generateSecret())}
              className="px-3 py-2 border rounded-lg hover:bg-gray-50"
              title="Régénérer"
            >
              <RefreshCcw size={16} />
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            À recopier dans Réglages → WP AutoPublish du site WordPress.
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
