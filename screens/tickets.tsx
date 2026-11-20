'use client';
import * as React from 'react';
import { AlertTriangle, ArrowLeft, Bug, FilePlus2, HelpCircle, KeyRound, Paperclip, Plus, Send, Star, StickyNote, ThumbsUp } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Tabs } from '@/components/ui/tabs';
import { PrioridadBadge, Semaforo, TicketBadge } from '@/components/ds/badges';
import { PageHeader } from '@/components/ds/page';
import { Pantalla, SinPermiso } from '@/components/ds/states';
import { Enlace, ir } from '@/lib/router';
import { useStore } from '@/lib/store';
import type { Area, Prioridad, Ticket, TicketEstado, TicketTipo } from '@/lib/data';
import { cn, cop, fecha, fechaHora } from '@/lib/utils';

const TIPOS: { id: TicketTipo; icono: React.ReactNode; texto: string }[] = [
  { id: 'Error', icono: <Bug className="size-5" />, texto: 'Algo no funciona como debe.' },
  { id: 'Solicitud de cambio', icono: <FilePlus2 className="size-5" />, texto: 'Quieres algo nuevo o distinto.' },
  { id: 'Pregunta', icono: <HelpCircle className="size-5" />, texto: 'Tienes una duda.' },
  { id: 'Acceso', icono: <KeyRound className="size-5" />, texto: 'Necesitas un usuario o permiso.' },
];
const AVISO_ACCESO = 'No escribas claves aquí. Te indicaremos cómo entregarlas de forma segura.';
const AREAS: Area[] = ['Producto', 'Arquitectura', 'Diseño', 'Desarrollo', 'Calidad', 'Operaciones'];

