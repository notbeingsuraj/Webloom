import { cn } from '../../lib/utils';

interface ScoreIndicatorProps {
  score: number;
  label?: string;
  description?: string;
}

export default function ScoreIndicator({ score, label = 'Opportunity', description }: ScoreIndicatorProps) {
  const safeScore = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
  const ringColor = '#DBEAFE';

  return (
    <div className={cn('rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm')}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-[-0.06em]">{Math.round(safeScore)}</span>
            <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div
          className="h-16 w-16 rounded-full border-[7px] bg-card"
          style={{ borderColor: ringColor, background: `conic-gradient(hsl(221 83% 53%) ${safeScore * 3.6}deg, ${ringColor} 0deg)` }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-[11px] font-semibold text-foreground">{Math.round(safeScore)}</div>
        </div>
      </div>
      {description ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
  );
}
