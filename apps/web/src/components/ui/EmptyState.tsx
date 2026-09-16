/**
 * EmptyState — honest empty state with explanation, abstract visual, optional
 * example, and primary CTA. Never invents statistics.
 */
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon: ReactNode;
  /** Icon tint: any of the semantic palette keys. */
  tone?: 'ai' | 'opportunity' | 'verified' | 'creative' | 'primary' | 'warning' | 'muted';
  title: string;
  description?: string;
  action?: ReactNode;
  /** Optional example hint line, e.g. "Try: https://maps.google.com/place/..." */
  example?: string;
  className?: string;
}

const toneStyles: Record<NonNullable<EmptyStateProps['tone']>, string> = {
  ai: 'bg-ai/10 text-ai',
  opportunity: 'bg-opportunity/12 text-opportunity',
  verified: 'bg-verified/10 text-verified',
  creative: 'bg-creative/10 text-creative',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning/15 text-warning-foreground',
  muted: 'bg-secondary text-muted-foreground',
};

export default function EmptyState({
  icon,
  tone = 'muted',
  title,
  description,
  action,
  example,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('wl-card relative overflow-hidden px-6 py-14 text-center', className)}>
      {/* Soft decorative corner glow */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full opacity-50 blur-3xl"
        style={{ background: `hsl(var(--primary) / 0.08)` }} />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-16 h-40 w-40 rounded-full opacity-50 blur-3xl"
        style={{ background: `hsl(var(--ai) / 0.08)` }} />

      <div className="relative">
        <div className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-2xl', toneStyles[tone])}>
          {icon}
        </div>
        <h3 className="mt-6 font-display text-xl font-bold text-foreground">{title}</h3>
        {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {example ? (
          <p className="mx-auto mt-3 max-w-md text-xs leading-5 text-muted-foreground/80">
            <span className="font-medium text-muted-foreground">Try:</span> {example}
          </p>
        ) : null}
        {action ? <div className="mt-7 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}