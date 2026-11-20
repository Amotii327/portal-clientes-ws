'use client';
import * as React from 'react';
import { CalendarDays, CalendarClock, Flag, History, Layers } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader, Stat } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { inicioCliente, lineaDeTiempo } from '@/lib/portal/acciones';
import { ESTADO_SPRINT, textoHistorial } from '@/lib/app/proyectos';
import { useCargar } from '@/lib/app/datos';
import type { LineaDeTiempo, TipoHistorial, Json } from '@/lib/supabase/database.types';
import { fecha } from '@/lib/utils';
import { LineaDeTiempoReal } from './linea-tiempo';
import { EspacioDeMiEmpresa } from './espacio/barra';
import { usePortal } from './contexto';

export interface FilaHistorial { id: number; tipo: TipoHistorial; actor_tipo: string; detalle: Json; visible_cliente: boolean; creado_en: string }

export async function leerHistorial(proyectoId: string): Promise<FilaHistorial[]> {
  const { data, error } = await crearClienteNavegador().from('historial_proyecto').select('*').eq('proyecto_id', proyectoId).order('id', { ascending: false });
  if (error) throw new Error('lectura_fallida');
  return (data ?? []) as FilaHistorial[];
}

/** Plan de sprints tal como lo ve el cliente (solo existe cuando el plan está aprobado) y sus cambios con motivo. */
export function PlanParaCliente({ plan }: { plan: NonNullable<LineaDeTiempo['plan']> }) {
  return (
    <section className="mb-10" data-testid="plan-cliente">
      <h2 className="mb-4 flex items-center gap-2 text-display-md"><Layers className="size-5 text-primary-text" aria-hidden />Plan de sprints</h2>
      <Table>
        <THead><TR><TH>Sprint</TH><TH>Estado</TH><TH>Fechas</TH><TH>Demo</TH><TH>Incluye</TH></TR></THead>
        <TBody>
          {plan.sprints.map((s) => (
            <TR key={s.id} data-testid="fila-sprint">
              <TD className="font-medium">{s.numero}. {s.nombre}</TD>
              <TD><Badge variant={s.estado === 'terminado' ? 'success' : s.estado === 'en_curso' || s.estado === 'en_revision' ? 'info' : 'neutral'}>{ESTADO_SPRINT[s.estado]}</Badge></TD>
              <TD className="whitespace-nowrap text-muted-foreground">{fecha(s.fecha_inicio, true)} – {fecha(s.fecha_fin)}</TD>
              <TD className="whitespace-nowrap">{s.fecha_demo ? fecha(s.fecha_demo) : '—'}</TD>
              <TD className="text-muted-foreground">{s.incluye.length ? s.incluye.join(' · ') : '—'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {plan.cambios.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm" aria-label="Cambios al plan">
          {plan.cambios.map((c, i) => (
            <li key={i} className="rounded-lg border border-border bg-surface p-3"><span className="text-muted-foreground">{fecha(c.creado_en)} · cambio al plan:</span> {c.motivo}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function HistorialLista({ filas, esAdmin = false }: { filas: FilaHistorial[]; esAdmin?: boolean }) {
  if (filas.length === 0) return <p className="py-3 text-sm text-muted-foreground">Todavía no hay movimientos en este proyecto.</p>;
  return (
    <ul className="divide-y divide-border" data-testid="historial">
      {filas.map((x) => (
        <li key={x.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:gap-4">
          <span className="shrink-0 text-muted-foreground sm:w-28">{fecha(x.creado_en)}</span>
          <span className="min-w-0 flex-1">{textoHistorial(x.tipo, x.detalle)}{x.actor_tipo === 'cliente' ? ' (tu equipo)' : ''}</span>
          <span className="flex shrink-0 gap-2 text-xs text-muted-foreground">
            {esAdmin ? <Badge variant={x.visible_cliente ? 'success' : 'neutral'}>{x.visible_cliente ? 'Lo ve el cliente' : 'Interno'}</Badge> : <span>Equipo Websourcing</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Inicio del cliente con datos reales: avance, línea de tiempo de 13 hitos, plan aprobado e historial. */
export function InicioClienteReal() {
  const ctx = usePortal();
  const { estado, datos, recargar } = useCargar(async () => {
    const { data, error } = await inicioCliente(crearClienteNavegador());
    if (error || !data) throw new Error('lectura_fallida');
    return data;
  }, []);
  const [pid, setPid] = React.useState<string | null>(null);
  const elegido = pid ?? datos?.proyectos[0]?.proyecto_id ?? null;
  const detalle = useCargar(async () => {
    if (!elegido) return null;
    const c = crearClienteNavegador();
    const [l, h] = await Promise.all([lineaDeTiempo(c, elegido), leerHistorial(elegido)]);
    if (l.error || !l.data) throw new Error('lectura_fallida');
    return { linea: l.data, historial: h };
  }, [elegido]);

  const quien = ctx.empresa?.nombre ?? '';
  if (estado === 'cargando') return <><PageHeader titulo="Tu proyecto" /><EstadoCargando /></>;
  if (estado === 'error' || !datos) return <><PageHeader titulo="Tu proyecto" /><EstadoError onReintentar={() => recargar()} /></>;
  if (datos.proyectos.length === 0) {
    return <><PageHeader eyebrow={quien} titulo="Tu proyecto" /><EstadoVacio titulo="Todavía no tienes un proyecto" texto="Cuando el Equipo Websourcing cree tu proyecto, aquí verás su línea de tiempo con los 13 hitos." /></>;
  }
  const p = datos.proyectos.find((x) => x.proyecto_id === elegido) ?? datos.proyectos[0];
  const pendientes = datos.pendientes_del_cliente.filter((x) => x.proyecto_id === p.proyecto_id);
  const planAprobado = p.plan_estado === 'aprobado';
  const l = detalle.datos?.linea;

  return (
    <>
      <PageHeader eyebrow={quien} titulo={p.nombre} descripcion="Aquí ves el recorrido completo de tu proyecto, como el rastreo de un paquete." />
      {datos.proyectos.length > 1 && <Tabs className="mb-6 w-fit max-w-full" value={p.proyecto_id} onChange={setPid} items={datos.proyectos.map((x) => ({ id: x.proyecto_id, label: x.nombre }))} />}
      {pendientes.map((x) => (
        <Alert key={x.hito_numero} variant="warning" className="mb-4" title={`Falta algo de tu lado: hito ${x.hito_numero} · ${x.hito_nombre}`}>
          {x.que_falta} <span className="block text-xs">Nueva fecha del hito: {fecha(x.fecha_nueva)}. Motivo: {x.motivo}</span>
        </Alert>
      ))}
      <EspacioDeMiEmpresa />
      <div className="mb-10 mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 sm:col-span-2 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Avance del proyecto</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none" data-testid="avance-pct">{Math.round(p.avance_pct * 10) / 10}%</p>
          <Progress className="mt-3" value={p.avance_pct} label="Avance del proyecto" />
          <p className="mt-2 text-xs text-muted-foreground" data-testid="avance-partes">{p.avance_partes_hechas}/{p.avance_partes_total} partes</p>
        </Card>
        <Stat etiqueta="Sprint actual" valor={planAprobado && p.sprint_actual_numero ? `${p.sprint_actual_numero}` : '—'} nota={planAprobado && p.sprint_actual_nombre ? p.sprint_actual_nombre : 'Aún no hay sprint en marcha'} icono={<Layers className="size-5" />} />
        <Stat etiqueta="Próxima demo" valor={planAprobado && p.proxima_demo ? fecha(p.proxima_demo, true) : '—'} nota={planAprobado && p.proxima_demo ? 'Te avisamos antes' : 'Sin demo programada'} icono={<CalendarDays className="size-5" />} />
        <Stat etiqueta="Hitos atrasados" valor={p.hitos_atrasados} tono={p.hitos_atrasados ? 'warning' : undefined} nota={p.hito_actual_nombre ? `Ahora: ${p.hito_actual_nombre}` : 'Todo al día'} icono={<CalendarClock className="size-5" />} />
      </div>
      {detalle.estado === 'cargando' && <EstadoCargando />}
      {detalle.estado === 'error' && <EstadoError onReintentar={() => detalle.recargar()} />}
      {detalle.estado === 'ok' && detalle.datos && l && (
        <>
          <section className="mb-10">
            <h2 className="mb-4 flex items-center gap-2 text-display-md"><Flag className="size-5 text-primary-text" aria-hidden />Línea de tiempo</h2>
            <LineaDeTiempoReal datos={l} />
          </section>
          {l.plan && <PlanParaCliente plan={l.plan} />}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5 text-primary-text" aria-hidden />Historial del proyecto</CardTitle></CardHeader>
            <CardContent><HistorialLista filas={detalle.datos.historial} /></CardContent>
          </Card>
        </>
      )}
    </>
  );
}
