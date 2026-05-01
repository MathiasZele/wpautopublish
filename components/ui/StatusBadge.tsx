const styles: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-100',
  ERROR: 'bg-rose-50 text-rose-700 border-rose-100',
  PAUSED: 'bg-slate-50 text-slate-700 border-slate-100',
  SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-100',
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
  ACTIVE: 'bg-emerald-500',
  PENDING: 'bg-amber-500',
  ERROR: 'bg-rose-500',
  PAUSED: 'bg-slate-400',
  SUCCESS: 'bg-emerald-500',
  FAILED: 'bg-rose-500',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = styles[status] ?? 'bg-slate-50 text-slate-700 border-slate-100';
  const lbl = labels[status] ?? status;
  const dot = dots[status] ?? 'bg-slate-400';
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />
      {lbl}
    </span>
  );
}
