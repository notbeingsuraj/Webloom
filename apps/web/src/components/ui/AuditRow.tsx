import { cn } from '../../lib/utils';

interface AuditRowProps {
  label: string;
  value: string;
  tone?: 'good' | 'neutral' | 'bad';
}

const toneStyles = {
  good: 'text-blue-700 bg-blue-50 border-blue-100',
  neutral: 'text-foreground bg-secondary border-border',
  bad: 'text-red-600 bg-red-50 border-red-100',
};

export default function AuditRow({ label, value, tone = 'neutral' }: AuditRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-medium', toneStyles[tone])}>{value}</span>
    </div>
  );
}
