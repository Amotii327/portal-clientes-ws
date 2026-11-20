import type { EstadoHito, EstadoProyecto, EstadoSprint, Json, TipoHistorial } from '@/lib/supabase/database.types';
import { codigoDeError, mensajeDeError } from '@/lib/portal/errores';
import { anotarRechazoServidor } from '@/lib/servidor/rechazos';
import { fecha } from '@/lib/utils';

export const ESTADO_HITO: Record<EstadoHito, string> = { pendiente: 'Pendiente', en_curso: 'En curso', esperando_aprobacion: 'Esperando aprobación', terminado: 'Terminado' };
export const ESTADO_SPRINT: Record<EstadoSprint, string> = { propuesto: 'Propuesto', aprobado: 'Aprobado', en_curso: 'En curso', en_revision: 'En revisión', terminado: 'Terminado' };
export const ESTADO_PROYECTO: Record<EstadoProyecto, string> = { activo: 'Activo', pausado: 'Pausado', terminado: 'Terminado', cancelado: 'Cancelado' };
export const PAGOS_HITO = ['Anticipo', 'Segundo pago', 'Saldo final', 'Cuota mensual'];

/**
 * Ejecuta una función de la base. Si responde con error, devuelve el mensaje para la persona y, desde el servidor,
 * deja anotado el intento rechazado (M-7). El nombre es el de la función en la base, por ejemplo "editar_hito".
 */
export async function correr<T>(nombre: string, p: PromiseLike<{ data: T | null; error: { message?: string } | null }>) {
  const r = await p;
  if (r.error) {
    void anotarRechazoServidor(nombre, codigoDeError(r.error) ?? 'error_desconocido');
    return { data: null as T | null, error: r.error, mensaje: mensajeDeError(r.error) };
  }
  return { data: r.data, error: null, mensaje: '' };
}

const d = (j: Json, k: string): string => {
  const v = j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, Json | undefined>)[k] : undefined;
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
};
const hito = (j: Json) => { const n = d(j, 'numero'); const nombre = d(j, 'nombre'); return n || nombre ? `hito ${n}${nombre ? ` · ${nombre}` : ''}` : 'un hito'; };
const estadoTxt = (v: string) => (ESTADO_HITO as Record<string, string>)[v] ?? (ESTADO_SPRINT as Record<string, string>)[v] ?? (ESTADO_PROYECTO as Record<string, string>)[v] ?? v;

/** Frase del historial para el cliente y el super admin. Siempre firmada por áreas, nunca por personas. */
export function textoHistorial(tipo: TipoHistorial, j: Json): string {
  const motivo = d(j, 'motivo');
  const m = motivo ? ` Motivo: ${motivo}.` : '';
  switch (tipo) {
    case 'proyecto_creado': return 'Se creó el proyecto con sus 13 hitos.';
    case 'proyecto_estado_cambiado': return `El proyecto pasó a ${estadoTxt(d(j, 'estado') || d(j, 'nuevo') || d(j, 'estado_nuevo')).toLowerCase() || 'otro estado'}.`;
    case 'hito_estado_cambiado': return `El ${hito(j)} cambió a "${estadoTxt(d(j, 'estado') || d(j, 'nuevo') || d(j, 'estado_nuevo'))}".`;
    case 'hito_fecha_fijada': return `Se fijó la fecha del ${hito(j)}${d(j, 'fecha') ? `: ${fecha(d(j, 'fecha'))}` : ''}.`;
    case 'retraso_registrado': return `Cambió la fecha del ${hito(j)}${d(j, 'lado') ? ` (${d(j, 'lado') === 'cliente' ? 'esperando al cliente' : 'por Websourcing'})` : ''}.${m}`;
    case 'plan_sprints_aprobado': return 'Se publicó el plan de sprints.';
    case 'plan_sprints_modificado': return `Se modificó el plan de sprints.${m}`;
    case 'sprint_estado_cambiado': return `El sprint ${d(j, 'numero')} pasó a "${estadoTxt(d(j, 'estado') || d(j, 'nuevo') || d(j, 'estado_nuevo'))}".`;
    default: return 'Hubo un cambio en el proyecto.';
  }
}

export const LADO: Record<'websourcing' | 'cliente', string> = { websourcing: 'Por Websourcing', cliente: 'Esperando al cliente' };
/** Los hitos o sprints atrasados se cuentan en singular o plural. */
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