export function TicketsLista({ modo }: { modo: 'cliente' | 'admin' }) {
  const s = useStore();
  const [tab, setTab] = React.useState<'todos' | 'abiertos' | 'cerrados'>('abiertos');
  const [fEmp, setFEmp] = React.useState('todas');
  const [fPri, setFPri] = React.useState('todas');
  const [fEst, setFEst] = React.useState('todos');
  const admin = modo === 'admin';
  let lista: Ticket[] = admin ? s.empresas.flatMap((e) => e.tickets) : s.empresa.tickets;
  if (!admin && !s.can.verTodosTickets) lista = lista.filter((t) => t.creadorId === s.usuario?.id);
  const abierto = (t: Ticket) => t.estado !== 'Cerrado' && t.estado !== 'Resuelto';
  const base = lista;
  lista = lista.filter((t) => (tab === 'todos' ? true : tab === 'abiertos' ? abierto(t) : !abierto(t)));
  if (admin) lista = lista.filter((t) => (fEmp === 'todas' || t.empresaId === fEmp) && (fPri === 'todas' || t.prioridad === fPri) && (fEst === 'todos' || t.estado === fEst));
  lista = [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  const nombreEmpresa = (id: string) => s.empresas.find((e) => e.id === id)?.nombre ?? '';
  const detalle = (t: Ticket) => (admin ? `/admin/tickets/${t.id}` : `/cliente/tickets/${t.id}`);

  return (
    <>
      <PageHeader
        titulo={admin ? 'Tickets de todos los clientes' : 'Tickets'}
        descripcion={admin ? 'Filtra por cliente, prioridad y estado. El semáforo muestra el tiempo que falta para la primera respuesta.' : s.can.verTodosTickets ? 'Todas las solicitudes de tu empresa.' : 'Estas son las solicitudes que creaste tú.'}
        acciones={!admin && <Button asChild><Enlace to="/cliente/tickets/nuevo"><Plus />Nuevo ticket</Enlace></Button>}
      />
      <Pantalla vacio={{ titulo: 'Aún no hay tickets', texto: 'Cuando necesites algo, crea un ticket y sigue su avance aquí hasta que se cierre.', accion: !admin && <Button asChild><Enlace to="/cliente/tickets/nuevo"><Plus />Crear mi primer ticket</Enlace></Button> }}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onChange={setTab} className="w-fit max-w-full" items={[{ id: 'abiertos', label: 'Abiertos', count: base.filter(abierto).length }, { id: 'cerrados', label: 'Resueltos y cerrados', count: base.filter((t) => !abierto(t)).length }, { id: 'todos', label: 'Todos' }]} />
          {admin && (
            <div className="grid gap-2 sm:grid-cols-3 lg:w-[34rem]">
              <Select aria-label="Cliente" value={fEmp} onChange={(e) => setFEmp(e.target.value)}><option value="todas">Todos los clientes</option>{s.empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select>
              <Select aria-label="Prioridad" value={fPri} onChange={(e) => setFPri(e.target.value)}><option value="todas">Toda prioridad</option>{(['Urgente', 'Alta', 'Normal', 'Baja'] as Prioridad[]).map((p) => <option key={p}>{p}</option>)}</Select>
              <Select aria-label="Estado" value={fEst} onChange={(e) => setFEst(e.target.value)}><option value="todos">Todo estado</option>{(['Nuevo', 'Clasificado', 'En progreso', 'Esperando al cliente', 'Resuelto', 'Cerrado'] as TicketEstado[]).map((p) => <option key={p}>{p}</option>)}</Select>
            </div>
          )}
        </div>
        {lista.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No hay tickets con estos filtros.</Card>
        ) : (
          <ul className="space-y-3">
            {lista.map((t) => (
              <li key={t.id}>
                <Enlace to={detalle(t)} className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-surface-2 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{t.id} · {t.tipo}{admin ? ` · ${nombreEmpresa(t.empresaId)}` : ''}</p>
                      <h3 className="mt-0.5 font-display text-base font-semibold">{t.titulo}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2"><PrioridadBadge p={t.prioridad} /><TicketBadge estado={t.estado} />{t.fueraDePlan && <Badge variant="danger">Fuera de plan</Badge>}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>Creado por {t.creadoPor} · {fecha(t.fecha)}</span>
                    {admin && abierto(t) && <Semaforo totalH={t.respuesta.totalH} restanteH={t.respuesta.restanteH} />}
                    {t.calificacion && <span className="inline-flex items-center gap-1 text-warning"><Star className="size-3.5 fill-current" aria-hidden />{t.calificacion}/5</span>}
                  </div>
                </Enlace>
              </li>
            ))}
          </ul>
        )}
      </Pantalla>
    </>
  );
}

export function TicketNuevo() {
  const s = useStore();
  const [tipo, setTipo] = React.useState<TicketTipo>('Error');
  const [pri, setPri] = React.useState<Prioridad>('Normal');
  const [titulo, setTitulo] = React.useState('');
  const [texto, setTexto] = React.useState('');
  const [proy, setProy] = React.useState(s.empresa.proyectos[0]?.nombre ?? '');
  const [adj, setAdj] = React.useState<string[]>([]);
  const [intento, setIntento] = React.useState(false);
  const mant = s.empresa.mantenimiento;
  const enviar = (e: React.FormEvent) => {
    e.preventDefault(); setIntento(true);
    if (titulo.trim().length < 4 || texto.trim().length < 10) return;
    const num = String(Math.max(0, ...s.empresas.flatMap((x) => x.tickets).map((t) => +t.id.slice(2))) + 1).padStart(4, '0');
    const id = 'T-' + num;
    s.mutar(s.empresa.id, (x) => {
      x.tickets.unshift({
        id, titulo, tipo, propuesta: pri, prioridad: pri, estado: 'Nuevo', creadoPor: s.usuario?.cargo ?? 'Administrador', creadorId: s.usuario?.id ?? '', fecha: '2026-11-20', proyecto: proy, empresaId: x.id,
        respuesta: { totalH: pri === 'Urgente' ? 2 : pri === 'Alta' ? 8 : pri === 'Normal' ? 16 : 0, restanteH: pri === 'Baja' ? null : pri === 'Urgente' ? 2 : pri === 'Alta' ? 8 : 16 },
        mensajes: [{ de: 'cliente', quien: s.usuario?.cargo ?? 'Administrador', texto, cuando: '2026-11-20 10:30', adjuntos: adj }],
        ...(tipo === 'Solicitud de cambio' ? { cambio: { valor: 0, decision: 'pendiente' as const } } : {}),
      });
    }, `Creó el ticket ${id}`);
    s.avisar(`Ticket ${id} creado. Te responderemos dentro del tiempo pactado.`);
    ir(`/cliente/tickets/${id}`);
  };
  return (
    <>
      <PageHeader titulo="Nuevo ticket" descripcion="Cuéntanos qué necesitas. Mientras más claro, más rápido te respondemos." acciones={<Button variant="ghost" asChild><Enlace to="/cliente/tickets"><ArrowLeft />Volver</Enlace></Button>} />
      <Pantalla vacio={{ titulo: 'No se puede crear ahora', texto: 'Intenta de nuevo en unos minutos.' }}>
        <form onSubmit={enviar} className="max-w-3xl space-y-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">¿Qué tipo de ticket es?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {TIPOS.map((t) => (
                <label key={t.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors', tipo === t.id ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:bg-surface-2')}>
                  <input type="radio" name="tipo" className="sr-only" checked={tipo === t.id} onChange={() => setTipo(t.id)} />
                  <span className={tipo === t.id ? 'text-primary-text' : 'text-muted-foreground'}>{t.icono}</span>
                  <span><span className="block font-medium">{t.id}</span><span className="text-sm text-muted-foreground">{t.texto}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {tipo === 'Acceso' && <Alert variant="warning" title="Cuidado con las claves">{AVISO_ACCESO}</Alert>}
          {tipo === 'Solicitud de cambio' && <Alert variant="info" title="Las solicitudes de cambio se cotizan">No se trabajan hasta que Websourcing las cotice y, si tienen costo, tu administrador las acepte.</Alert>}
          {tipo === 'Error' && !mant.activo && <Alert variant="info">Si tu garantía ya terminó, el equipo te dirá si el arreglo tiene costo antes de empezar.</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Proyecto" htmlFor="t-proy"><Select id="t-proy" value={proy} onChange={(e) => setProy(e.target.value)}>{s.empresa.proyectos.map((p) => <option key={p.id}>{p.nombre}</option>)}</Select></Field>
            <Field label="Prioridad" htmlFor="t-pri" hint="Tú propones; Websourcing la confirma al clasificar.">
              <Select id="t-pri" value={pri} onChange={(e) => setPri(e.target.value as Prioridad)}>
                <option value="Urgente">Urgente · la app está caída o no se puede vender o cobrar</option>
                <option value="Alta">Alta · algo importante falla, pero se puede seguir</option>
                <option value="Normal">Normal · errores menores y preguntas</option>
                <option value="Baja">Baja · ideas y mejoras</option>
              </Select>
            </Field>
          </div>
          <Field label="Título" htmlFor="t-titulo" error={intento && titulo.trim().length < 4 ? 'Escribe un título corto.' : undefined}><Input id="t-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ejemplo: no me llega el correo de confirmación" /></Field>
          <Field label="Detalle" htmlFor="t-texto" error={intento && texto.trim().length < 10 ? 'Cuéntanos un poco más (qué pasó, dónde y cuándo).' : undefined}><Textarea id="t-texto" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué pasó? ¿Qué esperabas que pasara?" /></Field>
          <Field label="Adjuntos (opcional)" htmlFor="t-adj" hint="Pantallazo, video o audio. Máximo 50 MB por archivo.">
            <label className="flex min-h-12 cursor-pointer flex-wrap items-center gap-2 rounded border border-dashed border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <Paperclip className="size-4" />{adj.length ? adj.join(', ') : 'Elegir archivos'}
              <input id="t-adj" type="file" multiple accept="image/*,video/*,audio/*,.pdf" className="sr-only" onChange={(e) => setAdj(Array.from(e.target.files ?? []).map((f) => f.name))} />
            </label>
          </Field>
          <div className="flex flex-wrap gap-3"><Button type="submit" size="lg"><Send />Crear ticket</Button><Button type="button" variant="ghost" size="lg" asChild><Enlace to="/cliente/tickets">Cancelar</Enlace></Button></div>
        </form>
      </Pantalla>
    </>
  );
}

export function TicketDetalle({ id, modo }: { id: string; modo: 'cliente' | 'admin' }) {
  const s = useStore();
  const admin = modo === 'admin';
  const origen = admin ? s.empresas : [s.empresa];
  const ticket = origen.flatMap((e) => e.tickets).find((t) => t.id === id);
  const [msg, setMsg] = React.useState('');
  const [area, setArea] = React.useState<Area>('Desarrollo');
  const [interno, setInterno] = React.useState(false);
  const [horas, setHoras] = React.useState('');
  const [valor, setValor] = React.useState('450000');
  if (!ticket) return <><PageHeader titulo="Ticket no encontrado" /><SinPermiso texto="Este ticket no existe o no es de tu empresa." /></>;
  if (!admin && !s.can.verTodosTickets && ticket.creadorId !== s.usuario?.id) return <><PageHeader titulo="Ticket" /><SinPermiso texto="Solo ves los tickets que creaste. Si necesitas ver todos, pídeselo a tu administrador." /></>;
  const empresaId = ticket.empresaId;
  const empresa = s.empresas.find((e) => e.id === empresaId)!;
  const cambiar = (fn: (t: Ticket) => void, registro: string) => s.mutar(empresaId, (e) => fn(e.tickets.find((t) => t.id === id)!), registro);
  const lectura = s.can.soloLectura;

  const responder = () => {
    if (!msg.trim()) return;
    cambiar((t) => {
      t.mensajes.push(admin ? { de: interno ? 'nota' : 'websourcing', quien: interno ? 'Nota interna' : `Equipo Websourcing · ${area}`, texto: msg, cuando: '2026-11-20 10:30' } : { de: 'cliente', quien: s.usuario?.cargo ?? 'Administrador', texto: msg, cuando: '2026-11-20 10:30' });
      if (admin && !interno) { t.respuesta.restanteH = null; if (t.estado === 'Nuevo' || t.estado === 'Clasificado') t.estado = 'En progreso'; }
      if (!admin && t.estado === 'Esperando al cliente') t.estado = 'En progreso';
    }, `Respondió el ticket ${id}`);
    setMsg('');
    s.avisar(interno ? 'Nota interna guardada (el cliente no la ve).' : 'Mensaje enviado.');
  };
  const ocultarInterno = (m: { de: string }) => !(m.de === 'nota' && !admin);
  const mensajes = ticket.mensajes.filter(ocultarInterno);
  const cerrado = ticket.estado === 'Cerrado';

  return (
    <>
      <PageHeader eyebrow={`${ticket.id} · ${ticket.tipo}${admin ? ' · ' + empresa.nombre : ''}`} titulo={ticket.titulo}
        acciones={<Button variant="ghost" asChild><Enlace to={admin ? '/admin/tickets' : '/cliente/tickets'}><ArrowLeft />Volver</Enlace></Button>} />
      <Pantalla vacio={{ titulo: 'Sin mensajes', texto: 'Este ticket todavía no tiene mensajes.' }}>
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-4">
            {ticket.tipo === 'Acceso' && <Alert variant="warning" title="No escribas claves aquí">{AVISO_ACCESO}</Alert>}
            {ticket.estado === 'Resuelto' && !admin && (
              <Alert variant="success" title="Marcamos este ticket como resuelto" action={<div className="flex flex-wrap gap-2"><Button size="sm" disabled={lectura} onClick={() => { cambiar((t) => { t.estado = 'Cerrado'; }, `Confirmó el ticket ${id}`); s.avisar('Gracias por confirmar. Ya puedes calificar la atención.'); }}><ThumbsUp />Confirmo</Button><Button size="sm" variant="outline" disabled={lectura} onClick={() => cambiar((t) => { t.estado = 'En progreso'; }, `Reabrió el ticket ${id}`)}>Aún no</Button></div>}>
                Revisa lo que hicimos. Si no respondes en 3 días, se cierra solo.
              </Alert>
            )}
            {ticket.cambio && (
              <Card className="border-info/50">
                <CardHeader><CardTitle>Cotización de la solicitud de cambio</CardTitle></CardHeader>
                <CardContent>
                  {ticket.cambio.decision === 'pendiente' && <p className="text-sm text-muted-foreground">El dueño de Websourcing decide si se cobra, se regala o se rechaza. Hasta entonces no se programa.</p>}
                  {ticket.cambio.decision === 'cobrar' && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="font-display text-2xl font-semibold">{s.can.verDinero ? cop(ticket.cambio.valor) : 'Valor oculto'}</p><p className="text-xs text-muted-foreground">Valor de ejemplo · {ticket.cambio.aceptada ? 'Aceptada por el administrador' : 'Falta tu aceptación'}</p></div>
                      {!ticket.cambio.aceptada && (s.can.esAdmin && !admin && !lectura ? <Button onClick={() => { cambiar((t) => { t.cambio!.aceptada = true; t.estado = 'En progreso'; }, `Aceptó la cotización del ticket ${id}`); s.avisar('Cotización aceptada. Queda registrado quién, cuándo y desde dónde.'); }}>Acepto la cotización</Button> : <Badge variant="warning">Solo la acepta el administrador</Badge>)}
                    </div>
                  )}
                  {ticket.cambio.decision === 'regalar' && <p className="text-sm">Sin costo para ti. Lo programamos.</p>}
                  {ticket.cambio.decision === 'rechazar' && <p className="text-sm">No se puede hacer dentro de este proyecto.</p>}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle>Conversación</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {mensajes.map((m, i) => (
                    <li key={i} className={cn('flex', m.de === 'cliente' ? (admin ? 'justify-start' : 'justify-end') : admin && m.de === 'websourcing' ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[92%] rounded-lg border p-4 sm:max-w-[80%]', m.de === 'nota' ? 'border-dashed border-warning/60 bg-warning/10' : m.de === 'websourcing' ? 'border-primary/40 bg-primary/10' : 'border-border bg-surface-2')}>
                        <p className={cn('text-xs font-semibold', m.de === 'websourcing' ? 'text-primary-text' : m.de === 'nota' ? 'text-warning' : 'text-muted-foreground')}>{m.de === 'nota' && <StickyNote className="mr-1 inline size-3.5" aria-hidden />}{m.quien}</p>
                        <p className="mt-1.5 whitespace-pre-line text-sm">{m.texto}</p>
                        {m.adjuntos && m.adjuntos.length > 0 && <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{m.adjuntos.map((a) => <span key={a} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5"><Paperclip className="size-3" aria-hidden />{a}</span>)}</p>}
                        <p className="mt-2 text-[11px] text-muted-foreground">{fechaHora(m.cuando)}{m.de === 'nota' ? ' · solo lo ve Websourcing' : ''}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
              {!cerrado && (
                <div className="border-t border-border p-4 sm:p-6">
                  {admin && (
                    <div className="mb-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Responde el área" htmlFor="tk-area"><Select id="tk-area" value={area} onChange={(e) => setArea(e.target.value as Area)} disabled={interno}>{AREAS.map((a) => <option key={a}>{a}</option>)}</Select></Field>
                      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} className="size-4 accent-[rgb(var(--primary))]" />Nota interna (el cliente no la ve)</label>
                    </div>
                  )}
                  <Field label={admin ? `Firmará: ${interno ? 'Nota interna' : 'Equipo Websourcing · ' + area}` : 'Escribe tu respuesta'} htmlFor="tk-msg"><Textarea id="tk-msg" value={msg} onChange={(e) => setMsg(e.target.value)} disabled={lectura} placeholder="Escribe aquí…" /></Field>
                  <div className="mt-3"><Button onClick={responder} disabled={lectura || !msg.trim()}><Send />Enviar</Button></div>
                </div>
              )}
            </Card>
            {cerrado && !admin && (
              <Card><CardContent className="pt-6">
                <p className="font-medium">{ticket.calificacion ? 'Gracias por calificar la atención' : '¿Cómo te atendimos?'}</p>
                <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Calificación de 1 a 5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} disabled={!!ticket.calificacion || lectura} onClick={() => { cambiar((t) => { t.calificacion = n; }, `Calificó el ticket ${id} con ${n}`); s.avisar('Gracias por calificar.'); }} aria-label={`${n} de 5`} className="rounded p-1 disabled:cursor-default">
                      <Star className={cn('size-8', (ticket.calificacion ?? 0) >= n ? 'fill-warning text-warning' : 'text-muted-foreground')} />
                    </button>
                  ))}
                </div>
              </CardContent></Card>
            )}
          </div>
          <aside className="space-y-4">
            <Card><CardContent className="space-y-3 pt-6 text-sm">
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Estado</span><TicketBadge estado={ticket.estado} /></div>
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Prioridad</span><PrioridadBadge p={ticket.prioridad} /></div>
              {ticket.propuesta !== ticket.prioridad && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Propuesta</span><span>{ticket.propuesta}</span></div>}
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Creado por</span><span>{ticket.creadoPor}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Fecha</span><span>{fecha(ticket.fecha)}</span></div>
              {ticket.proyecto && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Proyecto</span><span className="text-right">{ticket.proyecto}</span></div>}
              {admin && <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Respuesta</span><Semaforo totalH={ticket.respuesta.totalH} restanteH={ticket.respuesta.restanteH} /></div>}
              {ticket.fueraDePlan && <Badge variant="danger"><AlertTriangle className="size-3.5" />Fuera de plan</Badge>}
            </CardContent></Card>
            {admin && (
              <Card>
                <CardHeader><CardTitle className="text-base">Gestión (Websourcing)</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Estado" htmlFor="g-estado"><Select id="g-estado" value={ticket.estado} onChange={(e) => cambiar((t) => { t.estado = e.target.value as TicketEstado; }, `Cambió el estado del ticket ${id}`)}>{(['Nuevo', 'Clasificado', 'En progreso', 'Esperando al cliente', 'Resuelto', 'Cerrado'] as TicketEstado[]).map((x) => <option key={x}>{x}</option>)}</Select></Field>
                  <Field label="Confirmar prioridad" htmlFor="g-pri"><Select id="g-pri" value={ticket.prioridad} onChange={(e) => cambiar((t) => { t.prioridad = e.target.value as Prioridad; }, `Confirmó la prioridad del ticket ${id}`)}>{(['Urgente', 'Alta', 'Normal', 'Baja'] as Prioridad[]).map((x) => <option key={x}>{x}</option>)}</Select></Field>
                  <Field label="Horas trabajadas" htmlFor="g-horas" hint="Se anotan a mano y el dueño las revisa antes de descontarlas de la bolsa."><div className="flex gap-2"><Input id="g-horas" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder={ticket.horas ? String(ticket.horas) : '0,5'} /><Button variant="secondary" onClick={() => { const n = parseFloat(horas.replace(',', '.')); if (n > 0) { cambiar((t) => { t.horas = n; }, `Anotó ${n} h en el ticket ${id}`); s.mutar(empresaId, (e) => e.mantenimiento.horasRegistradas.unshift({ ticket: id, horas: n, estado: 'pendiente_dueno', fecha: '2026-11-20' })); s.avisar('Horas anotadas. Quedan pendientes de tu revisión.'); setHoras(''); } }}>Anotar</Button></div></Field>
                  <Field label="Marcar" htmlFor="g-fuera"><Button variant="outline" className="w-full" onClick={() => cambiar((t) => { t.fueraDePlan = !t.fueraDePlan; }, `Cambió "fuera de plan" en ${id}`)}>{ticket.fueraDePlan ? 'Quitar "fuera de plan"' : 'Marcar como "fuera de plan"'}</Button></Field>
                  {ticket.cambio && (
                    <div className="space-y-3 border-t border-border pt-4">
                      <p className="text-sm font-medium">Solicitud de cambio: decide el dueño</p>
                      <Field label="Valor de la mini cotización (COP, ejemplo)" htmlFor="g-valor"><Input id="g-valor" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))} /></Field>
                      <div className="grid grid-cols-3 gap-2">
                        {(['cobrar', 'regalar', 'rechazar'] as const).map((d) => <Button key={d} size="sm" variant={ticket.cambio!.decision === d ? 'default' : 'outline'} onClick={() => { cambiar((t) => { t.cambio!.decision = d; t.cambio!.valor = d === 'cobrar' ? +valor || 0 : 0; t.estado = d === 'cobrar' ? 'Esperando al cliente' : d === 'regalar' ? 'En progreso' : 'Cerrado'; }, `Decidió "${d}" en la solicitud ${id}`); s.avisar(`Decisión guardada: ${d}.`); }} className="capitalize">{d}</Button>)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </Pantalla>
    </>
  );
}
