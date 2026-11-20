'use client';
import * as React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader, Seccion } from '@/components/ds/page';
import { EstadoCargando, EstadoError, SinPermiso } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { configurarMantenimiento, planesBase, registrarGarantia, revisarHoras } from '@/lib/portal/acciones-mantenimiento';
import { useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import { fecha } from '@/lib/utils';
import type {
  BolsaResumenFila, GarantiaFila, HoraNotaInternaFila, HoraRegistradaFila, IncluyePlan, Moneda, ParametrosMantenimiento, PlanBase, PlanBaseFila,
  PlanHistorialFila, PlanMantenimientoFila, PrioridadTicket,
} from '@/lib/supabase/tipos-tickets-mant';
import { Confirmar } from '../invitar';
import { PRIORIDAD_TXT, dinero, ejecutar, horas, hoyISO, numeroDe } from '../tickets/comunes';
import { ActivarDialog, ApagarDialog } from './acciones-admin';
import { COPIAS_TXT, DIAS, INCLUYE_TXT, PARCHES_TXT, PLAN_TXT, REPORTE_TXT, TIEMPO_ORDEN, desde, hhmm, leer, nombreMes } from './comunes';

type ModoTiempo = 'general' | 'horas' | 'dias' | 'siguiente';
interface Form {
  plan_base: PlanBase; fecha_inicio: string; fecha_fin: string; renovacion_automatica: boolean; moneda: Moneda; cuota_mensual: string; valor_hora_extra: string;
  horas_mes: string; acumular_horas: boolean; revisiones_por_semana: string; dias_atencion: number[]; horario_desde: string; horario_hasta: string; zona_horaria: string;
  tiempos: Record<PrioridadTicket, { modo: ModoTiempo; valor: string }>;
  copias_frecuencia: PlanMantenimientoFila['copias_frecuencia']; parches_frecuencia: PlanMantenimientoFila['parches_frecuencia'];
  auditoria: boolean; auditoria_cada_meses: string; reuniones_por_mes: string; reporte_tipo: PlanMantenimientoFila['reporte_tipo'];
  servidores_incluidos: boolean; servidores_costo_mensual: string; incluye: IncluyePlan[]; incluye_otros: string;
}

const n = (v: unknown) => (v === null || v === undefined ? '' : String(v));
function tiemposDe(t: unknown): Form['tiempos'] {
  const o = (t ?? {}) as Record<string, unknown>;
  const f = (k: PrioridadTicket): { modo: ModoTiempo; valor: string } => {
    const v = o[k];
    if (v === 'siguiente_planeacion') return { modo: 'siguiente', valor: '' };
    if (v && typeof v === 'object') {
      const x = v as { horas_habiles?: number; dias_habiles?: number };
      if (x.horas_habiles !== undefined) return { modo: 'horas', valor: String(x.horas_habiles) };
      if (x.dias_habiles !== undefined) return { modo: 'dias', valor: String(x.dias_habiles) };
    }
    return { modo: 'general', valor: '' };
  };
  return { urgente: f('urgente'), alta: f('alta'), normal: f('normal'), baja: f('baja') };
}
function formDe(p: PlanMantenimientoFila): Form {
  return {
    plan_base: p.plan_base, fecha_inicio: p.fecha_inicio ?? '', fecha_fin: p.fecha_fin ?? '', renovacion_automatica: p.renovacion_automatica, moneda: p.moneda, cuota_mensual: n(p.cuota_mensual !== null ? Number(p.cuota_mensual) : ''),
    valor_hora_extra: n(p.valor_hora_extra !== null ? Number(p.valor_hora_extra) : ''), horas_mes: n(Number(p.horas_mes)), acumular_horas: p.acumular_horas, revisiones_por_semana: n(p.revisiones_por_semana),
    dias_atencion: [...p.dias_atencion].sort(), horario_desde: hhmm(p.horario_desde), horario_hasta: hhmm(p.horario_hasta), zona_horaria: p.zona_horaria, tiempos: tiemposDe(p.tiempos_respuesta),
    copias_frecuencia: p.copias_frecuencia, parches_frecuencia: p.parches_frecuencia, auditoria: p.auditoria, auditoria_cada_meses: n(p.auditoria_cada_meses), reuniones_por_mes: n(p.reuniones_por_mes),
    reporte_tipo: p.reporte_tipo, servidores_incluidos: p.servidores_incluidos, servidores_costo_mensual: n(p.servidores_costo_mensual !== null ? Number(p.servidores_costo_mensual) : ''), incluye: [...p.incluye].sort(), incluye_otros: p.incluye_otros ?? '',
  };
}
/** Del formulario a los parámetros que entiende la base. Los vacíos opcionales viajan como null. */
function parametrosDe(f: Form): ParametrosMantenimiento & { plan_base: PlanBase } {
  const tiempos: Record<string, unknown> = {};
  for (const k of TIEMPO_ORDEN) {
    const t = f.tiempos[k];
    if (t.modo === 'horas') tiempos[k] = { horas_habiles: Number(t.valor.replace(',', '.')) };
    else if (t.modo === 'dias') tiempos[k] = { dias_habiles: Number(t.valor) };
    else if (t.modo === 'siguiente' && k === 'baja') tiempos[k] = 'siguiente_planeacion';
  }
  return {
    plan_base: f.plan_base, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin || null, renovacion_automatica: f.renovacion_automatica, moneda: f.moneda,
    cuota_mensual: Number(f.cuota_mensual), valor_hora_extra: f.valor_hora_extra === '' ? null : Number(f.valor_hora_extra), horas_mes: Number(f.horas_mes.replace(',', '.')), acumular_horas: f.acumular_horas,
    revisiones_por_semana: Number(f.revisiones_por_semana), dias_atencion: [...f.dias_atencion].sort(), horario_desde: f.horario_desde, horario_hasta: f.horario_hasta, zona_horaria: f.zona_horaria.trim(),
    tiempos_respuesta: Object.keys(tiempos).length ? (tiempos as never) : null, copias_frecuencia: f.copias_frecuencia, parches_frecuencia: f.parches_frecuencia, auditoria: f.auditoria,
    auditoria_cada_meses: f.auditoria ? ((Number(f.auditoria_cada_meses) || 3) as 1 | 3 | 6 | 12) : null, reuniones_por_mes: Number(f.reuniones_por_mes), reporte_tipo: f.reporte_tipo,
    servidores_incluidos: f.servidores_incluidos, servidores_costo_mensual: f.servidores_incluidos || f.servidores_costo_mensual === '' ? null : Number(f.servidores_costo_mensual), incluye: [...f.incluye].sort(), incluye_otros: f.incluye_otros.trim() || null,
  };
}
const NOMBRE_PARAM: Record<string, string> = {
  plan_base: 'Plan base', fecha_inicio: 'Fecha de inicio', fecha_fin: 'Fecha de fin', renovacion_automatica: 'Renovación automática', moneda: 'Moneda', cuota_mensual: 'Cuota mensual', horas_mes: 'Horas al mes',
  acumular_horas: 'Acumular horas', revisiones_por_semana: 'Revisiones por semana', dias_atencion: 'Días de atención', horario_desde: 'Horario desde', horario_hasta: 'Horario hasta', zona_horaria: 'Zona horaria',
  tiempos_respuesta: 'Tiempos de respuesta', copias_frecuencia: 'Copias de seguridad', parches_frecuencia: 'Parches', auditoria: 'Auditoría', auditoria_cada_meses: 'Auditoría cada (meses)', reuniones_por_mes: 'Reuniones al mes',
  reporte_tipo: 'Reporte', servidores_incluidos: 'Servidores incluidos', servidores_costo_mensual: 'Costo de servidores', incluye: 'Qué incluye', incluye_otros: 'Otros incluidos', valor_hora_extra: 'Valor de la hora extra', proxima_revision: 'Próxima revisión',
};
const verValor = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : Array.isArray(v) ? (v.length ? v.join(', ') : '—') : typeof v === 'object' ? JSON.stringify(v) : String(v));

