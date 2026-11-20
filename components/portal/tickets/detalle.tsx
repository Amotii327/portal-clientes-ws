'use client';
import * as React from 'react';
import { AlertTriangle, ArrowLeft, Send, StickyNote, ThumbsUp } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/form';
import { PrioridadBadge, TicketBadge } from '@/components/ds/badges';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, SinPermiso } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { aceptarCobroTicket, calificarTicket, confirmarResolucion, rechazarCobroTicket, responderTicket, retirarTextoMensaje } from '@/lib/portal/acciones-tickets';
import { useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import { cn, fecha, fechaHora } from '@/lib/utils';
import type { AreaEquipo, TicketAdjuntoFila, TicketMensajeFila } from '@/lib/supabase/tipos-tickets-mant';
import { usePortal } from '../contexto';
import { Confirmar } from '../invitar';
import { AdjuntoVista, CampoLinkVideo, EnlacesVideo, SelectorAdjuntos, guardarLinkVideo, subirAdjuntos } from './adjuntos';
import { AREAS, AVISO_ACCESO, ESTADO_TXT, Estrellas, MAX_ADJUNTOS, MOTIVO_FUERA_DE_PLAN, PRIORIDAD_TXT, SemaforoReal, TIPO_TXT, dinero, ejecutar, enlaceValido, estaAbierto, numeroDe, prioridadDe } from './comunes';
import { GestionTicket } from './gestion';
import { leerDetalle } from './lecturas';

/** Detalle de un ticket real: conversación, adjuntos, cobro, cierre y calificación. Websourcing además ve el panel de gestión. */
export function TicketDetalleReal({ id, modo }: { id: string; modo: 'cliente' | 'admin' }) {
  const ctx = usePortal();
  const { avisar } = useStore();
  const admin = modo === 'admin';
  const lectura = ctx.estado === 'ver_como';
  const esAdminCliente = ctx.rol === 'admin_cliente';
  const verDinero = esAdminCliente || !!ctx.permisos?.ver_dinero;
  const { estado, datos, recargar } = useCargar(() => leerDetalle(id, admin), [id, admin]);
  const [msg, setMsg] = React.useState('');
  const [area, setArea] = React.useState<AreaEquipo>('Desarrollo');
  const [interno, setInterno] = React.useState(false);
  const [archivos, setArchivos] = React.useState<File[]>([]);
  const [link, setLink] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [estrellas, setEstrellas] = React.useState(0);
  const [comentario, setComentario] = React.useState('');
  const [rechazarCobro, setRechazarCobro] = React.useState(false);
  const [aRetirar, setARetirar] = React.useState<TicketMensajeFila | null>(null);

  const volver = admin ? '/admin/tickets' : '/cliente/tickets';
  const cabecera = (titulo: string) => <PageHeader titulo={titulo} acciones={<Button variant="ghost" asChild><Enlace to={volver}><ArrowLeft />Volver</Enlace></Button>} />;
  if (estado === 'cargando') return <><PageHeader titulo="Ticket" /><EstadoCargando /></>;
  if (estado === 'error' || !datos) return <><PageHeader titulo="Ticket" /><EstadoError onReintentar={() => recargar()} /></>;
  const { ticket: t, mensajes, adjuntos, enlaces } = datos;
  // Mensaje neutro: no distingue entre "no existe" y "no es tuyo".
  if (!t) return <>{cabecera('Ticket no encontrado')}<SinPermiso texto={admin ? 'Este ticket no existe.' : 'Este ticket no existe o no es de tu empresa. Si esperabas verlo, pídele acceso al administrador.'} inicio={volver} /></>;

  const mio = t.creado_por === ctx.user_id;
  const cerrado = t.estado === 'cerrado';
  const adjDe = (mid: string | null): TicketAdjuntoFila[] => adjuntos.filter((a) => a.mensaje_id === mid);
  const cupo = Math.max(0, MAX_ADJUNTOS - adjuntos.length);

  const enviar = async () => {
    if (!msg.trim()) return;
    if (link.trim() !== '' && !enlaceValido(link.trim())) { setError('El enlace de video debe empezar por https:// y no tener espacios.'); return; }
    setEnviando(true); setError(null);
    const r = await ejecutar('responder_ticket', () => responderTicket(crearClienteNavegador(), { p_ticket_id: t.id, p_texto: msg.trim(), p_interno: admin ? interno : false, p_area: admin && !interno ? area : null }));
    if (!r.ok) { setEnviando(false); setError(r.mensaje); return; }
    let fallidos: string[] = [];
    const mid = (r.data as { mensaje_id?: string } | null)?.mensaje_id ?? null;
    if (archivos.length) fallidos = await subirAdjuntos(t.id, archivos, mid);
    if (link.trim()) { const l = await guardarLinkVideo(t.id, link, mid); if (!l.ok) fallidos.push('el link de video'); }
    setMsg(''); setArchivos([]); setLink(''); setEnviando(false);
    avisar(fallidos.length ? `Mensaje enviado, pero no pudimos subir: ${fallidos.join(', ')}.` : interno ? 'Nota interna guardada (el cliente no la ve).' : 'Mensaje enviado.');
    recargar(true);
  };
  const accion = async (nombre: string, fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, ok: string, sensible = false) => {
    setError(null);
    const r = await ejecutar(nombre, fn as never, sensible);
    if (!r.ok) { setError(r.mensaje); return; }
    avisar(ok); recargar(true);
  };

  const burbuja = (k: string, quien: 'cliente' | 'websourcing' | 'nota', titulo: string, texto: string, cuando: string, adj: TicketAdjuntoFila[], extra?: React.ReactNode) => (
    <li key={k} className={cn('flex', quien === 'cliente' ? (admin ? 'justify-start' : 'justify-end') : admin && quien === 'websourcing' ? 'justify-end' : 'justify-start')} data-testid="mensaje">
      <div className={cn('max-w-[92%] min-w-0 rounded-lg border p-4 sm:max-w-[80%]', quien === 'nota' ? 'border-dashed border-warning/60 bg-warning/10' : quien === 'websourcing' ? 'border-primary/40 bg-primary/10' : 'border-border bg-surface-2')}>
        <p className={cn('text-xs font-semibold', quien === 'websourcing' ? 'text-primary-text' : quien === 'nota' ? 'text-warning' : 'text-muted-foreground')}>{quien === 'nota' && <StickyNote className="mr-1 inline size-3.5" aria-hidden />}{titulo}</p>
        <p className="mt-1.5 whitespace-pre-line break-words text-sm">{texto}</p>
        {adj.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{adj.map((a) => <AdjuntoVista key={a.id} a={a} />)}</div>}
        <p className="mt-2 text-[11px] text-muted-foreground">{fechaHora(cuando)}{quien === 'nota' ? ' · solo lo ve Websourcing' : ''}</p>
        {extra}
      </div>
    </li>
  );

  const motivoPlan = t.motivo_fuera_de_plan ? MOTIVO_FUERA_DE_PLAN[t.motivo_fuera_de_plan] : null;
  return (
    <>
      <PageHeader eyebrow={`${numeroDe(t.numero)} · ${TIPO_TXT[t.tipo]}${admin && datos.empresa ? ' · ' + datos.empresa : ''}`} titulo={t.titulo}
        acciones={<Button variant="ghost" asChild><Enlace to={volver}><ArrowLeft />Volver</Enlace></Button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {t.tipo === 'acceso' && <Alert variant="warning" title="No escribas claves aquí">{AVISO_ACCESO}</Alert>}
          {error && <Alert variant="danger" title="No pudimos completar la acción">{error}</Alert>}

          {t.estado === 'resuelto' && !admin && (
            <Alert variant="success" title="Marcamos este ticket como resuelto"
              action={(mio || esAdminCliente) && <Button size="sm" disabled={lectura} onClick={() => void accion('confirmar_resolucion', () => confirmarResolucion(crearClienteNavegador(), t.id), 'Gracias por confirmar. Ya puedes calificar la atención.')}><ThumbsUp />Confirmo que quedó resuelto</Button>}>
              {t.resolucion ? <><strong>Qué hicimos:</strong> <span className="whitespace-pre-line">{t.resolucion}</span><br /></> : null}
              Si aún no está resuelto, escríbenos abajo. Si no respondes en 3 días, se cierra solo.
            </Alert>
          )}
          {t.estado === 'resuelto' && admin && t.resolucion && <Alert variant="info" title="Resolución enviada al cliente"><span className="whitespace-pre-line">{t.resolucion}</span></Alert>}

          {t.fuera_de_plan && (
            <Alert variant="warning" title="Este ticket está fuera de plan">
              {admin ? 'Decide si se cobra, se regala o se rechaza.' : `Porque ${motivoPlan ?? 'no está cubierto por tu plan'}. El dueño de Websourcing decide si se cobra, se regala o no se puede hacer. Hasta entonces no se trabaja.`}
            </Alert>
          )}

          {(t.tipo === 'solicitud_cambio' || t.decision_dueno) && !admin && (
            <Card className="border-info/50" data-testid="cobro">
              <CardHeader><CardTitle>{t.tipo === 'solicitud_cambio' ? 'Cotización de la solicitud de cambio' : 'Decisión sobre este ticket'}</CardTitle></CardHeader>
              <CardContent>
                {!t.decision_dueno && <p className="text-sm text-muted-foreground">El dueño de Websourcing decide si se cobra, se regala o se rechaza. Hasta entonces no se programa.</p>}
                {t.decision_dueno === 'cobrar' && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-display text-2xl font-semibold">{verDinero && t.cobro_valor ? dinero(t.cobro_valor, t.cobro_moneda) : 'Valor oculto'}</p>
                      <p className="text-xs text-muted-foreground">{t.cobro_aceptado_en ? `Aceptado el ${fecha(t.cobro_aceptado_en)}` : t.cobro_rechazado_en ? `Rechazado el ${fecha(t.cobro_rechazado_en)}` : 'Falta la aceptación del administrador de tu empresa'}</p>
                      {t.decision_motivo && <p className="mt-1 text-sm text-muted-foreground">{t.decision_motivo}</p>}
                    </div>
                    {!t.cobro_aceptado_en && !t.cobro_rechazado_en && !cerrado && (esAdminCliente
                      ? <div className="flex flex-wrap gap-2"><Button disabled={lectura} onClick={() => void accion('aceptar_cobro_ticket', () => aceptarCobroTicket(crearClienteNavegador(), t.id), 'Cobro aceptado. Queda registrado quién y cuándo.', true)}>Acepto el cobro</Button><Button variant="outline" disabled={lectura} onClick={() => setRechazarCobro(true)}>No acepto</Button></div>
                      : <Badge variant="warning">Solo lo acepta el administrador</Badge>)}
                  </div>
                )}
                {t.decision_dueno === 'regalar' && <p className="text-sm">Sin costo para ti. Lo programamos.{t.decision_motivo ? ` ${t.decision_motivo}` : ''}</p>}
                {t.decision_dueno === 'rechazar' && <p className="text-sm">No se puede hacer dentro de este proyecto.{t.decision_motivo ? ` ${t.decision_motivo}` : ''}</p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Conversación</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-4" aria-label="Mensajes">
                {burbuja('inicio', 'cliente', datos.creador ? (mio ? `${datos.creador} (tú)` : datos.creador) : 'Cliente', t.detalle, t.creado_en, adjDe(null))}
                {mensajes.map((m) => {
                  const q = m.interno ? 'nota' : m.autor_tipo;
                  const titulo = m.interno ? 'Nota interna' : m.autor_tipo === 'websourcing' ? `Equipo Websourcing${m.area ? ' · ' + m.area : ''}` : datos.creador || 'Cliente';
                  const retirar = admin && !m.retirado_en ? <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" disabled={lectura} onClick={() => setARetirar(m)}>Retirar texto</Button> : null;
                  return burbuja(m.id, q, titulo, m.retirado_en ? 'Texto retirado por Websourcing.' : m.texto, m.creado_en, adjDe(m.id), retirar);
                })}
              </ul>
              <EnlacesVideo enlaces={enlaces} />
            </CardContent>
            {!cerrado ? (
              <div className="border-t border-border p-4 sm:p-6">
                {admin && (
                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Responde el área" htmlFor="tk-area"><Select id="tk-area" value={area} onChange={(e) => setArea(e.target.value as AreaEquipo)} disabled={interno}>{AREAS.map((a) => <option key={a}>{a}</option>)}</Select></Field>
                    <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} className="size-4 accent-[rgb(var(--primary))]" />Nota interna (el cliente no la ve)</label>
                  </div>
                )}
                <Field label={admin ? `Firmará: ${interno ? 'Nota interna' : 'Equipo Websourcing · ' + area}` : 'Escribe tu respuesta'} htmlFor="tk-msg"><Textarea id="tk-msg" value={msg} maxLength={10000} onChange={(e) => setMsg(e.target.value)} disabled={lectura} placeholder="Escribe aquí…" /></Field>
                {cupo > 0 && <div className="mt-3"><SelectorAdjuntos id="tk-adj" archivos={archivos} onCambio={setArchivos} cupo={cupo} /></div>}
                <div className="mt-3"><CampoLinkVideo id="tk-link" valor={link} onCambio={setLink} intento deshabilitado={lectura} /></div>
                <div className="mt-3"><Button onClick={() => void enviar()} disabled={lectura || enviando || !msg.trim()}><Send />{enviando ? 'Enviando…' : 'Enviar'}</Button></div>
              </div>
            ) : <p className="border-t border-border p-4 text-sm text-muted-foreground sm:px-6">Este ticket está cerrado. Si necesitas algo más, crea uno nuevo.</p>}
          </Card>

          {cerrado && !admin && (mio || esAdminCliente) && (
            <Card data-testid="calificacion"><CardContent className="pt-6">
              {t.calificacion ? (
                <><p className="font-medium">Gracias por calificar la atención</p><div className="mt-2"><Estrellas valor={t.calificacion} /></div>{t.calificacion_comentario && <p className="mt-2 text-sm text-muted-foreground">{t.calificacion_comentario}</p>}</>
              ) : (
                <>
                  <p className="font-medium">¿Cómo te atendimos?</p>
                  <div className="mt-2"><Estrellas valor={estrellas} onElegir={setEstrellas} deshabilitado={lectura} /></div>
                  <Field className="mt-3" label="Comentario (opcional)" htmlFor="cal-com"><Textarea id="cal-com" rows={2} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} /></Field>
                  <Button className="mt-3" disabled={lectura || estrellas < 1} onClick={() => void accion('calificar_ticket', () => calificarTicket(crearClienteNavegador(), { p_ticket_id: t.id, p_estrellas: estrellas, p_comentario: comentario.trim() || null }), 'Gracias por calificar.')}>Enviar calificación</Button>
                </>
              )}
            </CardContent></Card>
          )}
          {cerrado && admin && t.calificacion && <Card><CardContent className="pt-6"><p className="font-medium">Calificación del cliente</p><div className="mt-2"><Estrellas valor={t.calificacion} /></div>{t.calificacion_comentario && <p className="mt-2 text-sm text-muted-foreground">{t.calificacion_comentario}</p>}</CardContent></Card>}
        </div>

        <aside className="min-w-0 space-y-4">
          <Card><CardContent className="space-y-3 pt-6 text-sm">
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Estado</span><TicketBadge estado={ESTADO_TXT[t.estado]} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Prioridad</span><PrioridadBadge p={PRIORIDAD_TXT[prioridadDe(t)]} /></div>
            {t.prioridad && t.prioridad !== t.prioridad_propuesta && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Propuesta</span><span>{PRIORIDAD_TXT[t.prioridad_propuesta]}</span></div>}
            {datos.creador && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Creado por</span><span className="text-right">{datos.creador}</span></div>}
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Fecha</span><span>{fecha(t.creado_en)}</span></div>
            {datos.proyecto && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Proyecto</span><span className="text-right">{datos.proyecto}</span></div>}
            {estaAbierto(t) && <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Primera respuesta</span><SemaforoReal fila={datos.semaforo} /></div>}
            {t.fuera_de_plan && <Badge variant="danger"><AlertTriangle className="size-3.5" />Fuera de plan</Badge>}
          </CardContent></Card>
          {admin && <GestionTicket ticket={t} horasTicket={datos.horas} lectura={lectura} alCambiar={() => recargar(true)} />}
        </aside>
      </div>

      <Confirmar abierto={rechazarCobro} titulo="¿No aceptas el cobro?" texto="Si no lo aceptas, el ticket se cierra y no se trabaja. Podrás crear uno nuevo cuando quieras." boton="Sí, no acepto" onCerrar={() => setRechazarCobro(false)}
        onConfirmar={async () => { await accion('rechazar_cobro_ticket', () => rechazarCobroTicket(crearClienteNavegador(), t.id), 'Cobro no aceptado. El ticket se cerró.', true); setRechazarCobro(false); }} />
      <Confirmar abierto={!!aRetirar} titulo="¿Retirar el texto de este mensaje?" texto="El texto deja de verse para todos y queda constancia de que se retiró. Úsalo, por ejemplo, si alguien pegó una clave por error." boton="Sí, retirar" onCerrar={() => setARetirar(null)}
        onConfirmar={async () => { if (aRetirar) await accion('retirar_texto_mensaje', () => retirarTextoMensaje(crearClienteNavegador(), aRetirar.id), 'Texto retirado.', true); setARetirar(null); }} />
    </>
  );
}
