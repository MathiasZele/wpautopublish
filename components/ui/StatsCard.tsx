import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from './card';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  trend?: { value: number; label?: string };
  className?: string;
}

export function StatsCard({ label, value, icon: Icon, hint, trend, className }: StatsCardProps) {
  return (
    <Card className={cn('group transition-all hover:border-primary/30', className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <div className="rounded-md bg-primary/10 p-1.5 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="num text-2xl font-bold tracking-tight text-foreground">{value}</div>
        {(hint || trend) && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {trend && (
              <span
                className={cn(
                  'num font-semibold',
                  trend.value >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {trend.value >= 0 ? '+' : ''}{trend.value}%
              </span>
            )}
            {hint && <span className="text-muted-foreground">{hint}</span>}
            {trend?.label && <span className="text-muted-foreground">{trend.label}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
