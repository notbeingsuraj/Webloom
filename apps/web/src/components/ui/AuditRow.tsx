interface AuditRowProps {
  label: string;
  value: string;
  tone?: 'good' | 'neutral' | 'bad';
}

const toneStyles = {
  good: 'text-primary-400 bg-primary-900/30 border-primary-800/50',
  neutral: 'text-webloom-text bg-webloom-surface border-webloom-border',
  bad: 'text-red-400 bg-red-900/30 border-red-800/50',
};

export default function AuditRow({ label, value, tone = 'neutral' }: AuditRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-webloom-border bg-webloom-surface px-4 py-3">
      <span className="text-sm text-webloom-text">{label}</span>
      <span className={['inline-flex rounded-full border px-2.5 py-1 text-xs font-medium', toneStyles[tone]].join(' ')}>{value}</span>
    </div>
  );
}
