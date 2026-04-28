const styles: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  ERROR: 'bg-red-100 text-red-700',
  PAUSED: 'bg-gray-100 text-gray-700',
  SUCCESS: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const labels: Record<string, string> = {
  ACTIVE: 'Actif',
  PENDING: 'En attente',
  ERROR: 'Erreur',
  PAUSED: 'En pause',
  SUCCESS: 'Succès',
  FAILED: 'Échec',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = styles[status] ?? 'bg-gray-100 text-gray-700';
  const lbl = labels[status] ?? status;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {lbl}
    </span>
  );
}
