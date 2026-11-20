import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  BolsaAvisoFila, FuncionesTicketsMant, TicketAdjuntoFila, TicketFila, TicketMensajeFila, TicketSemaforoFila,
} from '@/lib/supabase/tipos-tickets-mant';

type Cliente = SupabaseClient<Database>;
type A<N extends keyof FuncionesTicketsMant> = FuncionesTicketsMant[N]['Args'];
type R<N extends keyof FuncionesTicketsMant> = FuncionesTicketsMant[N]['Returns'];

/**
 * Módulo 5 · Tickets. Reciben un cliente de SESIÓN DE USUARIO; la base decide quién puede (RLS).
 * Los tipos de las tablas están en lib/supabase/tipos-tickets-mant.ts (las tablas aún no están en database.types.ts),
 * por eso las lecturas pasan por `desde` con un cast. Errores: mensajeTicketsMant (./errores-tickets-mant).
 */
const rpc = <N extends keyof FuncionesTicketsMant>(c: Cliente, nombre: N, args: A<N>) =>
  (c.rpc as unknown as (n: string, a: unknown) => Promise<{ data: R<N> | null; error: { message: string } | null }>)(nombre, args);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const desde = (c: Cliente, tabla: string) => (c as unknown as { from: (t: string) => any }).from(tabla);

// ---------- Escritura ----------
export const crearTicket = (c: Cliente, a: A<'crear_ticket'>) => rpc(c, 'crear_ticket', a);
/** Cliente: solo texto. Websourcing (super admin): exige p_area, o p_interno=true para una nota interna. */
export const responderTicket = (c: Cliente, a: A<'responder_ticket'>) => rpc(c, 'responder_ticket', a);
export const retirarTextoMensaje = (c: Cliente, mensajeId: string) => rpc(c, 'retirar_texto_mensaje', { p_mensaje_id: mensajeId });
/**
 * Paso 1 de un adjunto: pide la ruta. Paso 2: sube el archivo a `bucket`/`ruta` con
 * c.storage.from('portal-tickets').upload(ruta, archivo, { upsert: false, contentType }).
 */
export const prepararAdjuntoTicket = (c: Cliente, a: A<'preparar_adjunto_ticket'>) => rpc(c, 'preparar_adjunto_ticket', a);
export const clasificarTicket = (c: Cliente, a: A<'clasificar_ticket'>) => rpc(c, 'clasificar_ticket', a);
export const cambiarEstadoTicket = (c: Cliente, a: A<'cambiar_estado_ticket'>) => rpc(c, 'cambiar_estado_ticket', a);
export const marcarSolicitudCambio = (c: Cliente, a: A<'marcar_solicitud_cambio'>) => rpc(c, 'marcar_solicitud_cambio', a);
/** Decisión del dueño (super admin) sobre un cambio o un ticket fuera de plan. "cobrar" exige p_valor. */
export const decidirTicket = (c: Cliente, a: A<'decidir_ticket'>) => rpc(c, 'decidir_ticket', a);
/** Admin del cliente: acepta o rechaza el cobro propuesto. */
export const aceptarCobroTicket = (c: Cliente, ticketId: string) => rpc(c, 'aceptar_cobro_ticket', { p_ticket_id: ticketId });
export const rechazarCobroTicket = (c: Cliente, ticketId: string) => rpc(c, 'rechazar_cobro_ticket', { p_ticket_id: ticketId });
export const confirmarResolucion = (c: Cliente, ticketId: string) => rpc(c, 'confirmar_resolucion', { p_ticket_id: ticketId });
export const calificarTicket = (c: Cliente, a: A<'calificar_ticket'>) => rpc(c, 'calificar_ticket', a);

// ---------- Lectura (RLS: el cliente solo recibe lo suyo; las notas internas no le llegan) ----------
export const listarTickets = (c: Cliente) =>
  desde(c, 'tickets').select('*').order('creado_en', { ascending: false }) as unknown as PromiseLike<{ data: TicketFila[] | null; error: { message: string } | null }>;
export const mensajesDeTicket = (c: Cliente, ticketId: string) =>
  desde(c, 'ticket_mensajes').select('*').eq('ticket_id', ticketId).order('creado_en') as unknown as PromiseLike<{ data: TicketMensajeFila[] | null; error: { message: string } | null }>;
export const adjuntosDeTicket = (c: Cliente, ticketId: string) =>
  desde(c, 'ticket_adjuntos').select('*').eq('ticket_id', ticketId).order('creado_en') as unknown as PromiseLike<{ data: TicketAdjuntoFila[] | null; error: { message: string } | null }>;
/** Vista con el semáforo y los minutos hábiles restantes de cada ticket. */
export const semaforoDeTickets = (c: Cliente) =>
  desde(c, 'tickets_semaforo').select('*') as unknown as PromiseLike<{ data: TicketSemaforoFila[] | null; error: { message: string } | null }>;
export const avisosDeBolsa = (c: Cliente) =>
  desde(c, 'bolsa_avisos').select('*').order('creado_en', { ascending: false }) as unknown as PromiseLike<{ data: BolsaAvisoFila[] | null; error: { message: string } | null }>;
