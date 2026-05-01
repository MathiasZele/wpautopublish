import type { LucideIcon } from 'lucide-react';

export function StatsCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <div className="card-premium p-6 group">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <div className="p-2 bg-brand-50 rounded-lg text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors duration-300">
          <Icon size={20} />
        </div>
      </div>
      <div className="text-3xl font-bold text-slate-900 font-outfit">{value}</div>
      {hint && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-slate-400">{hint}</span>
        </div>
      )}
    </div>
  );
}
