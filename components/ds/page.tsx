import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function PageHeader({ titulo, descripcion, acciones, eyebrow }: { titulo: string; descripcion?: React.ReactNode; acciones?: React.ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-widest text-primary-text">{eyebrow}</p>}
        <h1 className="text-display-lg">{titulo}</h1>
        {descripcion && <p className="mt-2 max-w-2xl text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </header>
  );
}

export function Stat({ etiqueta, valor, nota, tono, icono }: { etiqueta: string; valor: React.ReactNode; nota?: React.ReactNode; tono?: 'danger' | 'warning' | 'success'; icono?: React.ReactNode }) {
  const c = tono === 'danger' ? 'text-danger' : tono === 'warning' ? 'text-warning' : tono === 'success' ? 'text-success' : 'text-foreground';
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{etiqueta}</span>{icono}</div>
      <p className={cn('mt-2 font-display text-3xl font-semibold leading-none', c)}>{valor}</p>
      {nota && <p className="mt-2 text-xs text-muted-foreground">{nota}</p>}
    </Card>
  );
}

/** Sección con título dentro de una página. */
export function Seccion({ titulo, descripcion, acciones, children, className }: { titulo: string; descripcion?: string; acciones?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('mb-8 min-w-0', className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-display-md">{titulo}</h2>
          {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

export const EjemploChip = () => (
  <span className="inline-flex items-center rounded-full border border-dashed border-warning/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-warning">Cifras de ejemplo</span>
);

export const OcultoPorPermiso = ({ texto = 'Sin permiso para ver valores' }: { texto?: string }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><EyeOff className="size-3.5" aria-hidden />{texto}</span>
);
export const Visible = Eye;
