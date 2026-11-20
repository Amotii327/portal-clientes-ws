import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      neutral: 'border-border bg-surface-2 text-muted-foreground',
      primary: 'border-primary/40 bg-primary/15 text-primary-text',
      success: 'border-success/40 bg-success/15 text-success',
      warning: 'border-warning/40 bg-warning/15 text-warning',
      danger: 'border-danger/40 bg-danger/15 text-danger',
      info: 'border-info/40 bg-info/15 text-info',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, variant, ...p }: BadgeProps) => <span className={cn(badgeVariants({ variant }), className)} {...p} />;