async function cargar(empresaId: string) {
  const [emp, planes, base, historial, bolsas, hrs, gar, tks, notas] = await Promise.all([
    leer<{ id: string; nombre: string }>(desde('empresas').select('id, nombre').eq('id', empresaId)),
    leer<PlanMantenimientoFila>(desde('planes_mantenimiento').select('*').eq('empresa_id', empresaId)),
    leer(planesBase(crearClienteNavegador())).catch(() => [] as PlanBaseFila[]),
    leer<PlanHistorialFila>(desde('planes_mantenimiento_historial').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false })),
    leer<BolsaResumenFila>(desde('bolsa_mensual_resumen').select('*').eq('empresa_id', empresaId).order('mes', { ascending: false })),
    leer<HoraRegistradaFila>(desde('horas_registradas').select('*').eq('empresa_id', empresaId).order('registrado_en', { ascending: false })),
    leer<GarantiaFila>(desde('garantias').select('*').eq('empresa_id', empresaId).order('vence_en', { ascending: false })),
    leer<{ id: string; numero: number }>(desde('tickets').select('id, numero').eq('empresa_id', empresaId)).catch(() => [] as { id: string; numero: number }[]),
    leer<HoraNotaInternaFila>(desde('horas_notas_internas').select('*').eq('empresa_id', empresaId)).catch(() => [] as HoraNotaInternaFila[]),
  ]);
  return { empresa: emp[0]?.nombre ?? null, plan: planes[0] ?? null, base, historial, bolsa: bolsas[0] ?? null, hrs, gar, numeros: new Map(tks.map((t) => [t.id, t.numero])), notas: new Map(notas.map((x) => [x.hora_id, x.nota])) };
}

