import { cn } from '../../lib/utils';

interface ScoreIndicatorProps {
  score: number;
  label?: string;
  description?: string;
  size?: 'sm' | 'lg';
}

const scoreTone = (score: number) => {
  if (score >= 75) return { text: 'text-verified', glow: 'var(--shadow-glow-green)' };
  if (score >= 50) return { text: 'text-primary', glow: 'var(--shadow-glow-blue)' };
  return { text: 'text-opportunity', glow: 'var(--shadow-glow-orange)' };
};

export default function ScoreIndicator({ score, label = 'Opportunity', description, size = 'lg' }: ScoreIndicatorProps) {
  const safeScore = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
  const tone = scoreTone(safeScore);
  const trackColor = 'hsl(var(--muted))';
  const big = size === 'lg';

  return (
    <div className={cn('wl-card relative overflow-hidden p-5', big && 'p-6')}>
      {/* corner decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-60 blur-2xl"
        style={{ background: `hsl(var(--primary) / 0.14)` }}
      />
      <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="wl-eyebrow">{label}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className={cn('font-display font-bold tracking-[-0.06em] tabular-nums', big ? 'text-5xl' : 'text-4xl', tone.text)}>
              {Math.round(safeScore)}
            </span>
            <span className="pb-1.5 text-sm text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div
          className={cn('relative h-16 w-16 shrink-0 rounded-full border-[7px] bg-card', big && 'h-20 w-20')}
          style={{ borderColor: trackColor, boxShadow: tone.glow }}
        >
          <div
            className="flex h-full w-full items-center justify-center rounded-full bg-card"
            style={{ background: `conic-gradient(hsl(var(--primary)) ${safeScore * 3.6}deg, ${trackColor} 0deg)` }}
          >
            <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-[11px] font-bold text-foreground tabular-nums">
              {Math.round(safeScore)}
            </div>
          </div>
        </div>
      </div>
      <div className="relative mt-4">
        <div className="wl-progress">
          <div
            className="wl-progress-fill"
            style={{ width: `${safeScore}%`, background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--ai)))` }}
          />
        </div>
      </div>
      {description ? <p className="relative mt-4 text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
  );
}
