interface ScoreIndicatorProps {
  score: number;
  label?: string;
  description?: string;
}

export default function ScoreIndicator({ score, label = 'Opportunity', description }: ScoreIndicatorProps) {
  const safeScore = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;

  return (
    <div className="rounded-[28px] border border-webloom-border bg-webloom-surface p-5 shadow-[0_8px_24px_rgba(17,17,17,0.04)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-webloom-muted">{label}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-[-0.06em] text-webloom-text">{Math.round(safeScore)}</span>
            <span className="pb-1 text-sm text-webloom-muted">/ 100</span>
          </div>
        </div>
        <div className="h-16 w-16 rounded-full border-[7px] border-[#EEF3FF] bg-webloom-surface" style={{ background: `conic-gradient(#0A84FF ${safeScore * 3.6}deg, #EEF3FF 0deg)` }}>
          <div className="flex h-full w-full items-center justify-center rounded-full bg-webloom-surface text-[11px] font-semibold text-webloom-text">{Math.round(safeScore)}</div>
        </div>
      </div>
      {description ? <p className="mt-4 text-sm leading-6 text-webloom-muted">{description}</p> : null}
    </div>
  );
}
