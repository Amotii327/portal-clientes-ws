import { crearClienteNavegador } from '@/lib/supabase/client';
import { adjuntosDeTicket, listarTickets, mensajesDeTicket, semaforoDeTickets } from '@/lib/portal/acciones-tickets';
import type { TicketAdjuntoFila, TicketFila, TicketMensajeFila, TicketSemaforoFila, HoraRegistradaFila } from '@/lib/supabase/tipos-tickets-mant';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const desde = (tabla: string) => (crearClienteNavegador() as unknown as { from: (t: string) => any }).from(tabla);
type Lista<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error('lectura_fallida');
  return (r.data ?? ([] as unknown)) as T;
};
/** Lecturas que fallan por nombre de columna o permiso no deben tumbar la pantalla: se devuelve lista vacía. */
const suave = async <T,>(p: Lista<T>): Promise<T[]> => { try { const r = await p; return r.data ?? []; } catch { return []; } };

export interface DatosLista {
  tickets: TicketFila[];
  semaforo: Map<string, TicketSemaforoFila>;
  empresas: Map<string, string>;
  personas: Map<string, string>;
}

/** Lista de tickets con su semáforo. La base decide cuáles llegan (RLS): el cliente recibe solo los suyos. */
export async function leerLista(admin: boolean): Promise<DatosLista> {
  const c = crearClienteNavegador();
  const [t, s] = await Promise.all([listarTickets(c), semaforoDeTickets(c)]);
  const tickets = ok(t); const sem = ok(s);
  const [emp, per] = await Promise.all([
    suave<{ id: string; nombre: string }>(desde('empresas').select('id, nombre')),
    suave<{ user_id: string; perfiles: { nombre: string } | null }>(desde('miembros').select('user_id, perfiles(nombre)')),
  ]);
  void admin;
  return {
    tickets,
    semaforo: new Map(sem.map((x) => [x.ticket_id, x])),
    empresas: new Map(emp.map((e) => [e.id, e.nombre])),
    personas: new Map(per.filter((p) => p.perfiles?.nombre).map((p) => [p.user_id, p.perfiles!.nombre])),
  };
}

export interface DatosDetalle {
  ticket: TicketFila | null;
  mensajes: TicketMensajeFila[];
  adjuntos: TicketAdjuntoFila[];
  semaforo: TicketSemaforoFila | undefined;
  empresa: string;
  creador: string;
  proyecto: string;
  horas: HoraRegistradaFila[];
}

export async function leerDetalle(id: string, esSuper: boolean): Promise<DatosDetalle> {
  const c = crearClienteNavegador();
  const t = ok<TicketFila[]>(await (desde('tickets').select('*').eq('id', id) as Lista<TicketFila>));
  const ticket = t[0] ?? null;
  if (!ticket) return { ticket: null, mensajes: [], adjuntos: [], semaforo: undefined, empresa: '', creador: '', proyecto: '', horas: [] };
  const [m, a, s, emp, per, pro, hor] = await Promise.all([
    mensajesDeTicket(c, id), adjuntosDeTicket(c, id), semaforoDeTickets(c),
    suave<{ nombre: string }>(desde('empresas').select('nombre').eq('id', ticket.empresa_id)),
    suave<{ perfiles: { nombre: string } | null }>(desde('miembros').select('perfiles(nombre)').eq('user_id', ticket.creado_por)),
    ticket.proyecto_id ? suave<{ nombre: string }>(desde('proyectos').select('nombre').eq('id', ticket.proyecto_id)) : Promise.resolve([]),
    esSuper ? suave<HoraRegistradaFila>(desde('horas_registradas').select('*').eq('ticket_id', id).order('registrado_en', { ascending: false })) : Promise.resolve([] as HoraRegistradaFila[]),
  ]);
  return {
    ticket, mensajes: ok(m), adjuntos: ok(a),
    semaforo: ok(s).find((x) => x.ticket_id === id),
    empresa: emp[0]?.nombre ?? '', creador: per[0]?.perfiles?.nombre ?? '', proyecto: pro[0]?.nombre ?? '', horas: hor,
  };
}

export async function leerProyectos(): Promise<{ id: string; nombre: string }[]> {
  return suave<{ id: string; nombre: string }>(desde('proyectos').select('id, nombre').order('nombre'));
}
