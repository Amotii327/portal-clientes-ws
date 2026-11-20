'use client';
import * as React from 'react';
import { CalendarClock, Check, Pencil, Wallet } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, fecha } from '@/lib/utils';
import { ESTADO_HITO, ESTADO_SPRINT } from '@/lib/app/proyectos';
import type { EstadoHito, HitoLineaDeTiempo, LineaDeTiempo } from '@/lib/supabase/database.types';

const TONO: Record<EstadoHito, 'neutral' | 'info' | 'warning' | 'success'> = { pendiente: 'neutral', en_curso: 'info', esperando_aprobacion: 'warning', terminado: 'success' };

function Nodo({ h }: { h: HitoLineaDeTiempo }) {
  const base = 'relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold';
  if (h.estado === 'terminado') return <span className={cn(base, 'border-primary bg-primary text-primary-foreground')} aria-hidden><Check className="size-4" strokeWidth={3} /></span>;
  if (h.estado === 'en_curso') return <span className={cn(base, 'border-info bg-info/15 text-info')} aria-hidden>{h.numero}</span>;
  if (h.estado === 'esperando_aprobacion') return <span className={cn(base, 'border-warning bg-warning/15 text-warning')} aria-hidden>{h.numero}</span>;
  return <span className={cn(base, 'border-border bg-surface text-muted-foreground')} aria-hidden>{h.numero}</span>;
}

/**
 * Línea de tiempo de los 13 hitos con datos reales (linea_de_tiempo). Para el cliente y para el super admin
 * (con onEditar aparece el lápiz de cada hito). El pago asociado solo se pinta si la base lo entregó.
 */
export function LineaDeTiempoReal({ datos, onEditar, esAdmin = false }: { datos: LineaDeTiempo; onEditar?: (h: HitoLineaDeTiempo) => void; esAdmin?: boolean }) {
  const sprints = datos.plan?.sprints ?? [];
  return (
    <ol className="relative" aria-label="Línea de tiempo del proyecto" data-testid="linea-de-tiempo">
      {datos.hitos.map((h, i) => {
        const ultimo = i === datos.hitos.length - 1;
        const retrasos = [...h.retrasos].sort((a, b) => b.creado_en.localeCompare(a.creado_en));
        const r = retrasos[0];
        return (
          <li key={h.id} className="relative flex gap-4 pb-6 last:pb-0" data-testid={`hito-${h.numero}`}>
            {!ultimo && <span className={cn('absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5', h.estado === 'terminado' ? 'bg-primary/60' : 'bg-border')} aria-hidden />}
            <Nodo h={h} />
            <div className={cn('min-w-0 flex-1 rounded-lg border bg-surface p-4', h.estado === 'esperando_aprobacion' ? 'border-warning/60' : h.estado === 'en_curso' ? 'border-info/50' : 'border-border')}>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Hito {h.numero} de 13{esAdmin && !h.visible ? ' · oculto al cliente' : ''}</p>
                  <h3 className="font-display text-base font-semibold">{h.nombre}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {h.atrasado && <Badge variant="danger">Atrasado</Badge>}
                  <Badge variant={TONO[h.estado]}>{ESTADO_HITO[h.estado]}</Badge>
                  {onEditar && <Button variant="ghost" size="icon" className="size-8" onClick={() => onEditar(h)} aria-label={`Editar hito ${h.numero}`}><Pencil /></Button>}
                </div>
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="size-4 text-muted-foreground" aria-hidden /><dt className="text-muted-foreground">Planeada:</dt>
                  {r ? <><dd className="line-through opacity-60">{fecha(r.fecha_anterior)}</dd><dd className="font-medium">{fecha(r.fecha_nueva)}</dd></> : <dd>{fecha(h.fecha_planeada)}</dd>}
                </div>
                {h.fecha_real && <div className="flex gap-1.5"><dt className="text-muted-foreground">Real:</dt><dd>{fecha(h.fecha_real)}</dd></div>}
                {h.pago_asociado && <div className="flex items-center gap-1.5"><Wallet className="size-4 text-muted-foreground" aria-hidden /><dt className="text-muted-foreground">Pago:</dt><dd>{h.pago_asociado}</dd></div>}
              </dl>
              {h.numero === 6 && sprints.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {sprints.map((s) => (
                    <span key={s.id} className={cn('rounded-full border px-2.5 py-0.5', s.estado === 'terminado' ? 'border-success/40 bg-success/10 text-success' : s.estado === 'en_curso' || s.estado === 'en_revision' ? 'border-info/40 bg-info/10 text-info' : 'border-border text-muted-foreground')}>
                      Sprint {s.numero} · {ESTADO_SPRINT[s.estado].toLowerCase()}
                    </span>
                  ))}
                </div>
              )}
              {r && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={r.lado === 'cliente' ? 'info' : 'warning'}>{r.lado === 'cliente' ? 'Esperando al cliente' : 'Retraso por Websourcing'}</Badge>
                    {retrasos.length > 1 && <span className="text-xs text-muted-foreground">{retrasos.length} cambios de fecha</span>}
                  </div>
                  <p className="text-sm"><span className="text-muted-foreground">Motivo:</span> {r.motivo}</p>
                  {r.lado === 'cliente' && r.que_falta && h.estado !== 'terminado' && (
                    <Alert variant="warning" title={esAdmin ? 'Falta algo del cliente' : 'Falta algo de tu lado'}>{r.que_falta}</Alert>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
