import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex flex-wrap gap-3 rounded-lg border p-4 text-sm sm:flex-nowrap', {
  variants: {
    variant: {
      info: 'border-info/40 bg-info/10',
      success: 'border-success/40 bg-success/10',
      warning: 'border-warning/40 bg-warning/10',
      danger: 'border-danger/40 bg-danger/10',
    },
  },
  defaultVariants: { variant: 'info' },
});
const ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XOctagon } as const;
const ICON_COLOR = { info: 'text-info', success: 'text-success', warning: 'text-warning', danger: 'text-danger' } as const;

export function Alert({
  className, variant = 'info', title, children, action, ...p
}: Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & VariantProps<typeof alertVariants> & { title?: React.ReactNode; action?: React.ReactNode }) {
  const v = variant ?? 'info';
  const Icon = ICON[v];
  return (
    <div role={v === 'danger' ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)} {...p}>
      <Icon className={cn('mt-0.5 size-5 shrink-0', ICON_COLOR[v])} aria-hidden />
      <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-0">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        {children && <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>}
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto sm:self-center">{action}</div>}
    </div>
  );
}