type Datos = Awaited<ReturnType<typeof cargar>>;

export function MantenimientoConfigReal({ empresaId }: { empresaId: string }) {
  const { estado, datos, recargar } = useCargar(() => cargar(empresaId), [empresaId]);
  if (estado === 'cargando') return <><PageHeader titulo="Configurar mantenimiento" /><EstadoCargando /></>;
  if (estado === 'error' || !datos) return <><PageHeader titulo="Configurar mantenimiento" /><EstadoError onReintentar={() => recargar()} /></>;
  if (!datos.empresa) return <><PageHeader titulo="Configurar mantenimiento" /><SinPermiso texto="No encontramos esa empresa." inicio="/admin/mantenimiento" /></>;
  return <Contenido empresaId={empresaId} d={datos} recargar={() => recargar(true)} />;
}

function Contenido({ empresaId, d, recargar }: { empresaId: string; d: Datos; recargar: () => void }) {
  const { avisar, } = useStore();
  const empresa = d.empresa!;
  const plan = d.plan;
  const activo = !!plan?.activo;
  const [activar, setActivar] = React.useState(false);
  const [apagar, setApagar] = React.useState(false);
  return (
    <>
      <PageHeader eyebrow={empresa} titulo="Configurar mantenimiento" descripcion="Los parámetros de abajo son los que mandan para esta empresa. Los planes Básico, Estándar y Premium son solo un punto de partida."
        acciones={<><Button variant="ghost" asChild><Enlace to="/admin/mantenimiento"><ArrowLeft />Volver</Enlace></Button>{activo ? <Button variant="outline" onClick={() => setApagar(true)}>Apagar mantenimiento</Button> : <Button onClick={() => setActivar(true)}>Activar mantenimiento</Button>}</>} />
      {!activo && <Alert variant="warning" className="mb-6" title="El mantenimiento está apagado">Actívalo para que el cliente lo vea. Mientras tanto, un ticket de error fuera de garantía se marca "fuera de plan".</Alert>}
      {activo && plan && <Formulario key={plan.actualizado_en} empresaId={empresaId} plan={plan} base={d.base} avisar={avisar} recargar={recargar} />}
      {activo && <Horas d={d} recargar={recargar} />}
      <Garantia empresaId={empresaId} gar={d.gar} recargar={recargar} />
      <Seccion titulo="Historial de cambios del plan" descripcion="Cada activación, cambio o apagado queda con fecha y motivo.">
        <Table className="min-w-[44rem]"><THead><TR><TH>Fecha</TH><TH>Qué pasó</TH><TH>Cambios</TH><TH>Vigente desde</TH><TH>Motivo</TH></TR></THead><TBody>
          {d.historial.length === 0 && <TR><TD colSpan={5} className="text-center text-muted-foreground">Sin cambios todavía.</TD></TR>}
          {d.historial.map((h) => {
            const ant = (h.parametros_anteriores ?? {}) as Record<string, unknown>; const nue = (h.parametros_nuevos ?? {}) as Record<string, unknown>;
            const llaves = h.tipo === 'parametros' ? Object.keys(nue) : [];
            return (
              <TR key={h.id} data-testid="historial">
                <TD>{fecha(h.creado_en)}</TD><TD>{h.tipo === 'activacion' ? 'Activación' : h.tipo === 'apagado' ? 'Apagado' : 'Cambio de parámetros'}</TD>
                <TD className="min-w-48">{llaves.length ? <ul className="space-y-0.5 text-xs">{llaves.map((k) => <li key={k}><span className="font-medium">{NOMBRE_PARAM[k] ?? k}:</span> <span className="text-muted-foreground">{verValor(ant[k])}</span> → {verValor(nue[k])}</li>)}</ul> : <span className="text-muted-foreground">—</span>}
                  {h.error_aplicacion && <Badge variant="danger" className="mt-1">No se pudo aplicar</Badge>}{h.tipo === 'parametros' && !h.aplicado_en && !h.error_aplicacion && <Badge variant="info" className="mt-1">Pendiente de aplicar</Badge>}</TD>
                <TD>{fecha(h.efectivo_desde)}</TD><TD className="text-muted-foreground">{h.motivo}</TD>
              </TR>
            );
          })}
        </TBody></Table>
      </Seccion>
      {activar && <ActivarDialog abierto empresaId={empresaId} empresa={empresa} onCerrar={() => setActivar(false)} onHecho={recargar} />}
      {apagar && <ApagarDialog abierto empresaId={empresaId} empresa={empresa} onCerrar={() => setApagar(false)} onHecho={recargar} />}
    </>
  );
}

