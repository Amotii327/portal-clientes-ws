'use client';
import { Check, CalendarClock, Pencil, Wallet } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { HitoBadge, LadoBadge } from '@/components/ds/badges';
import { cn, cop, fecha } from '@/lib/utils';
import type { Hito, Pago, Proyecto } from '@/lib/data';
import { Enlace } from '@/lib/router';

/** Línea de tiempo de los 13 hitos. El pago asociado se oculta si la persona no puede ver dinero. */
export function Timeline({ proyecto, pagos, verDinero, mantenimientoActivo, onEditar, ocultarSprints }: {
  proyecto: Proyecto; pagos: Pago[]; verDinero: boolean; mantenimientoActivo: boolean; onEditar?: (h: Hito) => void; ocultarSprints?: boolean;
}) {
  const hitos = proyecto.hitos.filter((h) => !(h.soloMantenimiento && !mantenimientoActivo));
  return (
    <ol className="relative" aria-label="Línea de tiempo del proyecto">
      {hitos.map((h, i) => {
        const pago = h.pagoId ? pagos.find((p) => p.id === h.pagoId) : undefined;
        const ultimo = i === hitos.length - 1;
        return (
          <li key={h.n} className="relative flex gap-4 pb-6 last:pb-0">
            {!ultimo && <span className={cn('absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5', h.estado === 'terminado' ? 'bg-primary/60' : 'bg-border')} aria-hidden />}
            <Nodo h={h} />
            <div className={cn('min-w-0 flex-1 rounded-lg border bg-surface p-4', h.estado === 'esperando' ? 'border-warning/60' : h.estado === 'en_curso' ? 'border-info/50' : 'border-border')}>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Hito {h.n} de 13</p>
                  <h3 className="font-display text-base font-semibold">{h.nombre}{h.sprint && !ocultarSprints ? ` · Sprint ${h.sprint.actual} de ${h.sprint.total}` : ''}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <HitoBadge estado={h.estado} />
                  {onEditar && <Button variant="ghost" size="icon" className="size-8" onClick={() => onEditar(h)} aria-label={`Editar hito ${h.n}`}><Pencil /></Button>}
                </div>
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex items-center gap-1.5"><CalendarClock className="size-4 text-muted-foreground" aria-hidden /><dt className="text-muted-foreground">Planeada:</dt><dd className={h.retraso ? 'line-through opacity-60' : ''}>{fecha(h.retraso ? h.retraso.anterior : h.planeada)}</dd>{h.retraso && <dd className="font-medium">{fecha(h.retraso.nueva)}</dd>}</div>
                {h.real && <div className="flex gap-1.5"><dt className="text-muted-foreground">Real:</dt><dd>{fecha(h.real)}</dd></div>}
                {h.pagoId && verDinero && pago && (
                  <div className="flex items-center gap-1.5"><Wallet className="size-4 text-muted-foreground" aria-hidden /><dt className="text-muted-foreground">Pago:</dt><dd>{pago.concepto} · {cop(pago.valor)}</dd></div>
                )}
              </dl>
              {h.sprint && h.n === 6 && !ocultarSprints && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {Array.from({ length: h.sprint.total }, (_, k) => {
                    const hecho = k + 1 < h.sprint!.actual || (h.estado === 'terminado');
                    const act = k + 1 === h.sprint!.actual && h.estado !== 'terminado';
                    return <span key={k} className={cn('rounded-full border px-2.5 py-0.5', hecho ? 'border-success/40 bg-success/10 text-success' : act ? 'border-info/40 bg-info/10 text-info' : 'border-border text-muted-foreground')}>Sprint {k + 1}{hecho ? ' · listo' : act ? ' · en curso' : ''}</span>;
                  })}
                </div>
              )}
              {h.detalle && <p className="mt-3 text-sm text-muted-foreground">{h.detalle}</p>}
              {h.retraso && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><LadoBadge lado={h.retraso.lado} /><span className="text-xs text-muted-foreground">Nueva fecha: {fecha(h.retraso.nueva)}</span></div>
                  <p className="text-sm"><span className="text-muted-foreground">Motivo:</span> {h.retraso.motivo}</p>
                  {h.retraso.lado === 'cliente' && h.retraso.falta && (
                    <Alert variant="warning" title="Falta algo de tu lado" action={<Button size="sm" variant="secondary" asChild><Enlace to="/cliente/documentos">Ir a archivos</Enlace></Button>}>{h.retraso.falta}</Alert>
                  )}
                </div>
              )}
              {h.estado === 'esperando' && !onEditar && (
                <div className="mt-3"><Button size="sm" asChild><Enlace to="/cliente/revisiones">Revisar y responder</Enlace></Button></div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Nodo({ h }: { h: Hito }) {
  const base = 'relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold';
  if (h.estado === 'terminado') return <span className={cn(base, 'border-primary bg-primary text-primary-foreground')} aria-hidden><Check className="size-4" strokeWidth={3} /></span>;
  if (h.estado === 'en_curso') return <span className={cn(base, 'border-info bg-info/15 text-info')} aria-hidden>{h.n}</span>;
  if (h.estado === 'esperando') return <span className={cn(base, 'border-warning bg-warning/15 text-warning')} aria-hidden>{h.n}</span>;
  return <span className={cn(base, 'border-border bg-surface text-muted-foreground')} aria-hidden>{h.n}</span>;
}
