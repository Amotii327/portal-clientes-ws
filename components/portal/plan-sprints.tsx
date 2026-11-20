'use client';
import * as React from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { PageHeader, Seccion } from '@/components/ds/page';
import { EstadoCargando, EstadoError, SinPermiso } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { agregarSprint, aprobarPlanSprints, editarSprint, quitarSprint, reordenarSprints } from '@/lib/portal/acciones';
import { correr, ESTADO_SPRINT } from '@/lib/app/proyectos';
import { esUuid, useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import { lineaDeTiempo } from '@/lib/portal/acciones';
import type { AvisoPlan, EstadoSprint, LineaDeTiempo } from '@/lib/supabase/database.types';
import { fecha } from '@/lib/utils';
import { Confirmar } from './invitar';

type Sprint = NonNullable<LineaDeTiempo['plan']>['sprints'][number];
const INICIADOS: EstadoSprint[] = ['en_curso', 'en_revision', 'terminado'];
const iniciado = (s: Sprint) => INICIADOS.includes(s.estado);
export const textoAviso = (a: AvisoPlan) => `Los sprints ${a.sprints[0]} y ${a.sprints[1]} se cruzan en fechas. Se guardó igual; revisa si es lo que quieres.`;
const MOTIVO_MIN = 5;

const aLineas = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);
const diasMas = (iso: string, d: number) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

interface Formulario { nombre: string; inicio: string; fin: string; demo: string; incluye: string; estado: EstadoSprint; motivo: string; correr: boolean }

