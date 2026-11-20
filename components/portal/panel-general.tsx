'use client';
import * as React from 'react';
import { AlertOctagon, Building2, CalendarClock, ClipboardList, LifeBuoy, Presentation, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PageHeader, Seccion, Stat } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { Enlace, ir } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { panelSuperAdmin } from '@/lib/portal/acciones';
import { useCargar } from '@/lib/app/datos';
import { ESTADO_PROYECTO } from '@/lib/app/proyectos';
import type { ItemAtencion } from '@/lib/supabase/database.types';
import { fecha } from '@/lib/utils';

const enlaceProyecto = (empresa: string, proyecto: string) => `/admin/proyectos/${empresa}/${proyecto}`;

function Atencion({ x }: { x: ItemAtencion }) {
  const base = 'flex flex-wrap items-center gap-x-3 gap-y-1 py-3';
  if (x.tipo === 'hito_atrasado') {
    return (
      <li className={base} data-testid="atencion-hito">
        <Badge variant={x.esperando_al_cliente ? 'info' : 'danger'}>Hito atrasado</Badge>
        <Enlace className="min-w-0 flex-1 hover:underline" to={enlaceProyecto(x.empresa_id, x.proyecto_id)}>{x.empresa_nombre} · {x.proyecto_nombre} · hito {x.hito_numero} ({x.hito_nombre})</Enlace>
        <span className="text-muted-foreground">{x.dias_de_atraso} {x.dias_de_atraso === 1 ? 'día' : 'días'}{x.esperando_al_cliente ? ' · espera al cliente' : ''}</span>
      </li>
    );
  }
  if (x.tipo === 'plan_por_aprobar') {
    return (
      <li className={base} data-testid="atencion-plan">
        <Badge variant="warning">Plan por aprobar</Badge>
        <Enlace className="min-w-0 flex-1 hover:underline" to={`${enlaceProyecto(x.empresa_id, x.proyecto_id)}/plan`}>{x.empresa_nombre} · {x.proyecto_nombre}</Enlace>
        <span className="text-muted-foreground">el cliente aún no lo ve</span>
      </li>
    );
  }
  return (
    <li className={base} data-testid="atencion-demo">
      <Badge variant="primary">Demo próxima</Badge>
      <Enlace className="min-w-0 flex-1 hover:underline" to={enlaceProyecto(x.empresa_id, x.proyecto_id)}>{x.empresa_nombre} · {x.proyecto_nombre}</Enlace>
      <span className="text-muted-foreground">{fecha(x.fecha)}</span>
    </li>
  );
}

/** Panel general del super admin con datos reales (panel_super_admin). Pagos y tickets llegan en los sprints 4 y 5. */
export function PanelGeneralReal() {
  const { estado, datos, recargar } = useCargar(async () => {
    const { data, error } = await panelSuperAdmin(crearClienteNavegador());
    if (error || !data) throw new Error('lectura_fallida');
    return data;
  }, []);
  const cab = <PageHeader eyebrow="Zona del super administrador" titulo="Panel general" descripcion="Lo que necesita tu atención hoy, de todos los clientes." />;
  if (estado === 'cargando') return <>{cab}<EstadoCargando /></>;
  if (estado === 'error' || !datos) return <>{cab}<EstadoError onReintentar={() => recargar()} /></>;
  const t = datos.totales;
  if (datos.proyectos.length === 0 && t.empresas_activas + t.empresas_pausadas === 0) {
    return <>{cab}<EstadoVacio titulo="Aún no hay clientes" texto="Crea la primera empresa cliente para empezar."><Button asChild><Enlace to="/admin/clientes">Ir a clientes</Enlace></Button></EstadoVacio></>;
  }
  return (
    <>
      {cab}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat etiqueta="Proyectos activos" valor={t.proyectos_activos} nota={`${t.empresas_activas} empresas activas${t.empresas_pausadas ? ` · ${t.empresas_pausadas} pausadas` : ''}`} icono={<Building2 className="size-5" />} />
        <Stat etiqueta="Hitos con retraso" valor={t.hitos_atrasados} tono={t.hitos_atrasados ? 'warning' : undefined} nota="Con fecha vencida y sin terminar" icono={<CalendarClock className="size-5" />} />
        <Stat etiqueta="Planes por aprobar" valor={t.planes_por_aprobar} tono={t.planes_por_aprobar ? 'warning' : undefined} nota="Propuestas que el cliente aún no ve" icono={<ClipboardList className="size-5" />} />
        <Stat etiqueta="Demos en 7 días" valor={t.demos_proximas_7_dias} nota="Próximas demos con el cliente" icono={<Presentation className="size-5" />} />
        <Stat etiqueta="Pagos vencidos" valor={t.pagos_vencidos ?? '—'} nota="Llega con el módulo de dinero" icono={<Wallet className="size-5" />} />
        <Stat etiqueta="Tickets abiertos" valor={t.tickets_abiertos ?? '—'} nota="Llega con el módulo de tickets" icono={<LifeBuoy className="size-5" />} />
      </div>
      <Card className="mb-8">
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertOctagon className="size-5 text-warning" aria-hidden />Requiere tu atención</CardTitle></CardHeader>
        <CardContent>
          {datos.atencion.length === 0
            ? <p className="py-3 text-sm text-muted-foreground" data-testid="atencion-vacia">Todo al día. No hay nada que atender ahora.</p>
            : <ul className="divide-y divide-border text-sm" data-testid="atencion">{datos.atencion.map((x, i) => <Atencion key={i} x={x} />)}</ul>}
        </CardContent>
      </Card>
      <Seccion titulo="Proyectos" acciones={<Button size="sm" variant="secondary" asChild><Enlace to="/admin/proyectos">Ver todos y crear</Enlace></Button>}>
        <Table>
          <THead><TR><TH>Cliente</TH><TH>Proyecto</TH><TH className="w-56">Avance</TH><TH>Próxima demo</TH><TH>Estado</TH></TR></THead>
          <TBody>
            {datos.proyectos.length === 0 && <TR><TD colSpan={5} className="text-muted-foreground">Todavía no hay proyectos.</TD></TR>}
            {datos.proyectos.map((p) => (
              <TR key={p.proyecto_id} className="cursor-pointer" onClick={() => ir(enlaceProyecto(p.empresa_id, p.proyecto_id))}>
                <TD className="font-medium">{p.empresa_nombre}</TD>
                <TD><Enlace to={enlaceProyecto(p.empresa_id, p.proyecto_id)} className="text-primary-text hover:underline">{p.nombre}</Enlace></TD>
                <TD><div className="flex items-center gap-3"><Progress className="flex-1" value={p.avance_pct} label={`Avance de ${p.nombre}`} /><span className="w-12 text-right tabular-nums">{Math.round(p.avance_pct * 10) / 10}%</span></div></TD>
                <TD>{p.proxima_demo ? fecha(p.proxima_demo) : '—'}</TD>
                <TD>{p.empresa_estado === 'pausada' ? <Badge variant="warning">Empresa pausada</Badge> : <Badge variant={p.estado === 'activo' ? 'info' : 'neutral'}>{ESTADO_PROYECTO[p.estado]}</Badge>}{p.hitos_atrasados > 0 && <Badge variant="danger" className="ml-1.5">{p.hitos_atrasados} atrasado{p.hitos_atrasados > 1 ? 's' : ''}</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Seccion>
    </>
  );
}
