import { crearClienteNavegador } from '@/lib/supabase/client';
import type { IncluyePlan, PlanBase, PlanMantenimientoFila, PrioridadTicket } from '@/lib/supabase/tipos-tickets-mant';
import { TIEMPOS_POR_DEFECTO } from '@/lib/data';
import { PRIORIDAD_TXT } from '../tickets/comunes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const desde = (tabla: string) => (crearClienteNavegador() as unknown as { from: (t: string) => any }).from(tabla);
export type Lista<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
export const leer = async <T,>(p: Lista<T>): Promise<T[]> => {
  const r = await p;
  if (r.error) throw new Error('lectura_fallida');
  return r.data ?? [];
};

export const PLAN_TXT: Record<PlanBase, string> = { basico: 'Básico', estandar: 'Estándar', premium: 'Premium', personalizado: 'A la medida' };
export const INCLUYE_TXT: Record<IncluyePlan, string> = {
  correccion_errores: 'Corrección de errores', copias_seguridad: 'Copias de seguridad', monitoreo: 'Monitoreo',
  actualizaciones_seguridad: 'Actualizaciones de seguridad', auditoria_trimestral: 'Auditoría trimestral', pequenos_ajustes: 'Pequeños ajustes',
};
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const COPIAS_TXT = { diaria: 'Diarias', semanal: 'Semanales', mensual: 'Mensuales', ninguna: 'Sin copias' } as const;
export const PARCHES_TXT = { semanal: 'Semanales', quincenal: 'Cada 15 días', mensual: 'Mensuales', trimestral: 'Trimestrales', ninguna: 'Sin parches' } as const;
export const REPORTE_TXT = { ninguno: 'Sin reporte', resumido: 'Resumido', detallado: 'Detallado' } as const;
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;

export const hhmm = (t: string) => t.slice(0, 5);
/** "Lunes a viernes", "Lunes, miércoles y viernes" */
export function diasTexto(d: number[]) {
  const s = [...d].sort((a, b) => a - b);
  if (s.length === 1) return DIAS[s[0] - 1];
  const seguidos = s.every((x, i) => i === 0 || x === s[i - 1] + 1);
  if (seguidos && s.length > 2) return `${DIAS[s[0] - 1]} a ${DIAS[s[s.length - 1] - 1].toLowerCase()}`;
  const n = s.map((x) => DIAS[x - 1]);
  return n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1].toLowerCase();
}

export const TIEMPO_ORDEN: PrioridadTicket[] = ['urgente', 'alta', 'normal', 'baja'];
/** Texto del tiempo de primera respuesta de una prioridad según el plan (o el general si el plan no lo cambia). */
export function tiempoTexto(plan: Pick<PlanMantenimientoFila, 'tiempos_respuesta'>, k: PrioridadTicket): string {
  const t = (plan.tiempos_respuesta ?? {}) as Record<string, unknown>;
  const v = t[k];
  if (v === 'siguiente_planeacion') return 'Siguiente planeación';
  if (v && typeof v === 'object') {
    const o = v as { horas_habiles?: number; dias_habiles?: number };
    if (o.horas_habiles !== undefined) return `${String(o.horas_habiles).replace('.', ',')} ${o.horas_habiles === 1 ? 'hora hábil' : 'horas hábiles'}`;
    if (o.dias_habiles !== undefined) return `${o.dias_habiles} ${o.dias_habiles === 1 ? 'día hábil' : 'días hábiles'}`;
  }
  return TIEMPOS_POR_DEFECTO[PRIORIDAD_TXT[k]];
}
