'use client';
import * as React from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className, children, title, description, side = 'center', ...p
}: Omit<React.ComponentPropsWithoutRef<typeof D.Content>, 'title'> & { title: string; description?: string; side?: 'center' | 'left' }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-[60] bg-black/70" />
      <D.Content
        aria-describedby={description ? undefined : undefined}
        className={cn(
          'fixed z-[70] flex max-h-[90dvh] flex-col overflow-y-auto border border-border bg-surface shadow-card',
          side === 'center' && 'left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg p-5 sm:p-6',
          side === 'left' && 'inset-y-0 left-0 w-[86%] max-w-xs p-4',
          className
        )}
        {...p}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="font-display text-lg font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Cerrar">
            <X className="size-5" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
