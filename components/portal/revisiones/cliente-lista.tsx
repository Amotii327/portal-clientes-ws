'use client';
import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { useCargar } from '@/lib/app/datos';
import { Enlace } from '@/lib/router';
import type { Revision } from '@/lib/supabase/tipos-revisiones-docs';
import { ETIQUETA_TIPO, EstadoBadge, fechaCo, useAcceso } from './comun';
import { leerLista, type ProyectoMini } from './datos';

function Fila({ r, proyecto }: { r: Revision; proyecto?: ProyectoMini }) {
  return (
    <li>
      <Enlace to={`/cliente/revisiones/${r.id}`} className={`block rounded-lg border bg-surface p-4 shadow-card transition-colors hover:bg-surface-2 sm:p-5 ${r.estado === 'publicada' ? 'border-warning/60' : 'border-[rgb(var(--card-border))]'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{ETIQUETA_TIPO[r.tipo]} · {proyecto?.nombre ?? 'Proyecto'} · versión {r.version_actual}</p>
            <p className="mt-1 break-words font-display text-lg font-semibold leading-tight">{r.titulo}</p>
            <p className="mt-1 text-xs text-muted-foreground">Actualizada el {fechaCo(r.actualizado_en)}</p>
          </div>
          <div className="flex items-center gap-2"><EstadoBadge estado={r.estado} /><ChevronRight className="size-5 text-muted-foreground" aria-hidden /></div>
        </div>
      </Enlace>
    </li>
  );
}

/** Revisiones del cliente: lo que espera su respuesta y lo ya respondido. Los borradores no llegan (la base los filtra). */
export function RevisionesClienteLista() {
  const a = useAcceso();
  const { estado, datos, recargar } = useCargar(leerLista, []);
  const pendientes = (datos?.revisiones ?? []).filter((r) => r.estado === 'publicada');
  const resto = (datos?.revisiones ?? []).filter((r) => r.estado !== 'publicada');
  const proyecto = (r: Revision) => datos?.proyectos.find((p) => p.id === r.proyecto_id);
  return (
    <>
      <PageHeader titulo="Revisiones" descripcion="Aquí revisas cada sprint y el diseño con su link de prueba, su video y su acta, y nos dices si apruebas o si quieres cambios." />
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => recargar()} />}
      {estado === 'ok' && datos && (
        <>
          {a.soloLectura && <Alert className="mb-6" variant="info" title='Modo "ver como": solo lectura'>Ves lo mismo que ve el cliente. Desde aquí no se aprueba nada.</Alert>}
          {pendientes.length > 0 && (
            <Alert className="mb-6" variant="warning" title={pendientes.length === 1 ? 'Tienes 1 revisión por aprobar' : `Tienes ${pendientes.length} revisiones por aprobar`}>
              {a.tienePermisoAprobar ? 'Ábrela, revisa el link de prueba y dinos si apruebas o si quieres cambios.' : 'Puedes mirarla, pero no aprobarla: tu administrador decide quién aprueba. Si necesitas hacerlo, pídele el permiso en "Mi equipo".'}
            </Alert>
          )}
          {datos.revisiones.length === 0 ? (
            <EstadoVacio titulo="No hay revisiones todavía" texto="Cuando publiquemos un sprint o un diseño para tu revisión, aparecerá aquí." />
          ) : (
            <div className="space-y-8">
              {pendientes.length > 0 && (
                <section aria-label="Esperan tu respuesta"><h2 className="mb-3 text-display-md">Esperan tu respuesta</h2><ul className="space-y-3">{pendientes.map((r) => <Fila key={r.id} r={r} proyecto={proyecto(r)} />)}</ul></section>
              )}
              <section aria-label="Respondidas"><h2 className="mb-3 text-display-md">{pendientes.length > 0 ? 'Respondidas y anteriores' : 'Historial de revisiones'}</h2>
                {resto.length === 0 ? <Card className="p-6 text-center text-sm text-muted-foreground">Todavía no hay revisiones respondidas.</Card> : <ul className="space-y-3">{resto.map((r) => <Fila key={r.id} r={r} proyecto={proyecto(r)} />)}</ul>}
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}
