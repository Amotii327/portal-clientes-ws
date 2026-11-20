'use client';
import * as React from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { anotarHorasTicket } from '@/lib/portal/acciones-mantenimiento';
import { cambiarEstadoTicket, clasificarTicket, decidirTicket, marcarSolicitudCambio } from '@/lib/portal/acciones-tickets';
import { useStore } from '@/lib/store';
import { fecha } from '@/lib/utils';
import type { EstadoTicket, HoraRegistradaFila, Moneda, PrioridadTicket, TicketFila, TipoTicket } from '@/lib/supabase/tipos-tickets-mant';
import { Confirmar } from '../invitar';
import { ESTADO_TXT, PRIORIDAD_TXT, TIPO_TXT, dinero, ejecutar, horas, hoyISO, prioridadDe, requiereDecision } from './comunes';

const ESTADOS_ELEGIBLES: EstadoTicket[] = ['en_progreso', 'esperando_cliente', 'resuelto', 'cerrado'];
const ESTADO_HORA: Record<HoraRegistradaFila['estado'], [string, 'warning' | 'success' | 'danger' | 'info']> = {
  pendiente_dueno: ['Por revisar', 'warning'], aprobada: ['Aprobada', 'success'], rechazada: ['Rechazada', 'danger'],
  extra_pendiente_cliente: ['Extra: espera al cliente', 'info'], extra_aprobada: ['Extra aprobada', 'success'], extra_rechazada: ['Extra rechazada', 'danger'],
};

