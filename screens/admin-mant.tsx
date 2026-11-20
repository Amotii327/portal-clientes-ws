'use client';
import * as React from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader, Seccion } from '@/components/ds/page';
import { Pantalla, SinPermiso } from '@/components/ds/states';
import { Enlace, ir } from '@/lib/router';
import { useStore } from '@/lib/store';
import type { Mantenimiento, Prioridad } from '@/lib/data';
import { cop, fecha } from '@/lib/utils';

const PLANES: Record<string, Partial<Mantenimiento>> = {
  Básico: { horasMes: 4, revisionesSemana: 1, cuota: 0 },
  Estándar: { horasMes: 8, revisionesSemana: 1 },
  Premium: { horasMes: 16, revisionesSemana: 2 },
  'A la medida': {},
};
const INCLUYE = ['Corrección de errores', 'Copias de seguridad', 'Monitoreo', 'Actualizaciones de seguridad', 'Auditoría trimestral', 'Pequeños ajustes'];

export function MantenimientoLista() {
  const s = useStore();
  return (
    <>
      <PageHeader titulo="Mantenimiento por empresa" descripcion="Se activa solo a quien lo contrató. Cada empresa tiene su bolsa de horas, sus tiempos y su cuota." />
      <Pantalla vacio={{ titulo: 'Ninguna empresa todavía', texto: 'Crea una empresa para poder activar su mantenimiento.' }}>
        <div className="grid gap-4 md:grid-cols-2">
          {s.empresas.map((e) => {
            const m = e.mantenimiento; const pct = m.horasMes ? (m.horasUsadas / m.horasMes) * 100 : 0;
            return (
              <Card key={e.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-display text-lg font-semibold">{e.nombre}</p><p className="text-sm text-muted-foreground">{m.activo ? `Plan ${m.plan} · desde ${fecha(m.inicio)}` : 'Apagado: el cliente no ve el módulo ni el hito 13.'}</p></div>
                  <div className="flex items-center gap-2"><label htmlFor={`sw-${e.id}`} className="text-sm text-muted-foreground">{m.activo ? 'Activo' : 'Apagado'}</label>
                    <Switch id={`sw-${e.id}`} checked={m.activo} onCheckedChange={(v) => { s.mutar(e.id, (x) => { x.mantenimiento.activo = v; if (v && !x.mantenimiento.horasMes) { Object.assign(x.mantenimiento, { horasMes: 8, cuota: 0, inicio: '2026-11-20', incluye: Object.fromEntries(INCLUYE.map((k) => [k, true])) }); } }, v ? 'Activó el mantenimiento' : 'Apagó el mantenimiento'); s.avisar(v ? 'Mantenimiento activado. Ahora configura sus parámetros.' : 'Mantenimiento apagado.'); if (v && !m.horasMes) ir(`/admin/mantenimiento/${e.id}`); }} /></div>
                </div>
                {m.activo && (
                  <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Horas del mes</span><span>{String(m.horasUsadas).replace('.', ',')} de {m.horasMes}</span></div><Progress value={pct} tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'primary'} marker={80} label="Horas usadas" /></div>
                )}
                <div className="mt-4 flex items-center gap-2"><Button size="sm" variant="secondary" asChild><Enlace to={`/admin/mantenimiento/${e.id}`}><Settings />Configurar</Enlace></Button>{m.activo && pct >= 80 && <Badge variant="warning">80 % de la bolsa</Badge>}</div>
              </Card>
            );
          })}
        </div>
      </Pantalla>
    </>
  );
}

