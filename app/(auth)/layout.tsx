import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-xl font-semibold tracking-tight">WP AutoPublish</span>
        </Link>
        <Card>
          <CardContent className="p-6">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
