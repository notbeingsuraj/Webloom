interface StatusBadgeProps {
  status: string;
}

const styles: Record<string, string> = {
  new:           'bg-webloom-surface text-webloom-muted border border-webloom-border',
  analysing:     'bg-primary-900/30 text-primary-300 border border-primary-800/50',
  qualified:     'bg-emerald-900/30 text-emerald-300 border border-emerald-800/50',
  contacted:     'bg-amber-900/30 text-amber-300 border border-amber-800/50',
  won:           'bg-emerald-900/30 text-emerald-300 border border-emerald-800/50',
  lost:          'bg-red-900/30 text-red-300 border border-red-800/50',
  follow_up:     'bg-purple-900/30 text-purple-300 border border-purple-800/50',
  high:          'bg-primary-900/30 text-primary-300 border border-primary-800/50',
  critical:      'bg-red-900/30 text-red-300 border border-red-800/50',
  complete:      'bg-emerald-900/30 text-emerald-300 border border-emerald-800/50',
  ok:            'bg-emerald-900/30 text-emerald-300 border border-emerald-800/50',
  failed:        'bg-red-900/30 text-red-300 border border-red-800/50',
  medium:        'bg-amber-900/30 text-amber-300 border border-amber-800/50',
  low:           'bg-webloom-surface text-webloom-muted border border-webloom-border',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = status?.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) ?? 'Unknown';
  return (
    <span className={['inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.02em]', styles[status] ?? styles.new].join(' ')}>
      {label}
    </span>
  );
}
