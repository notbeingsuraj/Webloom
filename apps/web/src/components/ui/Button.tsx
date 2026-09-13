import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-500 focus-visible:ring-primary-500',
  secondary:
    'bg-webloom-raised text-webloom-text border border-webloom-border hover:bg-webloom-hover focus-visible:ring-primary-500',
  ghost:
    'bg-transparent text-webloom-text hover:bg-webloom-hover focus-visible:ring-primary-500',
  danger:
    'bg-webloom-surface text-webloom-danger border border-webloom-border hover:bg-webloom-hover focus-visible:ring-webloom-danger',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-webloom-bg disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    >
      {leadingIcon ? <span className="inline-flex items-center">{leadingIcon}</span> : null}
      {children}
      {trailingIcon ? <span className="inline-flex items-center">{trailingIcon}</span> : null}
    </button>
  );
}
