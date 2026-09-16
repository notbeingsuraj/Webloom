/**
 * StatCard — colorful KPI card with optional icon, tone, and mini trend bar.
 * Renders REAL data only; when `value` is null the card renders an honest
 * "—" with the muted tone.
 */
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'primary' | 'ai' | 'opportunity' | 'verified' | 'creative' | 'warning' | 'muted';

interface StatCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  /** 0..100 normalized fill used for the mini progress bar ("sparkline-like"). */
  progress?: number | null;
  badge?: string;
}

const toneStyles: Record<Tone, { icon: string; text: string; bar: string; glow: string }> = {
  primary: { icon: 'bg-primary/12 text-primary', text: 'text-primary', bar: 'linear-gradient(90deg,hsl(var(--primary)),hsl(var(--ai)))', glow: 'var(--shadow-glow-blue)' },
  ai: { icon: 'bg-ai/12 text-ai', text: 'text-ai', bar: 'linear-gradient(90deg,hsl(var(--ai)),hsl(var(--creative)))', glow: 'var(--shadow-glow-violet)' },
  opportunity: { icon: 'bg-opportunity/15 text-opportunity', text: 'text-opportunity', bar: 'linear-gradient(90deg,hsl(var(--opportunity)),hsl(var(--creative)))', glow: 'var(--shadow-glow-orange)' },
  verified: { icon: 'bg-verified/12 text-verified', text: 'text-verified', bar: 'linear-gradient(90deg,hsl(var(--verified)),hsl(var(--success)))', glow: 'var(--shadow-glow-green)' },
  creative: { icon: 'bg-creative/12 text-creative', text: 'text-creative', bar: 'linear-gradient(90deg,hsl(var(--creative)),hsl(var(--opportunity)))', glow: 'var(--shadow-glow-pink)' },
  warning: { icon: 'bg-warning/18 text-warning-foreground', text: 'text-warning-foreground', bar: 'linear-gradient(90deg,hsl(var(--warning)),hsl(var(--opportunity)))', glow: 'var(--shadow-glow-orange)' },
  muted: { icon: 'bg-secondary text-muted-foreground', text: 'text-foreground', bar: 'linear-gradient(90deg,hsl(var(--muted-foreground)),hsl(var(--muted-foreground)))', glow: 'var(--shadow-card)' },
};

export default function StatCard({ label, value, detail, icon, tone = 'primary', progress = null, badge }: StatCardProps) {
  const t = toneStyles[tone];
  const hasProgress = progress != null && Number.isFinite(progress);
  const normalized = hasProgress ? Math.min(100, Math.max(0, progress as number)) : 0;

  return (
    <div
      className={cn('wl-card wl-card-hover relative h-full overflow-hidden p-5')}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {/* subtle top accent bar */}
      <div aria-hidden="true" className="absolute inset-x-5 top-0 h-1 rounded-b-full" style={{ background: t.bar, opacity: 0.7 }} />
      {/* corner glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-50 blur-2xl"
        style={{ background: tone === 'muted' ? 'hsl(var(--muted-foreground) / 0.1)' : `hsl(var(--${tone}) / 0.13)` }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', t.icon)}>{icon}</span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <span className={cn('font-display text-[2.1rem] font-bold leading-none tracking-[-0.05em] tabular-nums', t.text)}>
            {value}
          </span>
          {badge ? (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {badge}
            </span>
          ) : null}
        </div>

        {detail ? <p className="mt-3 text-sm text-muted-foreground">{detail}</p> : null}

        {hasProgress ? (
          <div className="wl-progress mt-4">
            <div className="wl-progress-fill" style={{ width: `${normalized}%`, background: t.bar }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}