/** Panel de gestión de Websourcing (solo super admin). Cada botón llama a una función de la base; ella decide si se puede. */
export function GestionTicket({ ticket, horasTicket, lectura, alCambiar }: { ticket: TicketFila; horasTicket: HoraRegistradaFila[]; lectura: boolean; alCambiar: () => void }) {
  const { avisar } = useStore();
  const c = () => crearClienteNavegador();
  const cerrado = ticket.estado === 'cerrado';
  const [error, setError] = React.useState<string | null>(null);
  const [pri, setPri] = React.useState<PrioridadTicket>(prioridadDe(ticket));
  const [tipo, setTipo] = React.useState<TipoTicket>(ticket.tipo);
  const [est, setEst] = React.useState<EstadoTicket>('en_progreso');
  const [resolucion, setResolucion] = React.useState('');
  const [valor, setValor] = React.useState('');
  const [moneda, setMoneda] = React.useState<Moneda>('COP');
  const [motivoDec, setMotivoDec] = React.useState('');
  const [rechazar, setRechazar] = React.useState(false);
  const [convertir, setConvertir] = React.useState(false);
  const [motivoConv, setMotivoConv] = React.useState('');
  const [hrs, setHrs] = React.useState('');
  const [fechaHrs, setFechaHrs] = React.useState(hoyISO());
  const [nota, setNota] = React.useState('');

  const hacer = async <T,>(accion: string, fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, ok: string, sensible = false) => {
    setError(null);
    const r = await ejecutar(accion, fn, sensible);
    if (!r.ok) { setError(r.mensaje); return false; }
    avisar(ok); alCambiar(); return true;
  };
  const numero = (t: string) => Number(t.replace(',', '.'));
  const decision = requiereDecision(ticket);

  return (
    <Card data-testid="gestion">
      <CardHeader><CardTitle className="text-base">Gestión (Websourcing)</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {error && <Alert variant="danger" title="No se pudo">{error}</Alert>}
        {cerrado ? <p className="text-sm text-muted-foreground">Este ticket está cerrado. Ya no se puede cambiar.</p> : (
          <>
            <div className="space-y-3">
              <p className="text-sm font-medium">{ticket.estado === 'nuevo' ? 'Clasificar' : 'Prioridad y tipo'}</p>
              <Field label="Prioridad confirmada" htmlFor="g-pri" hint={ticket.prioridad_propuesta !== pri ? `El cliente propuso: ${PRIORIDAD_TXT[ticket.prioridad_propuesta]}` : undefined}>
                <Select id="g-pri" value={pri} onChange={(e) => setPri(e.target.value as PrioridadTicket)}>{(Object.keys(PRIORIDAD_TXT) as PrioridadTicket[]).map((p) => <option key={p} value={p}>{PRIORIDAD_TXT[p]}</option>)}</Select>
              </Field>
              <Field label="Tipo" htmlFor="g-tipo"><Select id="g-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoTicket)}>{(Object.keys(TIPO_TXT) as TipoTicket[]).filter((t) => t !== 'solicitud_cambio' || ticket.tipo === 'solicitud_cambio').map((t) => <option key={t} value={t}>{TIPO_TXT[t]}</option>)}</Select></Field>
              <Button variant="secondary" className="w-full" disabled={lectura} onClick={() => void hacer('clasificar_ticket', () => clasificarTicket(c(), { p_ticket_id: ticket.id, p_prioridad: pri, p_tipo: tipo !== ticket.tipo ? tipo : null }), 'Clasificación guardada.')}>{ticket.estado === 'nuevo' ? 'Confirmar clasificación' : 'Guardar'}</Button>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-medium">Estado</p>
              <Field label="Cambiar a" htmlFor="g-estado"><Select id="g-estado" value={est} onChange={(e) => setEst(e.target.value as EstadoTicket)}>{ESTADOS_ELEGIBLES.filter((x) => x !== ticket.estado).map((x) => <option key={x} value={x}>{ESTADO_TXT[x]}</option>)}</Select></Field>
              {est === 'resuelto' && <Field label="Qué se hizo (lo ve el cliente)" htmlFor="g-res"><Textarea id="g-res" value={resolucion} onChange={(e) => setResolucion(e.target.value)} /></Field>}
              <Button variant="secondary" className="w-full" disabled={lectura} onClick={() => void hacer('cambiar_estado_ticket', () => cambiarEstadoTicket(c(), { p_ticket_id: ticket.id, p_estado: est, p_resolucion: est === 'resuelto' ? resolucion.trim() : null }), `Estado cambiado a "${ESTADO_TXT[est]}".`).then((ok) => ok && setResolucion(''))}>Cambiar estado</Button>
            </div>

            {ticket.tipo !== 'solicitud_cambio' && (
              <div className="border-t border-border pt-4">
                <Button variant="outline" className="w-full" disabled={lectura} onClick={() => setConvertir(true)}>Marcar como solicitud de cambio</Button>
              </div>
            )}
          </>
        )}

        {(ticket.tipo === 'solicitud_cambio' || ticket.fuera_de_plan) && (
          <div className="space-y-3 border-t border-border pt-4" data-testid="decision">
            <p className="text-sm font-medium">{ticket.tipo === 'solicitud_cambio' ? 'Solicitud de cambio' : 'Ticket fuera de plan'}: decide el dueño</p>
            {ticket.decision_dueno ? (
              <p className="text-sm">Decisión: <strong className="capitalize">{ticket.decision_dueno === 'regalar' ? 'regalar' : ticket.decision_dueno === 'cobrar' ? `cobrar ${ticket.cobro_valor ? dinero(ticket.cobro_valor, ticket.cobro_moneda) : ''}` : 'rechazar'}</strong>{ticket.decision_motivo ? <span className="text-muted-foreground"> · {ticket.decision_motivo}</span> : null}</p>
            ) : decision && (
              <>
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <Field label="Valor a cobrar" htmlFor="g-valor"><Input id="g-valor" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, ''))} placeholder="Solo si cobras" /></Field>
                  <Field label="Moneda" htmlFor="g-mon"><Select id="g-mon" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}><option>COP</option><option>USD</option></Select></Field>
                </div>
                <Field label="Motivo (se guarda)" htmlFor="g-motdec"><Input id="g-motdec" value={motivoDec} onChange={(e) => setMotivoDec(e.target.value)} /></Field>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" disabled={lectura} onClick={() => void hacer('decidir_ticket', () => decidirTicket(c(), { p_ticket_id: ticket.id, p_decision: 'cobrar', p_valor: Number(valor) || null, p_moneda: moneda, p_motivo: motivoDec.trim() || null }), 'Decisión guardada: cobrar. El administrador del cliente debe aceptar.', true)}>Cobrar</Button>
                  <Button size="sm" variant="outline" disabled={lectura} onClick={() => void hacer('decidir_ticket', () => decidirTicket(c(), { p_ticket_id: ticket.id, p_decision: 'regalar', p_motivo: motivoDec.trim() || null }), 'Decisión guardada: regalar.', true)}>Regalar</Button>
                  <Button size="sm" variant="destructive" disabled={lectura} onClick={() => setRechazar(true)}>Rechazar</Button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">Horas trabajadas</p>
          <p className="text-xs text-muted-foreground">Se anotan a mano y el dueño las revisa antes de descontarlas de la bolsa.{ticket.tipo === 'solicitud_cambio' ? ' En una solicitud de cambio quedan anotadas para el costo y no descuentan de la bolsa.' : ''}</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Horas" htmlFor="g-horas"><Input id="g-horas" inputMode="decimal" value={hrs} onChange={(e) => setHrs(e.target.value)} placeholder="0,5" /></Field>
            <Field label="Día" htmlFor="g-fecha"><Input id="g-fecha" type="date" max={hoyISO()} value={fechaHrs} onChange={(e) => setFechaHrs(e.target.value)} /></Field>
          </div>
          <Field label="Nota interna (el cliente no la ve)" htmlFor="g-nota"><Input id="g-nota" value={nota} onChange={(e) => setNota(e.target.value)} /></Field>
          <Button variant="secondary" className="w-full" disabled={lectura || !(numero(hrs) > 0)} onClick={() => void hacer('anotar_horas_ticket', () => anotarHorasTicket(c(), { p_ticket_id: ticket.id, p_horas: numero(hrs), p_nota: nota.trim() || null, p_fecha: fechaHrs || null }), 'Horas anotadas. Quedan pendientes de tu revisión.').then((ok) => { if (ok) { setHrs(''); setNota(''); } })}>Anotar horas</Button>
          {horasTicket.length > 0 && (
            <ul className="space-y-1.5 text-sm" aria-label="Horas de este ticket">
              {horasTicket.map((h) => { const [t, v] = ESTADO_HORA[h.estado]; return <li key={h.id} className="flex flex-wrap items-center justify-between gap-2"><span>{horas(Number(h.horas))} · {fecha(h.fecha_trabajo)}</span><span className="flex gap-1.5">{h.sin_descuento && <Badge variant="neutral">Sin descuento</Badge>}<Badge variant={v}>{t}</Badge></span></li>; })}
            </ul>
          )}
        </div>
      </CardContent>

      <Confirmar abierto={rechazar} titulo="¿Rechazar esta solicitud?" texto="Se cierra el ticket y el cliente ve el motivo." boton="Sí, rechazar" onCerrar={() => setRechazar(false)}
        onConfirmar={async () => { const ok = await hacer('decidir_ticket', () => decidirTicket(c(), { p_ticket_id: ticket.id, p_decision: 'rechazar', p_motivo: motivoDec.trim() || null }), 'Solicitud rechazada y ticket cerrado.', true); if (ok) setRechazar(false); }}>
        <Field label="Motivo (obligatorio)" htmlFor="g-motrech"><Input id="g-motrech" value={motivoDec} onChange={(e) => setMotivoDec(e.target.value)} /></Field>
      </Confirmar>
      <Confirmar abierto={convertir} tono="default" titulo="¿Marcar como solicitud de cambio?" texto="No se trabaja hasta que decidas si se cobra, se regala o se rechaza." boton="Sí, marcar" onCerrar={() => setConvertir(false)}
        onConfirmar={async () => { await hacer('marcar_solicitud_cambio', () => marcarSolicitudCambio(c(), { p_ticket_id: ticket.id, p_motivo: motivoConv.trim() || null }), 'Marcado como solicitud de cambio.'); setConvertir(false); }}>
        <Field label="Motivo (opcional)" htmlFor="g-motconv"><Input id="g-motconv" value={motivoConv} onChange={(e) => setMotivoConv(e.target.value)} /></Field>
      </Confirmar>
    </Card>
  );
}
