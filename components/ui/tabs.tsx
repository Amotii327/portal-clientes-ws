'use client';
import { cn } from '@/lib/utils';

/** Pestañas simples (botones con estado). */
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('scroll-x flex gap-1 rounded-lg border border-border bg-surface-2 p-1', className)}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cn('h-9 shrink-0 rounded px-3 text-sm font-medium transition-colors', value === it.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {it.label}
          {it.count !== undefined && <span className={cn('ml-2 rounded-full px-1.5 text-xs', value === it.id ? 'bg-primary-foreground/15' : 'bg-muted')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
