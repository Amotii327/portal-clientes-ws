'use client';
import * as React from 'react';
import { ArrowLeft, Ban, Eye, PauseCircle, PlayCircle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader, Seccion } from '@/components/ds/page';
import { Timeline } from '@/components/ds/timeline';
import { Pantalla, SinPermiso } from '@/components/ds/states';
import { RevisionBadge } from '@/components/ds/badges';
import { Enlace, ir } from '@/lib/router';
import { useStore } from '@/lib/store';
import { avance, type Hito, type HitoEstado, type Lado } from '@/lib/data';
import { fecha, fechaHora } from '@/lib/utils';

export function ClienteDetalle({ id }: { id: string }) {
  const s = useStore();
  const e = s.empresas.find((x) => x.id === id);
  if (!e) return <SinPermiso texto="Esta empresa no existe." />;
  const log = s.actividad.filter((a) => a.empresa === e.nombre).slice(0, 6);
  return (
    <>
      <PageHeader eyebrow="Cliente" titulo={e.nombre} descripcion={`${e.razonSocial} · NIT ${e.nit}`}
        acciones={<>
          <Button variant="ghost" asChild><Enlace to="/admin/clientes"><ArrowLeft />Clientes</Enlace></Button>
          <Button variant="secondary" onClick={() => { s.setEmpresaId(e.id); s.setVerComo(true); s.setRol('admin'); s.registrar('Entró en modo "ver como el cliente" (solo lectura)', e.nombre); ir('/cliente/inicio'); }}><Eye />Ver como el cliente</Button>
          <Button variant={e.estado === 'activa' ? 'destructive' : 'default'} onClick={() => { s.mutar(e.id, (x) => { x.estado = x.estado === 'activa' ? 'pausada' : 'activa'; }, e.estado === 'activa' ? 'Pausó la empresa' : 'Reactivó la empresa'); s.avisar(e.estado === 'activa' ? 'Empresa pausada. Sus usuarios ven un mensaje amable. No se borró nada.' : 'Empresa reactivada.'); }}>{e.estado === 'activa' ? <><PauseCircle />Pausar empresa</> : <><PlayCircle />Reactivar</>}</Button>
        </>} />
      <Pantalla vacio={{ titulo: 'Sin datos', texto: 'Esta empresa todavía no tiene proyectos.' }}>
        {e.estado === 'pausada' && <Alert variant="warning" className="mb-6" title="Empresa pausada">Sus usuarios no pueden entrar y ven un mensaje amable.</Alert>}
        <Seccion titulo="Proyectos">
          <Table>
            <THead><TR><TH>Proyecto</TH><TH className="w-56">Avance</TH><TH>Próxima demo</TH><TH><span className="sr-only">Abrir</span></TH></TR></THead>
            <TBody>{e.proyectos.map((p) => { const a = avance(p); return <TR key={p.id}><TD className="font-medium">{p.nombre}</TD><TD><div className="flex items-center gap-3"><Progress className="flex-1" value={a.pct} label={`Avance de ${p.nombre}`} /><span className="w-10 text-right tabular-nums">{a.pct}%</span></div></TD><TD>{p.proximaDemo ? fecha(p.proximaDemo) : '—'}</TD><TD className="text-right"><Button size="sm" variant="secondary" asChild><Enlace to={`/admin/proyectos/${e.id}/${p.id}`}>Editar hitos</Enlace></Button></TD></TR>; })}</TBody>
          </Table>
        </Seccion>
        <Seccion titulo="Personas de la empresa" descripcion="Bloquear corta el acceso en la siguiente acción. El historial se conserva.">
          <Table>
            <THead><TR><TH>Cargo</TH><TH>Correo</TH><TH>Rol</TH><TH>Estado</TH><TH><span className="sr-only">Acción</span></TH></TR></THead>
            <TBody>{e.miembros.map((m) => <TR key={m.id}><TD className="font-medium">{m.cargo}</TD><TD className="text-muted-foreground">{m.correo}</TD><TD>{m.rol === 'admin' ? 'Administrador' : 'Equipo'}</TD><TD><Badge variant={m.estado === 'activo' ? 'success' : m.estado === 'invitado' ? 'warning' : 'danger'}>{m.estado === 'activo' ? 'Activo' : m.estado === 'invitado' ? 'Invitado' : 'Bloqueado'}</Badge></TD><TD className="text-right"><Button size="sm" variant="outline" onClick={() => { s.mutar(e.id, (x) => { const y = x.miembros.find((z) => z.id === m.id)!; y.estado = y.estado === 'bloqueado' ? 'activo' : 'bloqueado'; }, `${m.estado === 'bloqueado' ? 'Desbloqueó' : 'Bloqueó'} a ${m.cargo}`); }}><Ban />{m.estado === 'bloqueado' ? 'Desbloquear' : 'Bloquear'}</Button></TD></TR>)}</TBody>
          </Table>
        </Seccion>
        <Card><CardHeader><CardTitle>Historial reciente</CardTitle></CardHeader><CardContent>
          <ul className="divide-y divide-border text-sm">{log.map((a, i) => <li key={i} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4"><span className="shrink-0 text-muted-foreground sm:w-40">{fechaHora(a.cuando)}</span><span><strong>{a.quien}:</strong> {a.accion}</span></li>)}{log.length === 0 && <li className="py-3 text-muted-foreground">Sin actividad.</li>}</ul>
        </CardContent></Card>
      </Pantalla>
    </>
  );
}

export function ProyectoDetalle({ empresaId, proyectoId }: { empresaId: string; proyectoId: string }) {
  const s = useStore();
  const e = s.empresas.find((x) => x.id === empresaId);
  const p = e?.proyectos.find((x) => x.id === proyectoId);
  const [edit, setEdit] = React.useState<Hito | null>(null);
  const [f, setF] = React.useState({ nombre: '', estado: 'pendiente' as HitoEstado, planeada: '', real: '', motivo: '', lado: 'websourcing' as Lado, pagoId: '' });
  const [intento, setIntento] = React.useState(false);
  if (!e || !p) return <SinPermiso texto="Este proyecto no existe." />;
  const abrir = (h: Hito) => { setEdit(h); setIntento(false); setF({ nombre: h.nombre, estado: h.estado, planeada: h.retraso?.nueva ?? h.planeada, real: h.real ?? '', motivo: '', lado: 'websourcing', pagoId: h.pagoId ?? '' }); };
  const actual = edit ? (edit.retraso?.nueva ?? edit.planeada) : '';
  const cambioFecha = !!edit && f.planeada !== actual;
  const guardar = () => {
    if (!edit) return;
    if (cambioFecha && f.motivo.trim().length < 5) { setIntento(true); return; }
    s.mutar(e.id, (x) => {
      const h = x.proyectos.find((y) => y.id === p.id)!.hitos.find((y) => y.n === edit.n)!;
      h.nombre = f.nombre; h.estado = f.estado; h.real = f.real || undefined; h.pagoId = f.pagoId || undefined;
      if (cambioFecha) { h.retraso = { anterior: h.retraso?.anterior ?? h.planeada, nueva: f.planeada, motivo: f.motivo, lado: f.lado, falta: f.lado === 'cliente' ? 'Revisa tu bandeja y los archivos que te pedimos.' : undefined }; if (!h.retraso.anterior || h.retraso.anterior === f.planeada) h.retraso = undefined; }
    }, cambioFecha ? `Movió la fecha del hito ${edit.n} (motivo: ${f.motivo}; lado: ${f.lado})` : `Editó el hito ${edit.n}`);
    s.avisar(cambioFecha ? 'Fecha cambiada. El cliente verá la nueva fecha, el motivo y de qué lado es.' : 'Hito guardado.');
    setEdit(null);
  };
  const revs = e.revisiones.filter((r) => r.proyectoId === p.id);
  return (
    <>
      <PageHeader eyebrow={e.nombre} titulo={p.nombre} descripcion="Edita nombres, fechas y estados de los 13 hitos. Un retraso siempre lleva motivo y lado." acciones={<Button variant="ghost" asChild><Enlace to={`/admin/clientes/${e.id}`}><ArrowLeft />Cliente</Enlace></Button>} />
      <Pantalla vacio={{ titulo: 'Sin hitos', texto: 'Este proyecto todavía no tiene hitos.' }}>
        <Timeline proyecto={p} pagos={e.pagos} verDinero mantenimientoActivo onEditar={abrir} />
        <Seccion titulo="Revisiones del proyecto" className="mt-10">
          <Table><THead><TR><TH>Revisión</TH><TH>Versión</TH><TH>Estado</TH></TR></THead><TBody>{revs.map((r) => <TR key={r.id}><TD className="font-medium">{r.titulo}</TD><TD>v{r.version}</TD><TD><RevisionBadge estado={r.estado} vistaWebsourcing /></TD></TR>)}</TBody></Table>
        </Seccion>
      </Pantalla>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={`Editar hito ${edit.n}`} description="Los cambios de fecha avisan al cliente con el motivo.">
            <div className="space-y-4">
              <Field label="Nombre" htmlFor="h-nombre"><Input id="h-nombre" value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} /></Field>
              <Field label="Estado" htmlFor="h-estado"><Select id="h-estado" value={f.estado} onChange={(x) => setF({ ...f, estado: x.target.value as HitoEstado })}><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="esperando">Esperando aprobación del cliente</option><option value="terminado">Terminado</option></Select></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fecha planeada" htmlFor="h-plan"><Input id="h-plan" type="date" value={f.planeada} onChange={(x) => setF({ ...f, planeada: x.target.value })} /></Field>
                <Field label="Fecha real" htmlFor="h-real"><Input id="h-real" type="date" value={f.real} onChange={(x) => setF({ ...f, real: x.target.value })} /></Field>
              </div>
              {cambioFecha && (
                <div className="space-y-4 rounded-lg border border-warning/50 bg-warning/10 p-4">
                  <p className="text-sm font-medium">Cambiaste la fecha: cuéntale al cliente por qué.</p>
                  <Field label="Motivo del retraso" htmlFor="h-motivo" error={intento && f.motivo.trim().length < 5 ? 'El motivo es obligatorio.' : undefined}><Textarea id="h-motivo" value={f.motivo} onChange={(x) => setF({ ...f, motivo: x.target.value })} /></Field>
                  <Field label="¿De quién es el retraso?" htmlFor="h-lado"><Select id="h-lado" value={f.lado} onChange={(x) => setF({ ...f, lado: x.target.value as Lado })}><option value="websourcing">Por Websourcing</option><option value="cliente">Esperando al cliente</option></Select></Field>
                </div>
              )}
              <Field label="Pago asociado" htmlFor="h-pago"><Select id="h-pago" value={f.pagoId} onChange={(x) => setF({ ...f, pagoId: x.target.value })}><option value="">Ninguno</option>{e.pagos.filter((q) => q.origen === 'contrato' || q.origen === 'mantenimiento').map((q) => <option key={q.id} value={q.id}>{q.concepto}</option>)}</Select></Field>
              <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={guardar}>Guardar hito</Button></div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
