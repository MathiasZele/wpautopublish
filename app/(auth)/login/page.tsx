'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      toast.error('Identifiants invalides');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <h2 className="text-xl font-semibold tracking-tight mb-1">Connexion</h2>
      <p className="text-sm text-muted-foreground mb-6">Accédez à votre tableau de bord</p>
      <form onSubmit={handleSubmit} className="space-y-4">
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
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-center text-muted-foreground">
        Pas de compte ?{' '}
        <Link href="/register" className="text-primary hover:underline font-medium">
          Créer un compte
        </Link>
      </p>
    </>
  );
}
