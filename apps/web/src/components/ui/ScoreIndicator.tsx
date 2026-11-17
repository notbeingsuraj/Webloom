import { cn } from '../../lib/utils';

interface ScoreIndicatorProps {
  value: number | null;
  state: 'complete' | 'preliminary' | 'unavailable';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const sizeStyles = {
  sm: 'h-14 w-14 text-2xl',
  md: 'h-18 w-18 text-3xl',
  lg: 'h-24 w-24 text-4xl',
};

const stateColors = {
  complete: 'from-verified via-verified/80 to-verified/40',
  preliminary: 'from-opportunity via-opportunity/80 to-opportunity/40',
  unavailable: 'from-muted-foreground/20 via-muted-foreground/10 to-transparent',
};

const stateLabels = {
  complete: 'Complete',
  preliminary: 'Preliminary',
  unavailable: 'Unavailable',
};

const stateDescriptions = {
  complete: 'Based on completed digital audit.',
  preliminary: 'Preliminary — audit incomplete.',
  unavailable: 'Score unavailable',
};

function ScoreIndicator({
  value,
  state,
  size = 'md',
  showLabel = true,
}: ScoreIndicatorProps) {
  const isUnavailable = value === null || value === undefined || state === 'unavailable';
  const displayValue = isUnavailable ? '—' : value;

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div className={cn('relative flex h-18 w-18 items-center justify-center rounded-2xl', size === 'sm' && 'h-14 w-14', size === 'lg' && 'h-24 w-24')}>
        <svg className="h-full w-full" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="score-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--color-verified))" />
              <stop offset="100%" stopColor="hsl(var(--color-verified) / 0.4)" />
            </linearGradient>
          </defs>
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="url(#score-gradient)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={276.46}
            strokeDashoffset={276.46 * (1 - (isNaN(Number(value)) ? 0 : Number(value)) / 100)}
            transform="rotate(-90 50 50)"
            style={{ filter: 'drop-shadow(0 4px 8px hsl(var(--verified) / 0.3))' }}
          />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="hsl(var(--muted) / 0.3)"
            strokeWidth="6"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-display font-bold tabular-nums text-foreground', 'text-2xl', size === 'sm' && 'text-lg', size === 'lg' && 'text-4xl')}>
            {displayValue}
          </span>
        </div>
      </div>

      {showLabel && (
        <div className="text-center">
          <p className="wl-eyebrow">Score</p>
          <p className="mt-1 font-display text-lg font-bold text-foreground">
            {displayValue}
            <span className="text-muted-foreground">/100</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stateDescriptions[state]}
          </p>
        </div>
      )}
    </div>
  );
}

export default ScoreIndicator;