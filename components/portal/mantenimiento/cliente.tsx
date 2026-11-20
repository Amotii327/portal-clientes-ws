'use client';
import * as React from 'react';
import { BellRing, CalendarCheck, CheckCircle2, Clock, MinusCircle, Wallet, Wrench } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader, Seccion } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { avisosDeBolsa } from '@/lib/portal/acciones-tickets';
import { autorizarHorasExtra, decidirHorasExtra, horasRegistradas, miMantenimientoActivo, miPlanMantenimiento, resumenDeBolsas } from '@/lib/portal/acciones-mantenimiento';
import { useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import { cn, fecha } from '@/lib/utils';
import { usePortal } from '../contexto';
import { dinero, ejecutar, horas, numeroDe } from '../tickets/comunes';
import { COPIAS_TXT, INCLUYE_TXT, PARCHES_TXT, PLAN_TXT, REPORTE_TXT, TIEMPO_ORDEN, desde, diasTexto, hhmm, leer, nombreMes, tiempoTexto } from './comunes';
import { PRIORIDAD_TXT } from '../tickets/comunes';
import type { IncluyePlan } from '@/lib/supabase/tipos-tickets-mant';

async function cargar() {
  const c = crearClienteNavegador();
  const activo = (await miMantenimientoActivo(c)).data === true;
  if (!activo) return null;
  const [planes, bolsas, avisos, hrs, tks] = await Promise.all([
    leer(miPlanMantenimiento(c)), leer(resumenDeBolsas(c)), leer(avisosDeBolsa(c)), leer(horasRegistradas(c)),
    leer<{ id: string; numero: number }>(desde('tickets').select('id, numero')).catch(() => [] as { id: string; numero: number }[]),
  ]);
  const plan = planes.find((p) => p.activo) ?? null;
  if (!plan) return null;
  return { plan, bolsa: bolsas[0] ?? null, avisos, hrs, numeros: new Map(tks.map((t) => [t.id, t.numero])) };
}

const ESTADO_HORA = { extra_pendiente_cliente: 'Espera tu decisión', extra_aprobada: 'Extra aprobada', extra_rechazada: 'Extra rechazada', aprobada: 'Descontada de la bolsa', pendiente_dueno: 'En revisión', rechazada: 'Rechazada' } as const;

/** "Mi mantenimiento" (solo administrador y solo si el super admin lo activó). Todo sale de la base. */
export function MiMantenimientoReal() {
  const ctx = usePortal();
  const { avisar } = useStore();
  const lectura = ctx.estado === 'ver_como';
  const { estado, datos, recargar } = useCargar(cargar, []);
  const [error, setError] = React.useState<string | null>(null);

  if (estado === 'cargando') return <><PageHeader titulo="Mi plan de mantenimiento" /><EstadoCargando /></>;
  if (estado === 'error') return <><PageHeader titulo="Mi plan de mantenimiento" /><EstadoError onReintentar={() => recargar()} /></>;
  if (!datos) return <><PageHeader titulo="Mi plan de mantenimiento" /><EstadoVacio titulo="Tu empresa no tiene mantenimiento activo" texto="El mantenimiento es opcional: cuida tu sistema después de la entrega. Si te interesa, escríbenos y lo activamos." /></>;

  const { plan, bolsa, avisos, hrs, numeros } = datos;
  const total = bolsa ? Number(bolsa.horas_incluidas) + Number(bolsa.horas_arrastradas) : Number(plan.horas_mes);
  const usadas = bolsa ? Number(bolsa.horas_usadas) : 0;
  const pct = bolsa ? Number(bolsa.porcentaje_usado) : 0;
  const disp = bolsa ? Number(bolsa.horas_disponibles) : total;
  const tono = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'primary';
  const extras = hrs.filter((h) => h.estado === 'extra_pendiente_cliente');
  const delMes = bolsa ? hrs.filter((h) => h.bolsa_id === bolsa.bolsa_id && !h.sin_descuento && (h.estado === 'aprobada' || h.estado.startsWith('extra'))) : [];

  const accion = async (nombre: string, fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, ok: string) => {
    setError(null);
    const r = await ejecutar(nombre, fn as never, true);
    if (!r.ok) { setError(r.mensaje); return; }
    avisar(ok); recargar(true);
  };

  return (
    <>
      <PageHeader eyebrow={`Plan ${PLAN_TXT[plan.plan_base]}`} titulo="Mi plan de mantenimiento" descripcion="Como un plan de celular: tienes una bolsa de horas cada mes y un conjunto de cosas incluidas." />
      {error && <Alert variant="danger" className="mb-6" title="No pudimos completar la acción">{error}</Alert>}
      {pct >= 80 && bolsa && (
        <Alert className="mb-6" variant={pct >= 100 ? 'danger' : 'warning'} title={pct >= 100 ? 'Se acabó la bolsa de horas de este mes' : 'Ya usaste el 80 % de tus horas de este mes'}
          action={pct >= 100 && !bolsa.extra_autorizado && <Button size="sm" disabled={lectura} onClick={() => void accion('autorizar_horas_extra', () => autorizarHorasExtra(crearClienteNavegador(), bolsa.bolsa_id), 'Horas extra autorizadas para este mes.')}>Autorizar horas extra</Button>}>
          {pct >= 100
            ? `Las horas siguientes son extra${plan.valor_hora_extra ? ` (${dinero(Number(plan.valor_hora_extra), plan.moneda)} por hora)` : ''} y no se trabajan sin tu autorización.${bolsa.extra_autorizado ? ' Ya autorizaste las horas extra de este mes.' : ''}`
            : `Te quedan ${horas(disp)}. Si se acaban, las horas extra se cobran${plan.valor_hora_extra ? ` a ${dinero(Number(plan.valor_hora_extra), plan.moneda)}` : ''} y solo se trabajan con tu autorización.`}
        </Alert>
      )}
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2" data-testid="bolsa">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">Horas de {bolsa ? nombreMes(bolsa.mes) : 'este mes'}</p>
              <p className="mt-1 font-display text-4xl font-semibold leading-none"><span className={pct >= 80 ? 'text-warning' : 'text-primary-text'}>{horas(usadas)}</span> <span className="text-xl text-muted-foreground">de {horas(total)}</span></p>
            </div>
            <Badge variant={pct >= 80 ? 'warning' : 'success'}>Disponibles: {horas(disp)}</Badge>
          </div>
          <Progress className="mt-5 h-3" value={pct} tone={tono} marker={80} label="Horas usadas del mes" />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>0</span><span>Aviso al 80 %</span><span>{horas(total)}</span></div>
          {bolsa && Number(bolsa.horas_extra) > 0 && <p className="mt-3 text-sm text-warning">Horas extra este mes: {horas(Number(bolsa.horas_extra))}</p>}
          <p className="mt-4 text-sm text-muted-foreground">{plan.acumular_horas ? 'Las horas que no uses pasan al mes siguiente (máximo un mes de horas).' : 'Las horas que no uses se pierden al cerrar el mes.'}</p>
        </Card>
        <div className="grid gap-4">
          <Card className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarCheck className="size-4" aria-hidden />Próxima revisión</div><p className="mt-1 font-display text-2xl font-semibold">{fecha(plan.proxima_revision)}</p><p className="text-xs text-muted-foreground">{plan.revisiones_por_semana} revisión(es) por semana</p></Card>
          <Card className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="size-4" aria-hidden />Cuota mensual</div><p className="mt-1 font-display text-2xl font-semibold">{plan.cuota_mensual ? dinero(Number(plan.cuota_mensual), plan.moneda) : '—'}</p><Button variant="link" size="sm" asChild><Enlace to="/cliente/dinero">Ver en Dinero</Enlace></Button></Card>
        </div>
      </div>

      {extras.length > 0 && (
        <Seccion titulo="Horas extra por decidir" descripcion="Pasaron de la bolsa del mes. Solo se cobran si las apruebas.">
          <ul className="space-y-2">
            {extras.map((h) => (
              <li key={h.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid="hora-extra">
                <span className="text-sm"><strong>{horas(Number(h.horas))}</strong> en el ticket {numeros.get(h.ticket_id) ? numeroDe(numeros.get(h.ticket_id)!) : ''} · {fecha(h.fecha_trabajo)}</span>
                <span className="flex gap-2">
                  <Button size="sm" disabled={lectura} onClick={() => void accion('decidir_horas_extra', () => decidirHorasExtra(crearClienteNavegador(), { p_hora_id: h.id, p_aprobar: true }), 'Aprobaste las horas extra.')}>Aprobar</Button>
                  <Button size="sm" variant="outline" disabled={lectura} onClick={() => void accion('decidir_horas_extra', () => decidirHorasExtra(crearClienteNavegador(), { p_hora_id: h.id, p_aprobar: false }), 'No aprobaste las horas extra.')}>No aprobar</Button>
                </span>
              </Card></li>
            ))}
          </ul>
        </Seccion>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="size-5 text-primary-text" aria-hidden />Qué incluye</CardTitle></CardHeader><CardContent>
          <ul className="space-y-2.5">
            {(Object.keys(INCLUYE_TXT) as IncluyePlan[]).map((k) => { const v = plan.incluye.includes(k); return (
              <li key={k} className="flex items-center gap-3 text-sm">{v ? <CheckCircle2 className="size-5 text-primary-text" aria-hidden /> : <MinusCircle className="size-5 text-muted-foreground" aria-hidden />}<span className={cn(!v && 'text-muted-foreground line-through')}>{INCLUYE_TXT[k]}</span>{!v && <span className="sr-only">no incluido</span>}</li>
            ); })}
            {plan.incluye_otros && <li className="flex items-center gap-3 text-sm"><CheckCircle2 className="size-5 text-primary-text" aria-hidden />{plan.incluye_otros}</li>}
          </ul>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-4 text-sm">
            <dt className="text-muted-foreground">Copias de seguridad</dt><dd>{COPIAS_TXT[plan.copias_frecuencia]}</dd>
            <dt className="text-muted-foreground">Parches de seguridad</dt><dd>{PARCHES_TXT[plan.parches_frecuencia]}</dd>
            <dt className="text-muted-foreground">Auditoría</dt><dd>{plan.auditoria ? `Cada ${plan.auditoria_cada_meses ?? 3} meses` : 'No incluida'}</dd>
            <dt className="text-muted-foreground">Reuniones al mes</dt><dd>{plan.reuniones_por_mes}</dd>
            <dt className="text-muted-foreground">Reporte</dt><dd>{REPORTE_TXT[plan.reporte_tipo]}</dd>
            <dt className="text-muted-foreground">Servidores</dt><dd>{plan.servidores_incluidos ? 'Incluidos' : 'Aparte'}</dd>
          </dl>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock className="size-5 text-primary-text" aria-hidden />Atención</CardTitle></CardHeader><CardContent>
          <p className="mb-3 text-sm text-muted-foreground">{diasTexto(plan.dias_atencion)} · {hhmm(plan.horario_desde)} a {hhmm(plan.horario_hasta)}</p>
          <Table className="min-w-0"><THead><TR><TH>Prioridad</TH><TH>Primera respuesta</TH></TR></THead><TBody>{TIEMPO_ORDEN.map((k) => <TR key={k}><TD>{PRIORIDAD_TXT[k]}</TD><TD>{tiempoTexto(plan, k)}</TD></TR>)}</TBody></Table>
          <p className="mt-3 text-xs text-muted-foreground">Estos tiempos reemplazan los generales mientras tu plan esté activo. Plan desde el {fecha(plan.fecha_inicio)}{plan.renovacion_automatica ? ', renovación automática mensual' : plan.fecha_fin ? ` hasta el ${fecha(plan.fecha_fin)}` : ''}.</p>
        </CardContent></Card>
      </div>

      <Seccion titulo="Horas de este mes" descripcion="Solo se descuentan las horas que Websourcing ya revisó.">
        <Table className="min-w-0"><THead><TR><TH>Ticket</TH><TH>Fecha</TH><TH>Estado</TH><TH className="text-right">Horas</TH></TR></THead><TBody>
          {delMes.length === 0 && <TR><TD colSpan={4} className="text-center text-muted-foreground">Todavía no hay horas descontadas este mes.</TD></TR>}
          {delMes.map((x) => <TR key={x.id}><TD><Enlace className="text-primary-text hover:underline" to={`/cliente/tickets/${x.ticket_id}`}>{numeros.get(x.ticket_id) ? numeroDe(numeros.get(x.ticket_id)!) : 'Ver ticket'}</Enlace></TD><TD>{fecha(x.fecha_trabajo)}</TD><TD className="text-muted-foreground">{ESTADO_HORA[x.estado]}</TD><TD className="text-right tabular-nums">{horas(Number(x.horas))}</TD></TR>)}
        </TBody></Table>
      </Seccion>

      {avisos.length > 0 && (
        <Seccion titulo="Avisos de la bolsa">
          <ul className="space-y-2">{avisos.slice(0, 6).map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm"><BellRing className="size-4 shrink-0 text-warning" aria-hidden />{a.tipo === '100_por_ciento' ? 'Se acabó la bolsa de horas.' : 'Llegaste al 80 % de la bolsa de horas.'}<span className="ml-auto text-xs text-muted-foreground">{fecha(a.creado_en)}</span></li>
          ))}</ul>
        </Seccion>
      )}
    </>
  );
}
