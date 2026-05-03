'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
    };

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
      toast.error(error || 'Erreur lors de la création du compte');
      setLoading(false);
      return;
    }

    await signIn('credentials', {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });
    setLoading(false);
    toast.success('Compte créé');
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <h2 className="text-xl font-semibold tracking-tight mb-1">Créer un compte</h2>
      <p className="text-sm text-muted-foreground mb-6">Démarrez en quelques secondes</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nom</Label>
          <Input id="name" type="text" name="name" required autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" name="email" required autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Création…' : 'Créer le compte'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-center text-muted-foreground">
        Déjà un compte ?{' '}
        <Link href="/login" className="text-primary hover:underline font-medium">
          Se connecter
        </Link>
      </p>
    </>
  );
}
