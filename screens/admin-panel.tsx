'use client';
import * as React from 'react';
import { AlertOctagon, Building2, CalendarClock, LifeBuoy, Plus, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EjemploChip, PageHeader, Stat } from '@/components/ds/page';
import { Semaforo } from '@/components/ds/badges';
import { Pantalla } from '@/components/ds/states';
import { Enlace, ir } from '@/lib/router';
import { useStore } from '@/lib/store';
import { avance, type Empresa } from '@/lib/data';
import { cop, fecha } from '@/lib/utils';

export function Panel() {
  const { empresas } = useStore();
  const proyectos = empresas.filter((e) => e.estado === 'activa').flatMap((e) => e.proyectos.map((p) => ({ e, p })));
  const activos = proyectos.filter(({ p }) => p.hitos.some((h) => h.n !== 13 && h.estado !== 'terminado'));
  const retrasos = activos.flatMap(({ e, p }) => p.hitos.filter((h) => h.retraso && h.estado !== 'terminado').map((h) => ({ e, p, h })));
  const vencidos = empresas.flatMap((e) => e.pagos.filter((p) => p.estado === 'vencido').map((p) => ({ e, p })));
  const tickets = empresas.flatMap((e) => e.tickets).filter((t) => t.estado !== 'Cerrado' && t.estado !== 'Resuelto');
  const enRevision = empresas.flatMap((e) => e.comprobantes.filter((c) => c.estado === 'en_revision').map((c) => ({ e, c })));
  const listas = empresas.flatMap((e) => e.revisiones.filter((r) => r.estado === 'borrador').map((r) => ({ e, r })));
  const rojos = tickets.filter((t) => t.respuesta.restanteH !== null && t.respuesta.restanteH < 0);
  return (
    <>
      <PageHeader eyebrow="Zona del super administrador" titulo="Panel general" descripcion="Lo que necesita tu atención hoy, de todos los clientes." acciones={<EjemploChip />} />
      <Pantalla vacio={{ titulo: 'Aún no hay clientes', texto: 'Crea la primera empresa cliente para empezar.', accion: <Button asChild><Enlace to="/admin/clientes">Ir a clientes</Enlace></Button> }}>
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat etiqueta="Proyectos activos" valor={activos.length} nota={`${empresas.filter((e) => e.estado === 'activa').length} empresas activas`} icono={<Building2 className="size-5" />} />
          <Stat etiqueta="Hitos con retraso" valor={retrasos.length} tono={retrasos.length ? 'warning' : undefined} nota={`${retrasos.filter((r) => r.h.retraso!.lado === 'cliente').length} por el cliente`} icono={<CalendarClock className="size-5" />} />
          <Stat etiqueta="Pagos vencidos" valor={vencidos.length} tono={vencidos.length ? 'danger' : undefined} nota={cop(vencidos.reduce((s, v) => s + v.p.valor, 0))} icono={<Wallet className="size-5" />} />
          <Stat etiqueta="Tickets abiertos" valor={tickets.length} tono={rojos.length ? 'danger' : undefined} nota={`${rojos.length} con respuesta vencida`} icono={<LifeBuoy className="size-5" />} />
        </div>
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertOctagon className="size-5 text-warning" aria-hidden />Requiere tu atención</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {rojos.map((t) => <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"><Badge variant="danger">Ticket</Badge><Enlace className="min-w-0 flex-1 hover:underline" to={`/admin/tickets/${t.id}`}>{t.id} · {t.titulo}</Enlace><Semaforo totalH={t.respuesta.totalH} restanteH={t.respuesta.restanteH} /></li>)}
                {vencidos.map(({ e, p }) => <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"><Badge variant="danger">Pago vencido</Badge><Enlace className="min-w-0 flex-1 hover:underline" to="/admin/finanzas">{e.nombre} · {p.concepto}</Enlace><span className="tabular-nums text-muted-foreground">{cop(p.valor)}</span></li>)}
                {enRevision.map(({ e, c }) => <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"><Badge variant="warning">Comprobante</Badge><Enlace className="min-w-0 flex-1 hover:underline" to="/admin/finanzas">{e.nombre} · {c.archivo}</Enlace><span className="text-muted-foreground">por confirmar</span></li>)}
                {listas.map(({ e, r }) => <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"><Badge variant="info">Revisión</Badge><Enlace className="min-w-0 flex-1 hover:underline" to="/admin/aprobaciones">{e.nombre} · {r.titulo}</Enlace><span className="text-muted-foreground">lista para publicar</span></li>)}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Hitos con retraso</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {retrasos.map(({ e, p, h }) => (
                  <li key={e.id + p.id + h.n} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{e.nombre} · {p.nombre}</p><Badge variant={h.retraso!.lado === 'cliente' ? 'info' : 'warning'}>{h.retraso!.lado === 'cliente' ? 'Por el cliente' : 'Por Websourcing'}</Badge></div><p className="mt-1 text-muted-foreground">Hito {h.n} · {h.nombre}: {fecha(h.retraso!.anterior, true)} → {fecha(h.retraso!.nueva, true)}. {h.retraso!.motivo}</p></li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        <h2 className="mb-3 text-display-md">Proyectos</h2>
        <Table>
          <THead><TR><TH>Cliente</TH><TH>Proyecto</TH><TH className="w-56">Avance</TH><TH>Próxima demo</TH><TH>Estado</TH></TR></THead>
          <TBody>
            {empresas.flatMap((e) => e.proyectos.map((p) => ({ e, p }))).map(({ e, p }) => {
              const a = avance(p);
              const entregado = p.hitos.filter((h) => h.n <= 12).every((h) => h.estado === 'terminado');
              return (
                <TR key={e.id + p.id} className="cursor-pointer" onClick={() => ir(`/admin/proyectos/${e.id}/${p.id}`)}>
                  <TD className="font-medium">{e.nombre}</TD>
                  <TD><Enlace to={`/admin/proyectos/${e.id}/${p.id}`} className="text-primary-text hover:underline">{p.nombre}</Enlace></TD>
                  <TD><div className="flex items-center gap-3"><Progress className="flex-1" value={a.pct} label={`Avance de ${p.nombre}`} /><span className="w-10 text-right tabular-nums">{a.pct}%</span></div></TD>
                  <TD>{p.proximaDemo ? fecha(p.proximaDemo) : '—'}</TD>
                  <TD>{e.estado === 'pausada' ? <Badge variant="warning">Empresa pausada</Badge> : entregado ? <Badge variant="success">Entregado</Badge> : <Badge variant="info">En curso</Badge>}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Pantalla>
    </>
  );
}

export function Clientes() {
  const { empresas, avisar, registrar } = useStore();
  const [dlg, setDlg] = React.useState(false);
  const [f, setF] = React.useState({ nombre: '', razon: '', nit: '', correo: '', admin: '' });
  const [intento, setIntento] = React.useState(false);
  const crear = () => {
    setIntento(true);
    if (!f.nombre.trim() || !f.admin.includes('@')) return;
    registrar(`Creó la empresa "${f.nombre}" e invitó a ${f.admin}`, f.nombre);
    avisar(`Empresa creada. Enviamos la invitación a ${f.admin}.`);
    setDlg(false); setF({ nombre: '', razon: '', nit: '', correo: '', admin: '' }); setIntento(false);
  };
  const ab = (e: Empresa) => e.tickets.filter((t) => t.estado !== 'Cerrado' && t.estado !== 'Resuelto').length;
  return (
    <>
      <PageHeader titulo="Clientes" descripcion="Cada empresa vive en su propio apartamento: nadie ve los datos de otra." acciones={<Button onClick={() => setDlg(true)}><Plus />Nueva empresa</Button>} />
      <Pantalla vacio={{ titulo: 'Aún no hay empresas', texto: 'Crea la primera empresa cliente: nombre, razón social, NIT, correo de facturas y su primer administrador.' }}>
        <Table>
          <THead><TR><TH>Empresa</TH><TH>Proyectos</TH><TH>Estado</TH><TH>Mantenimiento</TH><TH>Pagos vencidos</TH><TH>Tickets abiertos</TH><TH><span className="sr-only">Abrir</span></TH></TR></THead>
          <TBody>
            {empresas.map((e) => (
              <TR key={e.id}>
                <TD><p className="font-medium">{e.nombre}</p><p className="text-xs text-muted-foreground">{e.nit}</p></TD>
                <TD>{e.proyectos.map((p) => p.nombre).join(', ')}</TD>
                <TD><Badge variant={e.estado === 'activa' ? 'success' : 'warning'}>{e.estado === 'activa' ? 'Activa' : 'Pausada'}</Badge></TD>
                <TD><Badge variant={e.mantenimiento.activo ? 'primary' : 'neutral'}>{e.mantenimiento.activo ? `Activo · ${e.mantenimiento.plan}` : 'Apagado'}</Badge></TD>
                <TD className={e.pagos.some((p) => p.estado === 'vencido') ? 'font-medium text-danger' : 'text-muted-foreground'}>{e.pagos.filter((p) => p.estado === 'vencido').length}</TD>
                <TD>{ab(e)}</TD>
                <TD className="text-right"><Button size="sm" variant="secondary" asChild><Enlace to={`/admin/clientes/${e.id}`}>Abrir</Enlace></Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Pantalla>
      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent title="Nueva empresa cliente" description="Le enviamos la invitación a su primer administrador. El mantenimiento nace apagado.">
          <div className="space-y-4">
            <Field label="Nombre" htmlFor="n-nombre" error={intento && !f.nombre.trim() ? 'Escribe el nombre.' : undefined}><Input id="n-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
            <Field label="Razón social" htmlFor="n-razon"><Input id="n-razon" value={f.razon} onChange={(e) => setF({ ...f, razon: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="NIT" htmlFor="n-nit"><Input id="n-nit" value={f.nit} onChange={(e) => setF({ ...f, nit: e.target.value })} /></Field><Field label="Correo de facturas" htmlFor="n-correo"><Input id="n-correo" type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} /></Field></div>
            <Field label="Correo del primer administrador" htmlFor="n-admin" error={intento && !f.admin.includes('@') ? 'Escribe un correo válido.' : undefined}><Input id="n-admin" type="email" value={f.admin} onChange={(e) => setF({ ...f, admin: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={crear}>Crear y enviar invitación</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
