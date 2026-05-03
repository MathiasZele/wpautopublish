import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  ACTIVE: 'bg-success/10 text-success border-success/20',
  SUCCESS: 'bg-success/10 text-success border-success/20',
  PENDING: 'bg-warning/10 text-warning border-warning/20',
  ERROR: 'bg-destructive/10 text-destructive border-destructive/20',
  FAILED: 'bg-destructive/10 text-destructive border-destructive/20',
  PAUSED: 'bg-muted text-muted-foreground border-border',
};

const labels: Record<string, string> = {
  ACTIVE: 'Actif',
  PENDING: 'En attente',
  ERROR: 'Erreur',
  PAUSED: 'En pause',
  SUCCESS: 'Succès',
  FAILED: 'Échec',
};

const dots: Record<string, string> = {
  ACTIVE: 'bg-success',
  SUCCESS: 'bg-success',
  PENDING: 'bg-warning',
  ERROR: 'bg-destructive',
  FAILED: 'bg-destructive',
  PAUSED: 'bg-muted-foreground/40',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = styles[status] ?? 'bg-muted text-muted-foreground border-border';
  const lbl = labels[status] ?? status;
  const dot = dots[status] ?? 'bg-muted-foreground/40';
  const isActive = status === 'ACTIVE' || status === 'PENDING';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        cls,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          dot,
          isActive && 'animate-pulse',
        )}
      />
      {lbl}
    </span>
  );
}