/** Ventana para agregar o editar un sprint. Con el plan ya publicado, cambiar nombre, fechas o contenido pide motivo. */
function SprintDialog({ abierto, sprint, aprobado, ultimoFin, onCerrar, onGuardar }: {
  abierto: boolean; sprint: Sprint | null; aprobado: boolean; ultimoFin: string | null; onCerrar: () => void;
  onGuardar: (f: Formulario, cambios: { contenido: boolean }) => Promise<string>;
}) {
  const vacio: Formulario = { nombre: '', inicio: ultimoFin ? diasMas(ultimoFin, 1) : '', fin: ultimoFin ? diasMas(ultimoFin, 14) : '', demo: '', incluye: '', estado: 'propuesto', motivo: '', correr: false };
  const [f, setF] = React.useState<Formulario>(vacio);
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [trabajando, setTrabajando] = React.useState(false);
  React.useEffect(() => {
    if (!abierto) return;
    setIntento(false); setError('');
    setF(sprint ? { nombre: sprint.nombre, inicio: sprint.fecha_inicio, fin: sprint.fecha_fin, demo: sprint.fecha_demo ?? '', incluye: sprint.incluye.join('\n'), estado: sprint.estado, motivo: '', correr: false } : vacio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, sprint]);
  const contenido = !sprint || f.nombre.trim() !== sprint.nombre || f.inicio !== sprint.fecha_inicio || f.fin !== sprint.fecha_fin || f.demo !== (sprint.fecha_demo ?? '') || aLineas(f.incluye).join('|') !== sprint.incluye.join('|');
  const pideMotivo = aprobado && contenido;
  const eNombre = intento && f.nombre.trim().length < 2 ? 'Escribe el nombre del sprint.' : undefined;
  const eFechas = intento && (!f.inicio || !f.fin) ? 'Elige la fecha de inicio y la de fin.' : f.inicio && f.fin && f.fin < f.inicio ? 'La fecha final no puede ser anterior a la inicial.' : undefined;
  const eMotivo = intento && pideMotivo && f.motivo.trim().length < MOTIVO_MIN ? 'El plan ya está publicado: escribe el motivo del cambio (mínimo 5 caracteres).' : undefined;
  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault(); setIntento(true); setError('');
    if (f.nombre.trim().length < 2 || !f.inicio || !f.fin || f.fin < f.inicio || (pideMotivo && f.motivo.trim().length < MOTIVO_MIN)) return;
    setTrabajando(true);
    const msg = await onGuardar(f, { contenido });
    setTrabajando(false);
    if (msg) setError(msg);
  };
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !trabajando && onCerrar()}>
      <DialogContent title={sprint ? `Editar sprint ${sprint.numero}` : 'Agregar sprint'} description={aprobado ? 'El plan ya está publicado: el cliente verá las fechas nuevas y el motivo.' : 'Mientras el plan sea propuesta, el cliente no lo ve.'}>
        <form className="space-y-4" onSubmit={enviar} noValidate>
          <Field label="Nombre" htmlFor="sp-nombre" error={eNombre}><Input id="sp-nombre" value={f.nombre} maxLength={160} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Inicio" htmlFor="sp-ini"><Input id="sp-ini" type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Field>
            <Field label="Fin" htmlFor="sp-fin"><Input id="sp-fin" type="date" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Field>
            <Field label="Demo" htmlFor="sp-demo"><Input id="sp-demo" type="date" value={f.demo} onChange={(e) => setF({ ...f, demo: e.target.value })} /></Field>
          </div>
          {eFechas && <p className="-mt-2 text-xs text-danger" role="alert">{eFechas}</p>}
          <Field label="Qué incluye" htmlFor="sp-incluye" hint="Una entrega por línea."><Textarea id="sp-incluye" value={f.incluye} onChange={(e) => setF({ ...f, incluye: e.target.value })} /></Field>
          {sprint && aprobado && (
            <Field label="Estado" htmlFor="sp-estado">
              <Select id="sp-estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as EstadoSprint })}>
                {(['aprobado', 'en_curso', 'en_revision', 'terminado'] as EstadoSprint[]).map((x) => <option key={x} value={x}>{ESTADO_SPRINT[x]}</option>)}
              </Select>
            </Field>
          )}
          {sprint && <Checkbox id="sp-correr" checked={f.correr} onChange={(v) => setF({ ...f, correr: v })} label="Correr los siguientes sprints los mismos días que moví este" />}
          {pideMotivo && <Field label="Motivo del cambio" htmlFor="sp-motivo" error={eMotivo}><Textarea id="sp-motivo" value={f.motivo} maxLength={500} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></Field>}
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="ghost" disabled={trabajando}>Cancelar</Button></DialogClose><Button type="submit" disabled={trabajando}>{trabajando ? 'Guardando…' : sprint ? 'Guardar sprint' : 'Agregar sprint'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Editor del plan de sprints (solo super admin): agregar, editar, quitar, reordenar y publicar. */
export function PlanSprintsReal({ empresaId, proyectoId }: { empresaId: string; proyectoId: string }) {
  const { avisar } = useStore();
  const { estado, datos, recargar } = useCargar(async () => {
    if (!esUuid(proyectoId)) return null;
    const { data, error } = await lineaDeTiempo(crearClienteNavegador(), proyectoId);
    if (error) { if (String(error.message).includes('proyecto_no_encontrado')) return null; throw new Error('lectura_fallida'); }
    return data;
  }, [proyectoId]);
  const [avisos, setAvisos] = React.useState<AvisoPlan[]>([]);
  const [dlg, setDlg] = React.useState<{ sprint: Sprint | null } | null>(null);
  const [aQuitar, setAQuitar] = React.useState<Sprint | null>(null);
  const [aMover, setAMover] = React.useState<{ orden: string[] } | null>(null);
  const [publicar, setPublicar] = React.useState(false);
  const [motivo, setMotivo] = React.useState('');
  const [errMotivo, setErrMotivo] = React.useState('');

  const volver = <Button variant="ghost" asChild><Enlace to={`/admin/proyectos/${empresaId}/${proyectoId}`}><ArrowLeft />Proyecto</Enlace></Button>;
  if (estado === 'cargando') return <><PageHeader titulo="Plan de sprints" acciones={volver} /><EstadoCargando /></>;
  if (estado === 'error') return <><PageHeader titulo="Plan de sprints" acciones={volver} /><EstadoError onReintentar={() => recargar()} /></>;
  if (!datos) return <><PageHeader titulo="Plan de sprints" /><SinPermiso texto="No encontramos ese proyecto." inicio="/admin/proyectos" /></>;
  const plan = datos.plan;
  const sprints = [...(plan?.sprints ?? [])].sort((a, b) => a.numero - b.numero);
  const aprobado = plan?.estado === 'aprobado';
  const todosAvisos = [...(plan?.avisos ?? []), ...avisos.filter((a) => !(plan?.avisos ?? []).some((x) => x.sprints.join() === a.sprints.join()))];
  const ultimoFin = sprints.length ? sprints[sprints.length - 1].fecha_fin : null;

  const tras = (r: { data: unknown; mensaje: string; error: unknown }, ok: string) => {
    if (r.error) return r.mensaje;
    const a = (r.data as { avisos?: AvisoPlan[] } | null)?.avisos ?? [];
    setAvisos(a); avisar(ok); recargar(true); return '';
  };
  const c = () => crearClienteNavegador();

  const guardar = async (f: Formulario, cambios: { contenido: boolean }) => {
    const motivoT = f.motivo.trim() || undefined;
    if (!dlg?.sprint) {
      const r = await correr('agregar_sprint', agregarSprint(c(), { p_proyecto_id: proyectoId, p_nombre: f.nombre.trim(), p_fecha_inicio: f.inicio, p_fecha_fin: f.fin, p_fecha_demo: f.demo || null, p_incluye: aLineas(f.incluye), p_motivo: aprobado ? motivoT ?? null : null }));
      const m = tras(r, 'Sprint agregado.'); if (!m) setDlg(null); return m;
    }
    const s = dlg.sprint;
    const r = await correr('editar_sprint', editarSprint(c(), {
      p_sprint_id: s.id, p_nombre: f.nombre.trim(), p_fecha_inicio: f.inicio, p_fecha_fin: f.fin, p_fecha_demo: f.demo || null, p_incluye: aLineas(f.incluye),
      p_estado: aprobado && f.estado !== s.estado ? f.estado : null, p_motivo: cambios.contenido ? motivoT ?? null : null, p_correr_siguientes: f.correr,
    }));
    const m = tras(r, f.correr ? 'Sprint guardado. Los siguientes se corrieron.' : 'Sprint guardado.'); if (!m) setDlg(null); return m;
  };
  const quitar = async () => {
    if (!aQuitar) return;
    if (aprobado && motivo.trim().length < MOTIVO_MIN) { setErrMotivo('El plan ya está publicado: escribe el motivo (mínimo 5 caracteres).'); return; }
    const r = await correr('quitar_sprint', quitarSprint(c(), aQuitar.id, motivo.trim() || undefined));
    const m = tras(r, 'Sprint quitado. Los demás se renumeraron.');
    if (m) setErrMotivo(m); else { setAQuitar(null); setMotivo(''); setErrMotivo(''); }
  };
  const pedirMover = (i: number, d: -1 | 1) => {
    const o = sprints.map((s) => s.id); [o[i], o[i + d]] = [o[i + d], o[i]];
    if (aprobado) { setMotivo(''); setErrMotivo(''); setAMover({ orden: o }); } else void mover(o, '');
  };
  const mover = async (orden: string[], m: string) => {
    const r = await correr('reordenar_sprints', reordenarSprints(c(), proyectoId, orden, m.trim() || undefined));
    const msg = tras(r, 'Orden actualizado.');
    if (msg) { if (aMover) setErrMotivo(msg); else avisar(msg); } else { setAMover(null); setMotivo(''); setErrMotivo(''); }
  };
  const aprobar = async () => {
    const r = await correr('aprobar_plan_sprints', aprobarPlanSprints(c(), proyectoId));
    const m = tras(r, 'Plan publicado. El cliente ya lo ve en su línea de tiempo.');
    if (m) avisar(m);
    setPublicar(false);
  };

  return (
    <>
      <PageHeader eyebrow={datos.proyecto.empresa_nombre} titulo="Plan de sprints" descripcion={`${datos.proyecto.nombre}. Aquí armas el plan antes de mostrarlo. Mientras sea propuesta, el cliente no lo ve.`}
        acciones={<>{volver}<Button variant="secondary" onClick={() => setDlg({ sprint: null })}><Plus />Agregar sprint</Button>{!aprobado && <Button disabled={sprints.length === 0} onClick={() => setPublicar(true)}><CheckCircle2 />Aprobar y publicar</Button>}</>} />
      <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="estado-plan">
        <Badge variant={aprobado ? 'success' : 'warning'}>{aprobado ? 'Plan publicado al cliente' : 'Propuesta (el cliente no la ve)'}</Badge>
        {!aprobado && sprints.length === 0 && <span className="text-sm text-muted-foreground">Todavía no hay sprints. Agrega el primero.</span>}
      </div>
      {todosAvisos.map((a) => <Alert key={a.sprints.join()} variant="warning" className="mb-3" title="Fechas que se cruzan" data-testid="aviso-cruce">{textoAviso(a)}</Alert>)}
      <ol className="space-y-3" aria-label="Sprints del plan">
        {sprints.map((s, i) => (
          <li key={s.id}>
            <Card className="p-4" data-testid="sprint">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Sprint {s.numero}</p>
                  <h3 className="font-display text-base font-semibold">{s.nombre}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{fecha(s.fecha_inicio, true)} – {fecha(s.fecha_fin)} · demo {s.fecha_demo ? fecha(s.fecha_demo) : 'sin fecha'}</p>
                  {s.incluye.length > 0 && <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">{s.incluye.map((x) => <li key={x}>{x}</li>)}</ul>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={s.estado === 'terminado' ? 'success' : iniciado(s) ? 'info' : s.estado === 'aprobado' ? 'primary' : 'neutral'}>{ESTADO_SPRINT[s.estado]}</Badge>
                  <Button size="icon" variant="ghost" aria-label={`Subir el sprint ${s.numero}`} disabled={i === 0 || iniciado(s) || iniciado(sprints[i - 1])} onClick={() => pedirMover(i, -1)}><ArrowUp /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Bajar el sprint ${s.numero}`} disabled={i === sprints.length - 1 || iniciado(s) || iniciado(sprints[i + 1])} onClick={() => pedirMover(i, 1)}><ArrowDown /></Button>
                  <Button size="sm" variant="outline" onClick={() => setDlg({ sprint: s })}><Pencil />Editar</Button>
                  <Button size="sm" variant="destructive" disabled={iniciado(s)} onClick={() => { setAQuitar(s); setMotivo(''); setErrMotivo(''); }}><Trash2 />Quitar</Button>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      {plan && plan.cambios.length > 0 && (
        <Seccion titulo="Cambios al plan publicado" descripcion="Cada cambio lleva su motivo y el cliente lo ve." className="mt-10">
          <ul className="space-y-2 text-sm" data-testid="cambios-plan">{plan.cambios.map((x, i) => <li key={i} className="rounded-lg border border-border bg-surface p-3"><span className="text-muted-foreground">{fecha(x.creado_en)} · {x.tipo.replace(/_/g, ' ')}:</span> {x.motivo}</li>)}</ul>
        </Seccion>
      )}

      <SprintDialog abierto={!!dlg} sprint={dlg?.sprint ?? null} aprobado={aprobado} ultimoFin={ultimoFin} onCerrar={() => setDlg(null)} onGuardar={guardar} />
      <Confirmar abierto={publicar} titulo="¿Publicar el plan al cliente?" texto="El cliente verá los sprints en su línea de tiempo. Desde ahí, cada cambio al plan pide un motivo y el cliente lo ve. No se puede volver a propuesta." boton="Sí, publicar" tono="default" onConfirmar={aprobar} onCerrar={() => setPublicar(false)} />
      <Confirmar abierto={!!aQuitar} titulo={`¿Quitar el sprint ${aQuitar?.numero ?? ''}?`} texto="Se elimina del plan y los demás se renumeran. Solo se puede quitar un sprint que aún no empezó." boton="Sí, quitar" onConfirmar={quitar} onCerrar={() => setAQuitar(null)}>
        {aprobado && <Field label="Motivo" htmlFor="q-motivo" error={errMotivo || undefined}><Textarea id="q-motivo" value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} /></Field>}
        {!aprobado && errMotivo && <p className="text-sm text-danger" role="alert">{errMotivo}</p>}
      </Confirmar>
      <Confirmar abierto={!!aMover} titulo="Cambiar el orden de los sprints" texto="El plan ya está publicado: el cliente verá el cambio con tu motivo." boton="Guardar el orden" tono="default"
        onConfirmar={async () => { if (!aMover) return; if (motivo.trim().length < MOTIVO_MIN) { setErrMotivo('Escribe el motivo (mínimo 5 caracteres).'); return; } await mover(aMover.orden, motivo); }} onCerrar={() => setAMover(null)}>
        <Field label="Motivo" htmlFor="m-motivo" error={errMotivo || undefined}><Textarea id="m-motivo" value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} /></Field>
      </Confirmar>
    </>
  );
}