export function MantenimientoConfig({ id }: { id: string }) {
  const s = useStore();
  const e = s.empresas.find((x) => x.id === id);
  const [m, setM] = React.useState<Mantenimiento | null>(e ? JSON.parse(JSON.stringify(e.mantenimiento)) : null);
  const [aplica, setAplica] = React.useState<'hoy' | 'mes'>('mes');
  const [motivo, setMotivo] = React.useState('');
  const [intento, setIntento] = React.useState(false);
  if (!e || !m) return <SinPermiso texto="Empresa no encontrada." />;
  const orig = e.mantenimiento;
  const set = (p: Partial<Mantenimiento>) => setM({ ...m, ...p });
  const guardar = () => {
    setIntento(true);
    if (motivo.trim().length < 5) return;
    const cambios: Mantenimiento['historial'] = [];
    const efectivo = aplica === 'hoy' ? '2026-11-20' : '2026-12-01';
    const cmp = (nombre: string, a: unknown, b: unknown) => { if (String(a) !== String(b)) cambios.push({ cuando: '2026-11-20', parametro: nombre, antes: String(a), despues: String(b), efectivo, motivo }); };
    cmp('Plan', orig.plan, m.plan); cmp('Cuota mensual', cop(orig.cuota), cop(m.cuota)); cmp('Bolsa de horas al mes', orig.horasMes + ' h', m.horasMes + ' h'); cmp('Acumular horas', orig.acumular ? 'Sí' : 'No', m.acumular ? 'Sí' : 'No');
    cmp('Revisiones por semana', orig.revisionesSemana, m.revisionesSemana); cmp('Horario', orig.horario, m.horario); cmp('Valor hora extra', cop(orig.horaExtra), cop(m.horaExtra));
    (Object.keys(m.tiempos) as Prioridad[]).forEach((k) => cmp(`Primera respuesta (${k})`, orig.tiempos[k], m.tiempos[k]));
    INCLUYE.forEach((k) => cmp(`Incluye: ${k}`, orig.incluye[k] ? 'Sí' : 'No', m.incluye[k] ? 'Sí' : 'No'));
    s.mutar(e.id, (x) => { x.mantenimiento = { ...m, historial: [...cambios, ...m.historial] }; }, `Cambió el plan de mantenimiento (${cambios.length} parámetros)`);
    s.avisar(cambios.length ? `Plan guardado. ${cambios.length} cambio(s) quedaron en el historial, vigentes ${aplica === 'hoy' ? 'desde hoy' : 'desde el próximo mes'}.` : 'Plan guardado.');
    setMotivo(''); setIntento(false);
  };
  const pend = m.horasRegistradas.filter((x) => x.estado === 'pendiente_dueno');
  return (
    <>
      <PageHeader eyebrow={e.nombre} titulo="Configurar mantenimiento" descripcion="Los parámetros de abajo son los que mandan para esta empresa. Los planes Básico, Estándar y Premium son solo un punto de partida." acciones={<Button variant="ghost" asChild><Enlace to="/admin/mantenimiento"><ArrowLeft />Volver</Enlace></Button>} />
      <Pantalla vacio={{ titulo: 'Sin configuración', texto: 'Activa el mantenimiento para configurarlo.' }}>
        {!m.activo && <Alert variant="warning" className="mb-6" title="El mantenimiento está apagado">Actívalo en la lista para que el cliente lo vea. Mientras tanto, un ticket de error fuera de garantía se marca "fuera de plan".</Alert>}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Plan y cuota</CardTitle></CardHeader><CardContent className="space-y-4">
            <Field label="Plan base" htmlFor="m-plan"><Select id="m-plan" value={m.plan} onChange={(x) => set({ plan: x.target.value as Mantenimiento['plan'], ...PLANES[x.target.value] })}>{Object.keys(PLANES).map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Fecha de inicio" htmlFor="m-ini"><Input id="m-ini" type="date" value={m.inicio} onChange={(x) => set({ inicio: x.target.value })} /></Field><Field label="Fecha de fin" htmlFor="m-fin" hint="Vacío = renovación mensual"><Input id="m-fin" type="date" value={m.fin} onChange={(x) => set({ fin: x.target.value, renovacion: !x.target.value })} /></Field></div>
            <Field label="Cuota mensual (COP, ejemplo)" htmlFor="m-cuota" hint="La escribes tú; el portal no inventa precios."><Input id="m-cuota" inputMode="numeric" value={m.cuota} onChange={(x) => set({ cuota: +x.target.value.replace(/\D/g, '') || 0 })} /></Field>
            <Field label="Valor de la hora extra (COP)" htmlFor="m-extra"><Input id="m-extra" inputMode="numeric" value={m.horaExtra} onChange={(x) => set({ horaExtra: +x.target.value.replace(/\D/g, '') || 0 })} /></Field>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Bolsa de horas y revisiones</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Horas al mes" htmlFor="m-horas"><Input id="m-horas" inputMode="numeric" value={m.horasMes} onChange={(x) => set({ horasMes: +x.target.value.replace(/\D/g, '') || 0 })} /></Field><Field label="Revisiones por semana" htmlFor="m-rev"><Input id="m-rev" inputMode="numeric" value={m.revisionesSemana} onChange={(x) => set({ revisionesSemana: +x.target.value.replace(/\D/g, '') || 0 })} /></Field></div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"><div><label htmlFor="m-acum" className="text-sm font-medium">Acumular horas no usadas</label><p className="text-xs text-muted-foreground">Por defecto se pierden al cerrar el mes.</p></div><Switch id="m-acum" checked={m.acumular} onCheckedChange={(v) => set({ acumular: v })} /></div>
            <Field label="Días y horario de atención" htmlFor="m-hor"><Input id="m-hor" value={m.horario} onChange={(x) => set({ horario: x.target.value })} /></Field>
            <p className="text-sm font-medium">Primera respuesta por prioridad</p>
            <div className="grid gap-3 sm:grid-cols-2">{(Object.keys(m.tiempos) as Prioridad[]).map((k) => <Field key={k} label={k} htmlFor={`m-t-${k}`}><Input id={`m-t-${k}`} value={m.tiempos[k]} onChange={(x) => set({ tiempos: { ...m.tiempos, [k]: x.target.value } })} /></Field>)}</div>
          </CardContent></Card>
          <Card className="lg:col-span-2"><CardHeader><CardTitle>Qué incluye</CardTitle></CardHeader><CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{INCLUYE.map((k) => <Checkbox key={k} checked={!!m.incluye[k]} onChange={(v) => set({ incluye: { ...m.incluye, [k]: v } })} label={k} />)}</div>
            <Field className="mt-4" label="Otros (texto libre)" htmlFor="m-otros"><Input id="m-otros" value={m.otros} onChange={(x) => set({ otros: x.target.value })} /></Field>
          </CardContent></Card>
        </div>
        <Card className="mt-6"><CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_2fr_auto] md:items-end">
          <Field label="Aplica" htmlFor="m-aplica"><Select id="m-aplica" value={aplica} onChange={(x) => setAplica(x.target.value as 'hoy' | 'mes')}><option value="mes">Desde el próximo mes</option><option value="hoy">Desde hoy</option></Select></Field>
          <Field label="Motivo del cambio" htmlFor="m-motivo" error={intento && motivo.trim().length < 5 ? 'El motivo es obligatorio.' : undefined}><Input id="m-motivo" value={motivo} onChange={(x) => setMotivo(x.target.value)} placeholder="Ejemplo: acuerdo en la reunión de seguimiento" /></Field>
          <Button onClick={guardar}>Guardar plan</Button>
        </CardContent></Card>
        <Seccion titulo="Horas por aprobar" descripcion="El equipo las anota a mano; tú las revisas antes de que se descuenten de la bolsa." className="mt-10">
          <Table className="min-w-[30rem]"><THead><TR><TH>Ticket</TH><TH>Fecha</TH><TH className="text-right">Horas</TH><TH><span className="sr-only">Acción</span></TH></TR></THead><TBody>
            {pend.length === 0 && <TR><TD colSpan={4} className="text-center text-muted-foreground">Nada por aprobar.</TD></TR>}
            {pend.map((x) => <TR key={x.ticket}><TD>{x.ticket}</TD><TD>{fecha(x.fecha)}</TD><TD className="text-right tabular-nums">{x.horas} h</TD><TD className="text-right"><Button size="sm" onClick={() => { s.mutar(e.id, (y) => { const z = y.mantenimiento.horasRegistradas.find((q) => q.ticket === x.ticket)!; z.estado = 'aprobada'; y.mantenimiento.horasUsadas += x.horas; }, `Aprobó ${x.horas} h del ticket ${x.ticket}`); setM((q) => q && { ...q, horasUsadas: q.horasUsadas + x.horas, horasRegistradas: q.horasRegistradas.map((r) => (r.ticket === x.ticket ? { ...r, estado: 'aprobada' } : r)) }); s.avisar('Horas aprobadas y descontadas de la bolsa.'); }}>Aprobar</Button></TD></TR>)}
          </TBody></Table>
        </Seccion>
        <Seccion titulo="Historial de cambios del plan">
          <Table className="min-w-[44rem]"><THead><TR><TH>Fecha</TH><TH>Parámetro</TH><TH>Antes</TH><TH>Después</TH><TH>Vigente desde</TH><TH>Motivo</TH></TR></THead><TBody>
            {orig.historial.length === 0 && <TR><TD colSpan={6} className="text-center text-muted-foreground">Sin cambios todavía.</TD></TR>}
            {orig.historial.map((h, i) => <TR key={i}><TD>{fecha(h.cuando)}</TD><TD>{h.parametro}</TD><TD className="text-muted-foreground">{h.antes}</TD><TD>{h.despues}</TD><TD>{fecha(h.efectivo)}</TD><TD className="text-muted-foreground">{h.motivo}</TD></TR>)}
          </TBody></Table>
        </Seccion>
      </Pantalla>
    </>
  );
}
