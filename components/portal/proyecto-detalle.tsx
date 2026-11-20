'use client';
import * as React from 'react';
import { ArrowLeft, History, ListChecks, Pencil } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { PageHeader, Seccion, Stat } from '@/components/ds/page';
import { EstadoCargando, EstadoError, SinPermiso } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { editarHito, editarProyecto, fijarPagoHito, lineaDeTiempo } from '@/lib/portal/acciones';
import { correr, ESTADO_HITO, ESTADO_PROYECTO, PAGOS_HITO } from '@/lib/app/proyectos';
import { esUuid, useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import type { AvisoPlan, EstadoHito, EstadoProyecto, HitoLineaDeTiempo, LadoRetraso } from '@/lib/supabase/database.types';
import { fecha } from '@/lib/utils';
import { HistorialLista, leerHistorial } from './inicio-cliente';
import { LineaDeTiempoReal } from './linea-tiempo';
import { ConsumoEquipoCard } from './consumo-equipo';
import { BotonVerComo } from './ver-como';
import { textoAviso } from './plan-sprints';

async function leer(id: string) {
  const c = crearClienteNavegador();
  const [l, h, p] = await Promise.all([lineaDeTiempo(c, id), leerHistorial(id), c.from('proyectos').select('*').eq('id', id).maybeSingle()]);
  if (l.error) { if (String(l.error.message).includes('proyecto_no_encontrado')) return null; throw new Error('lectura_fallida'); }
  if (!l.data || p.error) throw new Error('lectura_fallida');
  return { linea: l.data, historial: h, proyecto: p.data };
}

interface FormHito { nombre: string; estado: EstadoHito; planeada: string; real: string; visible: boolean; pago: string; motivo: string; lado: LadoRetraso; queFalta: string }

function HitoDialog({ hito, onCerrar, onHecho }: { hito: HitoLineaDeTiempo | null; onCerrar: () => void; onHecho: (avisos: AvisoPlan[]) => void }) {
  const { avisar } = useStore();
  const [f, setF] = React.useState<FormHito | null>(null);
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [trabajando, setTrabajando] = React.useState(false);
  React.useEffect(() => {
    if (!hito) return;
    setIntento(false); setError('');
    setF({ nombre: hito.nombre, estado: hito.estado, planeada: hito.fecha_planeada ?? '', real: hito.fecha_real ?? '', visible: hito.visible, pago: hito.pago_asociado ?? '', motivo: '', lado: 'websourcing', queFalta: '' });
  }, [hito]);
  if (!hito || !f) return null;
  const derivado = hito.numero === 6;
  const cambioFecha = f.planeada !== (hito.fecha_planeada ?? '') && f.planeada !== '';
  const pideRetraso = cambioFecha && !!hito.fecha_planeada; // la primera vez que se fija no hace falta motivo
  const eMotivo = intento && pideRetraso && f.motivo.trim().length < 5 ? 'El motivo es obligatorio (mínimo 5 caracteres).' : undefined;
  const eFalta = intento && pideRetraso && f.lado === 'cliente' && !f.queFalta.trim() ? 'Cuéntale al cliente qué falta de su lado.' : undefined;
  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault(); setIntento(true); setError('');
    if (pideRetraso && (f.motivo.trim().length < 5 || (f.lado === 'cliente' && !f.queFalta.trim()))) return;
    setTrabajando(true);
    const c = crearClienteNavegador();
    const args: Parameters<typeof editarHito>[1] = { p_hito_id: hito.id };
    if (f.nombre.trim() !== hito.nombre) args.p_nombre = f.nombre.trim();
    if (!derivado && f.estado !== hito.estado) args.p_estado = f.estado;
    if (cambioFecha) args.p_fecha_planeada = f.planeada;
    if (!derivado && f.real && f.real !== (hito.fecha_real ?? '')) args.p_fecha_real = f.real;
    if (hito.numero === 13 && f.visible !== hito.visible) args.p_visible = f.visible;
    if (pideRetraso) { args.p_motivo = f.motivo.trim(); args.p_lado = f.lado; if (f.lado === 'cliente') args.p_que_falta = f.queFalta.trim(); }
    if (Object.keys(args).length > 1) {
      const r = await correr('editar_hito', editarHito(c, args));
      if (r.error) { setError(r.mensaje); setTrabajando(false); return; }
    }
    if (f.pago !== (hito.pago_asociado ?? '')) {
      const r = await correr('fijar_pago_hito', fijarPagoHito(c, hito.id, f.pago || null));
      if (r.error) { setError(r.mensaje); setTrabajando(false); return; }
    }
    setTrabajando(false);
    avisar(pideRetraso ? 'Fecha cambiada. El cliente verá la nueva fecha, el motivo y de qué lado es.' : 'Hito guardado.');
    onHecho([]);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !trabajando && onCerrar()}>
      <DialogContent title={`Editar hito ${hito.numero}`} description="Los cambios de fecha ya fijada avisan al cliente con el motivo.">
        <form className="space-y-4" onSubmit={guardar} noValidate>
          <Field label="Nombre" htmlFor="h-nombre"><Input id="h-nombre" value={f.nombre} maxLength={120} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
          <Field label="Estado" htmlFor="h-estado" hint={derivado ? 'El estado de este hito se calcula solo a partir de los sprints.' : undefined}>
            <Select id="h-estado" value={f.estado} disabled={derivado} onChange={(e) => setF({ ...f, estado: e.target.value as EstadoHito })}>
              {(Object.keys(ESTADO_HITO) as EstadoHito[]).map((x) => <option key={x} value={x}>{ESTADO_HITO[x]}</option>)}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha planeada" htmlFor="h-plan"><Input id="h-plan" type="date" value={f.planeada} onChange={(e) => setF({ ...f, planeada: e.target.value })} /></Field>
            <Field label="Fecha real" htmlFor="h-real"><Input id="h-real" type="date" disabled={derivado} value={f.real} onChange={(e) => setF({ ...f, real: e.target.value })} /></Field>
          </div>
          {pideRetraso && (
            <div className="space-y-4 rounded-lg border border-warning/50 bg-warning/10 p-4" data-testid="bloque-retraso">
              <p className="text-sm font-medium">Cambiaste una fecha ya fijada: cuéntale al cliente por qué.</p>
              <Field label="Motivo del cambio" htmlFor="h-motivo" error={eMotivo}><Textarea id="h-motivo" value={f.motivo} maxLength={500} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></Field>
              <Field label="¿De quién es el cambio?" htmlFor="h-lado"><Select id="h-lado" value={f.lado} onChange={(e) => setF({ ...f, lado: e.target.value as LadoRetraso })}><option value="websourcing">Por Websourcing</option><option value="cliente">Esperando al cliente</option></Select></Field>
              {f.lado === 'cliente' && <Field label="¿Qué falta de su lado?" htmlFor="h-falta" error={eFalta}><Input id="h-falta" value={f.queFalta} maxLength={300} onChange={(e) => setF({ ...f, queFalta: e.target.value })} /></Field>}
            </div>
          )}
          <Field label="Pago asociado" htmlFor="h-pago" hint="Solo la etiqueta; los montos llegan con el módulo de dinero.">
            <Select id="h-pago" value={f.pago} onChange={(e) => setF({ ...f, pago: e.target.value })}>
              <option value="">Ninguno</option>
              {[...PAGOS_HITO, ...(f.pago && !PAGOS_HITO.includes(f.pago) ? [f.pago] : [])].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          {hito.numero === 13 && <Checkbox id="h-visible" checked={f.visible} onChange={(v) => setF({ ...f, visible: v })} label="Mostrar este hito al cliente (mantenimiento activo)" />}
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="ghost" disabled={trabajando}>Cancelar</Button></DialogClose><Button type="submit" disabled={trabajando}>{trabajando ? 'Guardando…' : 'Guardar hito'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProyectoDialog({ abierto, proyecto, onCerrar, onHecho }: { abierto: boolean; proyecto: { id: string; nombre: string; descripcion: string | null; estado: EstadoProyecto; fecha_inicio: string | null; fecha_fin_planeada: string | null; fecha_fin_real: string | null }; onCerrar: () => void; onHecho: () => void }) {
  const { avisar } = useStore();
  const ini = () => ({ nombre: proyecto.nombre, descripcion: proyecto.descripcion ?? '', estado: proyecto.estado, inicio: proyecto.fecha_inicio ?? '', fin: proyecto.fecha_fin_planeada ?? '' });
  const [f, setF] = React.useState(ini);
  const [error, setError] = React.useState('');
  React.useEffect(() => { if (abierto) { setF(ini()); setError(''); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault(); setError('');
    if (f.nombre.trim().length < 2) { setError('Escribe el nombre del proyecto.'); return; }
    const r = await correr('editar_proyecto', editarProyecto(crearClienteNavegador(), {
      p_proyecto_id: proyecto.id, p_nombre: f.nombre.trim(), p_descripcion: f.descripcion.trim() || null, p_estado: f.estado,
      p_fecha_inicio: f.inicio || null, p_fecha_fin_planeada: f.fin || null,
    }));
    if (r.error) { setError(r.mensaje); return; }
    avisar('Proyecto guardado.'); onHecho();
  };
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent title="Editar proyecto">
        <form className="space-y-4" onSubmit={guardar} noValidate>
          <Field label="Nombre" htmlFor="ep-nombre"><Input id="ep-nombre" value={f.nombre} maxLength={160} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
          <Field label="Descripción" htmlFor="ep-desc"><Textarea id="ep-desc" value={f.descripcion} maxLength={1000} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Field>
          <Field label="Estado" htmlFor="ep-estado"><Select id="ep-estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as EstadoProyecto })}>{(Object.keys(ESTADO_PROYECTO) as EstadoProyecto[]).map((x) => <option key={x} value={x}>{ESTADO_PROYECTO[x]}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Inicio" htmlFor="ep-ini"><Input id="ep-ini" type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Field>
            <Field label="Fin planeado" htmlFor="ep-fin"><Input id="ep-fin" type="date" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Field>
          </div>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="ghost">Cancelar</Button></DialogClose><Button type="submit">Guardar proyecto</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Detalle de proyecto del super admin: 13 hitos editables, plan, historial completo y consumo del equipo (interno). */
export function ProyectoDetalleReal({ empresaId, proyectoId }: { empresaId: string; proyectoId: string }) {
  const { estado, datos, recargar } = useCargar(() => (esUuid(proyectoId) ? leer(proyectoId) : Promise.resolve(null)), [proyectoId]);
  const [hito, setHito] = React.useState<HitoLineaDeTiempo | null>(null);
  const [editando, setEditando] = React.useState(false);
  const volver = <Button variant="ghost" asChild><Enlace to={`/admin/clientes/${empresaId}`}><ArrowLeft />Cliente</Enlace></Button>;
  if (estado === 'cargando') return <><PageHeader titulo="Proyecto" acciones={volver} /><EstadoCargando /></>;
  if (estado === 'error') return <><PageHeader titulo="Proyecto" acciones={volver} /><EstadoError onReintentar={() => recargar()} /></>;
  if (!datos || !datos.proyecto) return <><PageHeader titulo="Proyecto" acciones={volver} /><SinPermiso texto="No encontramos ese proyecto." inicio="/admin/proyectos" /></>;
  const { linea, historial, proyecto } = datos;
  const r = linea.proyecto;
  const avisos = linea.plan?.avisos ?? [];
  return (
    <>
      <PageHeader eyebrow={r.empresa_nombre} titulo={proyecto.nombre} descripcion={proyecto.descripcion ?? 'Edita nombres, fechas y estados de los 13 hitos. Un cambio de fecha ya fijada siempre lleva motivo y lado.'}
        acciones={<>
          {volver}
          <Button variant="secondary" onClick={() => setEditando(true)}><Pencil />Editar proyecto</Button>
          <Button variant="secondary" asChild><Enlace to={`/admin/proyectos/${empresaId}/${proyectoId}/plan`}><ListChecks />Plan de sprints</Enlace></Button>
          <BotonVerComo empresaId={empresaId} empresaNombre={r.empresa_nombre} deshabilitado={r.empresa_estado === 'pausada'} />
        </>} />
      {r.empresa_estado === 'pausada' && <Alert variant="warning" className="mb-4" title="Empresa pausada">Sus usuarios no pueden entrar. No se puede usar "Ver como el cliente" mientras esté pausada.</Alert>}
      {proyecto.estado !== 'activo' && <Alert variant="info" className="mb-4" title={`Proyecto ${ESTADO_PROYECTO[proyecto.estado].toLowerCase()}`}>{proyecto.estado === 'terminado' || proyecto.estado === 'cancelado' ? 'Está cerrado: para cambiar algo, primero reábrelo con "Editar proyecto".' : 'Está en pausa.'}</Alert>}
      {avisos.map((a) => <Alert key={a.sprints.join()} variant="warning" className="mb-4" title="Fechas que se cruzan">{textoAviso(a)}</Alert>)}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Avance</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none">{Math.round(r.avance_pct * 10) / 10}%</p>
          <Progress className="mt-3" value={r.avance_pct} label="Avance del proyecto" />
          <p className="mt-2 text-xs text-muted-foreground">{r.avance_partes_hechas}/{r.avance_partes_total} partes</p>
        </Card>
        <Stat etiqueta="Plan de sprints" valor={r.plan_estado === 'aprobado' ? 'Publicado' : 'Propuesta'} tono={r.plan_estado === 'aprobado' ? 'success' : 'warning'} nota={r.plan_estado === 'aprobado' ? 'El cliente lo ve' : 'El cliente aún no lo ve'} />
        <Stat etiqueta="Sprint actual" valor={r.sprint_actual_numero ?? '—'} nota={r.sprint_actual_nombre ?? 'Ninguno en marcha'} />
        <Stat etiqueta="Hitos atrasados" valor={r.hitos_atrasados} tono={r.hitos_atrasados ? 'warning' : undefined} nota={r.proxima_demo ? `Próxima demo: ${fecha(r.proxima_demo)}` : 'Sin demo programada'} />
      </div>
      <Seccion titulo="Los 13 hitos" descripcion="Toca el lápiz de un hito para cambiar nombre, estado, fechas o pago asociado.">
        <LineaDeTiempoReal datos={linea} onEditar={setHito} esAdmin />
      </Seccion>
      <div className="mb-8"><ConsumoEquipoCard proyectoId={proyectoId} /></div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5 text-primary-text" aria-hidden />Historial del proyecto</CardTitle><p className="text-sm text-muted-foreground">Incluye lo interno. Cada fila dice si el cliente la ve.</p></CardHeader>
        <CardContent><HistorialLista filas={historial} esAdmin /></CardContent>
      </Card>
      <HitoDialog hito={hito} onCerrar={() => setHito(null)} onHecho={() => { setHito(null); recargar(true); }} />
      <ProyectoDialog abierto={editando} proyecto={proyecto} onCerrar={() => setEditando(false)} onHecho={() => { setEditando(false); recargar(true); }} />
    </>
  );
}
