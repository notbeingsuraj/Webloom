import { cn } from '../../lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  detail?: string;
  icon?: React.ReactNode;
  tone?: 'primary' | 'opportunity' | 'creative' | 'verified';
  progress?: number | null;
  badge?: string;
}

const toneStyles = {
  primary: 'bg-primary/10 text-primary border-primary/20',
  opportunity: 'bg-opportunity/10 text-opportunity border-opportunity/20',
  creative: 'bg-creative/10 text-creative border-creative/20',
  verified: 'bg-verified/10 text-verified border-verified/20',
};

const badgeStyles = {
  primary: 'bg-primary text-primary-foreground',
  opportunity: 'bg-opportunity text-opportunity-foreground',
  creative: 'bg-creative text-creative-foreground',
  verified: 'bg-verified text-verified-foreground',
};

interface StatCardProps {
  label: string;
  value: string | number;
  detail?: string;
  icon?: React.ReactNode;
  tone?: 'primary' | 'opportunity' | 'creative' | 'verified';
  progress?: number | null;
  badge?: string;
}

function StatCard({
  label,
  value,
  detail,
  icon,
  tone = 'primary',
  progress = null,
  badge,
}: StatCardProps) {
  return (
    <div className={cn('wl-card relative overflow-hidden', toneStyles[tone])}>
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/5 to-transparent" aria-hidden="true" />
      <div className="relative p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="wl-eyebrow">{label}</p>
            <p className="mt-2 font-display text-3xl font-bold tracking-[-0.05em] text-foreground md:text-[2.7rem]">
              {value}
            </p>
            {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}
            {badge && (
              <span className={cn('mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', badgeStyles[tone as keyof typeof badgeStyles])}>
                <span className="wl-dot" aria-hidden="true" />
                {badge}
              </span>
            )}
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/12 to-ai/10 text-primary">
            {icon}
          </div>
        </div>
        {progress !== null && progress !== undefined && (
          <div className="mt-6 wl-progress">
            <div
              className="wl-progress-fill bg-gradient-to-r from-primary to-ai"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default StatCard;