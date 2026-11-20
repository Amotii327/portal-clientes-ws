'use client';
import { CheckCircle2 } from 'lucide-react';
import { useStore } from '@/lib/store';

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-primary/40 bg-surface px-4 py-3 text-sm shadow-card">
          <CheckCircle2 className="size-5 shrink-0 text-primary-text" aria-hidden />{t.texto}
        </div>
      ))}
    </div>
  );
}
