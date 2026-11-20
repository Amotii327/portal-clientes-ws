import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 font-semibold',
        secondary: 'bg-surface-2 text-foreground border border-border hover:bg-muted',
        outline: 'border border-border bg-transparent text-foreground hover:bg-surface-2',
        ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        destructive: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
        link: 'text-primary-text underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        default: 'h-10 px-4 text-sm',
        sm: 'h-9 px-3 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} type={asChild ? undefined : type ?? 'button'} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
);
Button.displayName = 'Button';
