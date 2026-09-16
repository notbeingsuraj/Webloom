import { cn } from '../../lib/utils';
import { badgeVariants } from './badge';
import type { VariantProps } from 'class-variance-authority';

type StatusBadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  status: string;
} & VariantProps<typeof badgeVariants>;

const variantByStatus: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
  new: 'muted',
  analysing: 'info',
  analysed: 'ai',
  qualified: 'success',
  contacted: 'opportunity',
  won: 'verified',
  lost: 'destructive',
  follow_up: 'info',
  high: 'opportunity',
  critical: 'destructive',
  complete: 'verified',
  ok: 'verified',
  failed: 'destructive',
  medium: 'warning',
  low: 'muted',
  not_attempted: 'muted',
  pending: 'muted',
  generated: 'verified',
  not_started: 'muted',
};

export default function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const label = status?.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) ?? 'Unknown';
  return (
    <span className={cn(badgeVariants({ variant: variantByStatus[status] ?? 'muted' }), 'tracking-[0.02em]', className)} {...props}>
      {label}
    </span>
  );
}
