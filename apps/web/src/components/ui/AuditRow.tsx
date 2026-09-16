import { cn } from '../../lib/utils';

interface AuditRowProps {
  label: string;
  value: string;
  tone?: 'good' | 'neutral' | 'bad';
}

const toneStyles = {
  good: 'text-verified bg-verified/10 border-verified/25',
  neutral: 'text-foreground bg-secondary border-border',
  bad: 'text-destructive bg-destructive/10 border-destructive/25',
};

export default function AuditRow({ label, value, tone = 'neutral' }: AuditRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums', toneStyles[tone])}>{value}</span>
    </div>
  );
}