function Formulario({ empresaId, plan, base, avisar, recargar }: { empresaId: string; plan: PlanMantenimientoFila; base: PlanBaseFila[]; avisar: (t: string) => void; recargar: () => void }) {
  const inicial = React.useMemo(() => formDe(plan), [plan]);
  const [f, setF] = React.useState<Form>(inicial);
  const [aplica, setAplica] = React.useState<'proximo_mes' | 'hoy'>('proximo_mes');
  const [motivo, setMotivo] = React.useState('');
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [trabajando, setTrabajando] = React.useState(false);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  const elegirBase = (p: PlanBase) => {
    const b = base.find((x) => x.plan === p)?.parametros as Partial<ParametrosMantenimiento> | undefined;
    if (!b) { set({ plan_base: p }); return; }
    const t = tiemposDe(b.tiempos_respuesta);
    set({
      plan_base: p, horas_mes: b.horas_mes !== undefined ? String(b.horas_mes) : f.horas_mes, acumular_horas: b.acumular_horas ?? f.acumular_horas, revisiones_por_semana: b.revisiones_por_semana !== undefined ? String(b.revisiones_por_semana) : f.revisiones_por_semana,
      dias_atencion: b.dias_atencion ?? f.dias_atencion, horario_desde: b.horario_desde ? hhmm(b.horario_desde) : f.horario_desde, horario_hasta: b.horario_hasta ? hhmm(b.horario_hasta) : f.horario_hasta,
      tiempos: b.tiempos_respuesta ? t : f.tiempos, copias_frecuencia: b.copias_frecuencia ?? f.copias_frecuencia, parches_frecuencia: b.parches_frecuencia ?? f.parches_frecuencia, auditoria: b.auditoria ?? f.auditoria,
      auditoria_cada_meses: b.auditoria_cada_meses ? String(b.auditoria_cada_meses) : f.auditoria_cada_meses, reuniones_por_mes: b.reuniones_por_mes !== undefined ? String(b.reuniones_por_mes) : f.reuniones_por_mes,
      reporte_tipo: b.reporte_tipo ?? f.reporte_tipo, servidores_incluidos: b.servidores_incluidos ?? f.servidores_incluidos, incluye: b.incluye ?? f.incluye,
    });
  };

  const errores: Record<string, string> = {};
  if (!(Number(f.cuota_mensual) > 0)) errores.cuota = 'La cuota mensual es obligatoria.';
  if (!f.fecha_inicio) errores.inicio = 'Indica la fecha de inicio.';
  if (f.fecha_fin && f.fecha_fin < f.fecha_inicio) errores.fin = 'La fecha de fin no puede ser anterior al inicio.';
  if (!(Number(f.horas_mes.replace(',', '.')) >= 0)) errores.horas = 'Indica las horas al mes.';
  if (f.dias_atencion.length === 0) errores.dias = 'Elige al menos un día.';
  if (f.horario_desde >= f.horario_hasta) errores.horario = 'La hora de inicio debe ser antes que la de fin.';
  for (const k of TIEMPO_ORDEN) { const t = f.tiempos[k]; if ((t.modo === 'horas' || t.modo === 'dias') && !(Number(t.valor.replace(',', '.')) > 0)) errores['t-' + k] = 'Indica un número.'; }
  const nuevos = parametrosDe(f); const antes = parametrosDe(inicial);
  const cambios = (Object.keys(nuevos) as (keyof typeof nuevos)[]).filter((k) => JSON.stringify(nuevos[k]) !== JSON.stringify(antes[k]));

  const guardar = async () => {
    setIntento(true); setError(null);
    if (Object.keys(errores).length || motivo.trim().length < 3) return;
    if (cambios.length === 0) { setError('No hay cambios para guardar.'); return; }
    const parametros = Object.fromEntries(cambios.map((k) => [k, nuevos[k]])) as ParametrosMantenimiento;
    setTrabajando(true);
    const r = await ejecutar('configurar_mantenimiento', () => configurarMantenimiento(crearClienteNavegador(), { p_empresa_id: empresaId, p_parametros: parametros, p_motivo: motivo.trim(), p_aplicar_desde: aplica }), true);
    setTrabajando(false);
    if (!r.ok) { setError(r.mensaje); return; }
    avisar(`Plan guardado. ${cambios.length} cambio(s) quedaron en el historial, vigentes ${aplica === 'hoy' ? 'desde hoy' : 'desde el próximo mes'}.`);
    setMotivo(''); setIntento(false); recargar();
  };
  const dinCampo = (id: string, v: string, fn: (s: string) => void, label: string, error?: string, hint?: string) => (
    <Field label={label} htmlFor={id} error={error} hint={hint}><Input id={id} inputMode="numeric" value={v} onChange={(e) => fn(e.target.value.replace(/[^\d]/g, ''))} /></Field>
  );

  return (
    <div data-testid="formulario-plan">
      {error && <Alert variant="danger" className="mb-4" title="No se pudo guardar">{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Plan y cuota</CardTitle></CardHeader><CardContent className="space-y-4">
          <Field label="Plan base" htmlFor="m-plan" hint="Al elegir uno se cargan sus valores de partida; luego ajustas lo que quieras."><Select id="m-plan" value={f.plan_base} onChange={(e) => elegirBase(e.target.value as PlanBase)}>{(Object.keys(PLAN_TXT) as PlanBase[]).map((p) => <option key={p} value={p}>{PLAN_TXT[p]}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha de inicio" htmlFor="m-ini" error={intento ? errores.inicio : undefined}><Input id="m-ini" type="date" value={f.fecha_inicio} onChange={(e) => set({ fecha_inicio: e.target.value })} /></Field>
            <Field label="Fecha de fin" htmlFor="m-fin" hint="Vacía: sin fecha de fin" error={intento ? errores.fin : undefined}><Input id="m-fin" type="date" value={f.fecha_fin} onChange={(e) => set({ fecha_fin: e.target.value })} /></Field>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"><label htmlFor="m-renov" className="text-sm font-medium">Renovación automática mensual</label><Switch id="m-renov" checked={f.renovacion_automatica} onCheckedChange={(v) => set({ renovacion_automatica: v })} /></div>
          <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
            {dinCampo('m-cuota', f.cuota_mensual, (s) => set({ cuota_mensual: s }), 'Cuota mensual', intento ? errores.cuota : undefined, 'La escribes tú; el portal no inventa precios.')}
            <Field label="Moneda" htmlFor="m-mon"><Select id="m-mon" value={f.moneda} onChange={(e) => set({ moneda: e.target.value as Moneda })}><option>COP</option><option>USD</option></Select></Field>
          </div>
          {dinCampo('m-extra', f.valor_hora_extra, (s) => set({ valor_hora_extra: s }), 'Valor de la hora extra', undefined, 'Se cobra cuando se acaba la bolsa y el cliente lo autoriza.')}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Bolsa de horas y atención</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Horas al mes" htmlFor="m-horas" error={intento ? errores.horas : undefined}><Input id="m-horas" inputMode="decimal" value={f.horas_mes} onChange={(e) => set({ horas_mes: e.target.value })} /></Field>
            <Field label="Revisiones por semana" htmlFor="m-rev"><Input id="m-rev" inputMode="numeric" value={f.revisiones_por_semana} onChange={(e) => set({ revisiones_por_semana: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"><div><label htmlFor="m-acum" className="text-sm font-medium">Acumular horas no usadas</label><p className="text-xs text-muted-foreground">Por defecto se pierden al cerrar el mes. Si se acumulan, pasa máximo un mes de horas propias.</p></div><Switch id="m-acum" checked={f.acumular_horas} onCheckedChange={(v) => set({ acumular_horas: v })} /></div>
          <fieldset><legend className="mb-1.5 text-sm font-medium">Días de atención</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{DIAS.map((dia, i) => <Checkbox key={dia} checked={f.dias_atencion.includes(i + 1)} onChange={(v) => set({ dias_atencion: v ? [...f.dias_atencion, i + 1].sort() : f.dias_atencion.filter((x) => x !== i + 1) })} label={dia} />)}</div>
            {intento && errores.dias && <p className="mt-1 text-xs text-danger" role="alert">{errores.dias}</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Horario desde" htmlFor="m-hd" error={intento ? errores.horario : undefined}><Input id="m-hd" type="time" value={f.horario_desde} onChange={(e) => set({ horario_desde: e.target.value })} /></Field>
            <Field label="Horario hasta" htmlFor="m-hh"><Input id="m-hh" type="time" value={f.horario_hasta} onChange={(e) => set({ horario_hasta: e.target.value })} /></Field>
            <Field label="Zona horaria" htmlFor="m-zona"><Input id="m-zona" value={f.zona_horaria} onChange={(e) => set({ zona_horaria: e.target.value })} /></Field>
          </div>
          <p className="text-sm font-medium">Primera respuesta por prioridad</p>
          <div className="space-y-3">
            {TIEMPO_ORDEN.map((k) => { const t = f.tiempos[k]; return (
              <div key={k} className="grid grid-cols-[5.5rem_1fr_5rem] items-start gap-2">
                <span className="pt-2.5 text-sm">{PRIORIDAD_TXT[k]}</span>
                <Select aria-label={`Tipo de plazo ${PRIORIDAD_TXT[k]}`} value={t.modo} onChange={(e) => set({ tiempos: { ...f.tiempos, [k]: { ...t, modo: e.target.value as ModoTiempo } } })}>
                  <option value="general">Tiempo general</option><option value="horas">Horas hábiles</option><option value="dias">Días hábiles</option>{k === 'baja' && <option value="siguiente">Siguiente planeación</option>}
                </Select>
                <div><Input aria-label={`Cantidad ${PRIORIDAD_TXT[k]}`} inputMode="decimal" disabled={t.modo === 'general' || t.modo === 'siguiente'} value={t.valor} onChange={(e) => set({ tiempos: { ...f.tiempos, [k]: { ...t, valor: e.target.value } } })} />{intento && errores['t-' + k] && <p className="mt-1 text-xs text-danger" role="alert">{errores['t-' + k]}</p>}</div>
              </div>
            ); })}
          </div>
        </CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><CardTitle>Qué incluye</CardTitle></CardHeader><CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(INCLUYE_TXT) as IncluyePlan[]).map((k) => <Checkbox key={k} checked={f.incluye.includes(k)} onChange={(v) => set({ incluye: v ? [...f.incluye, k].sort() : f.incluye.filter((x) => x !== k) })} label={INCLUYE_TXT[k]} />)}</div>
          <Field label="Otros (texto libre)" htmlFor="m-otros"><Input id="m-otros" maxLength={500} value={f.incluye_otros} onChange={(e) => set({ incluye_otros: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Copias de seguridad" htmlFor="m-copias"><Select id="m-copias" value={f.copias_frecuencia} onChange={(e) => set({ copias_frecuencia: e.target.value as Form['copias_frecuencia'] })}>{Object.entries(COPIAS_TXT).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select></Field>
            <Field label="Parches de seguridad" htmlFor="m-parches"><Select id="m-parches" value={f.parches_frecuencia} onChange={(e) => set({ parches_frecuencia: e.target.value as Form['parches_frecuencia'] })}>{Object.entries(PARCHES_TXT).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select></Field>
            <Field label="Reuniones al mes" htmlFor="m-reu"><Input id="m-reu" inputMode="numeric" value={f.reuniones_por_mes} onChange={(e) => set({ reuniones_por_mes: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Reporte" htmlFor="m-rep"><Select id="m-rep" value={f.reporte_tipo} onChange={(e) => set({ reporte_tipo: e.target.value as Form['reporte_tipo'] })}>{Object.entries(REPORTE_TXT).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"><label htmlFor="m-aud" className="text-sm font-medium">Incluye auditoría</label><div className="flex items-center gap-2">{f.auditoria && <Select aria-label="Auditoría cada" value={f.auditoria_cada_meses || '3'} onChange={(e) => set({ auditoria_cada_meses: e.target.value })} className="w-32"><option value="1">Cada mes</option><option value="3">Cada 3 meses</option><option value="6">Cada 6 meses</option><option value="12">Cada año</option></Select>}<Switch id="m-aud" checked={f.auditoria} onCheckedChange={(v) => set({ auditoria: v })} /></div></div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-4"><label htmlFor="m-srv" className="text-sm font-medium">Servidores incluidos en la cuota</label><Switch id="m-srv" checked={f.servidores_incluidos} onCheckedChange={(v) => set({ servidores_incluidos: v })} /></div>
              {!f.servidores_incluidos && dinCampo('m-srvc', f.servidores_costo_mensual, (s) => set({ servidores_costo_mensual: s }), 'Costo mensual de servidores (aparte)')}
            </div>
          </div>
        </CardContent></Card>
      </div>
      <Card className="mt-6"><CardContent className="grid gap-4 pt-6 md:grid-cols-[14rem_1fr_auto] md:items-end">
        <Field label="Aplica" htmlFor="m-aplica"><Select id="m-aplica" value={aplica} onChange={(e) => setAplica(e.target.value as 'hoy' | 'proximo_mes')}><option value="proximo_mes">Desde el próximo mes</option><option value="hoy">Desde hoy</option></Select></Field>
        <Field label="Motivo del cambio" htmlFor="m-motivo" error={intento && motivo.trim().length < 3 ? 'El motivo es obligatorio (mínimo 3 caracteres).' : undefined}><Input id="m-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ejemplo: acuerdo en la reunión de seguimiento" /></Field>
        <Button onClick={() => void guardar()} disabled={trabajando}>{trabajando ? 'Guardando…' : `Guardar plan${cambios.length ? ` (${cambios.length})` : ''}`}</Button>
      </CardContent></Card>
    </div>
  );
}

function Horas({ d, recargar }: { d: Datos; recargar: () => void }) {
  const { avisar } = useStore();
  const [aRechazar, setARechazar] = React.useState<HoraRegistradaFila | null>(null);
  const [motivo, setMotivo] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const pend = d.hrs.filter((h) => h.estado === 'pendiente_dueno');
  const b = d.bolsa; const pct = b ? Number(b.porcentaje_usado) : 0;
  const num = (id: string) => (d.numeros.get(id) ? numeroDe(d.numeros.get(id)!) : '—');
  const decidir = async (h: HoraRegistradaFila, aprobar: boolean, mot?: string) => {
    setError(null);
    const r = await ejecutar('revisar_horas', () => revisarHoras(crearClienteNavegador(), { p_hora_id: h.id, p_aprobar: aprobar, p_motivo: mot ?? null }), true);
    if (!r.ok) { setError(r.mensaje); return false; }
    avisar(aprobar ? 'Horas aprobadas y descontadas de la bolsa.' : 'Horas rechazadas.'); recargar(); return true;
  };
  return (
    <>
      {b && (
        <Card className="mt-6 p-5" data-testid="bolsa-admin">
          <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">Bolsa de {nombreMes(b.mes)}</span><span className="text-muted-foreground">{horas(Number(b.horas_usadas))} de {horas(Number(b.horas_incluidas) + Number(b.horas_arrastradas))}{Number(b.horas_extra) > 0 ? ` · ${horas(Number(b.horas_extra))} extra` : ''}</span></div>
          <Progress className="mt-3" value={pct} tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'primary'} marker={80} label="Horas usadas de la bolsa" />
          {b.extra_autorizado && <p className="mt-2 text-xs text-muted-foreground">El cliente autorizó las horas extra de este mes.</p>}
        </Card>
      )}
      <Seccion titulo="Horas por revisar" descripcion="El equipo las anota a mano; tú las revisas antes de que se descuenten de la bolsa." className="mt-8">
        {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
        <Table className="min-w-[36rem]"><THead><TR><TH>Ticket</TH><TH>Día</TH><TH>Nota interna</TH><TH className="text-right">Horas</TH><TH><span className="sr-only">Acción</span></TH></TR></THead><TBody>
          {pend.length === 0 && <TR><TD colSpan={5} className="text-center text-muted-foreground">Nada por revisar.</TD></TR>}
          {pend.map((h) => (
            <TR key={h.id} data-testid="hora-pendiente">
              <TD><Enlace className="text-primary-text hover:underline" to={`/admin/tickets/${h.ticket_id}`}>{num(h.ticket_id)}</Enlace></TD><TD>{fecha(h.fecha_trabajo)}</TD><TD className="text-muted-foreground">{d.notas.get(h.id) ?? '—'}</TD><TD className="text-right tabular-nums">{horas(Number(h.horas))}{h.sin_descuento && <Badge variant="neutral" className="ml-2">Sin descuento</Badge>}</TD>
              <TD className="text-right"><span className="flex justify-end gap-2"><Button size="sm" onClick={() => void decidir(h, true)}>Aprobar</Button><Button size="sm" variant="outline" onClick={() => { setMotivo(''); setARechazar(h); }}>Rechazar</Button></span></TD>
            </TR>
          ))}
        </TBody></Table>
      </Seccion>
      <Confirmar abierto={!!aRechazar} titulo="¿Rechazar estas horas?" texto="No se descuentan de la bolsa. Queda el motivo." boton="Sí, rechazar" onCerrar={() => setARechazar(null)}
        onConfirmar={async () => { if (aRechazar && (await decidir(aRechazar, false, motivo.trim()))) setARechazar(null); }}>
        <Field label="Motivo" htmlFor="h-mot" hint="Mínimo 3 caracteres."><Input id="h-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
      </Confirmar>
    </>
  );
}

function Garantia({ empresaId, gar, recargar }: { empresaId: string; gar: GarantiaFila[]; recargar: () => void }) {
  const { avisar } = useStore();
  const [inicia, setInicia] = React.useState(hoyISO());
  const [vence, setVence] = React.useState('');
  const [nota, setNota] = React.useState('');
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const invalida = !vence || vence < inicia;
  const guardar = async () => {
    setIntento(true); setError(null);
    if (invalida) return;
    const r = await ejecutar('registrar_garantia', () => registrarGarantia(crearClienteNavegador(), { empresa_id: empresaId, inicia_en: inicia, vence_en: vence, nota: nota.trim() || null }) as never, true);
    if (!r.ok) { setError(r.mensaje); return; }
    avisar('Garantía registrada.'); setVence(''); setNota(''); setIntento(false); recargar();
  };
  return (
    <Seccion titulo="Garantía" descripcion="Un error dentro de la garantía no tiene costo. Al terminar, el mantenimiento (si está activo) cubre los errores." className="mt-8">
      {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
      <Card><CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
        <Field label="Inicia" htmlFor="g-ini"><Input id="g-ini" type="date" value={inicia} onChange={(e) => setInicia(e.target.value)} /></Field>
        <Field label="Vence" htmlFor="g-ven" error={intento && invalida ? 'Indica una fecha de vencimiento posterior al inicio.' : undefined}><Input id="g-ven" type="date" value={vence} onChange={(e) => setVence(e.target.value)} /></Field>
        <Field label="Nota (opcional)" htmlFor="g-nota"><Input id="g-nota" value={nota} onChange={(e) => setNota(e.target.value)} /></Field>
        <Button onClick={() => void guardar()}>Registrar garantía</Button>
      </CardContent></Card>
      <ul className="mt-3 space-y-2" aria-label="Garantías registradas">
        {gar.length === 0 && <li className="text-sm text-muted-foreground">Sin garantía registrada.</li>}
        {gar.map((g) => <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm" data-testid="garantia"><span>{fecha(g.inicia_en)} a {fecha(g.vence_en)}{g.nota ? <span className="text-muted-foreground"> · {g.nota}</span> : null}</span><Badge variant={g.vence_en >= hoyISO() ? 'success' : 'neutral'}>{g.vence_en >= hoyISO() ? 'Vigente' : 'Terminada'}</Badge></li>)}
      </ul>
    </Seccion>
  );
}
