import { cn } from '@/lib/utils';

export function Progress({ value, className, tone = 'primary', marker, label }: { value: number; className?: string; tone?: 'primary' | 'warning' | 'danger'; marker?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const color = { primary: 'bg-primary', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div className={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${v}%` }} />
      {marker !== undefined && <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${marker}%` }} aria-hidden />}
    </div>
  );
}
