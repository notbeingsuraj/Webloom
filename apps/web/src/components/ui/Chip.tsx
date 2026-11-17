import * as React from "react";
import { cn } from "../../lib/utils";

interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'verified' | 'opportunity' | 'ai' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors';
    const sizeStyles = {
      sm: 'px-2 py-0.5 text-[10px]',
      md: 'px-2.5 py-1 text-xs',
      lg: 'px-3 py-1.5 text-sm',
    };
    const variantStyles = {
      default: 'border-border bg-secondary text-muted-foreground',
      verified: 'border-verified/30 bg-verified/10 text-verified',
      opportunity: 'border-opportunity/30 bg-opportunity/10 text-opportunity',
      ai: 'border-ai/30 bg-ai/10 text-ai',
      warning: 'border-warning/30 bg-warning/10 text-warning-foreground',
      danger: 'border-danger/30 bg-danger/10 text-danger',
    };

    return (
      <span
        ref={ref}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);
Chip.displayName = "Chip";

export default Chip;