import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 gap-2 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.55)] hover:bg-primary/90 hover:shadow-[0_10px_28px_-8px_hsl(var(--primary)/0.65)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-primary/40",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-success text-success-foreground hover:bg-success/90",
        ai: "bg-ai text-ai-foreground shadow-[0_8px_24px_-8px_hsl(var(--ai)/0.55)] hover:bg-ai/90",
        opportunity: "bg-opportunity text-opportunity-foreground shadow-[0_8px_24px_-8px_hsl(var(--opportunity)/0.55)] hover:bg-opportunity/90",
        creative: "bg-creative text-creative-foreground shadow-[0_8px_24px_-8px_hsl(var(--creative)/0.55)] hover:bg-creative/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-full px-3",
        md: "h-11 rounded-full px-5",
        lg: "h-12 rounded-full px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, leadingIcon, trailingIcon, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
        {leadingIcon ? <span className="inline-flex items-center">{leadingIcon}</span> : null}
        {children}
        {trailingIcon ? <span className="inline-flex items-center">{trailingIcon}</span> : null}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

// Default export for backward-compatible `import Button from './ui/Button'`
export default Button;
