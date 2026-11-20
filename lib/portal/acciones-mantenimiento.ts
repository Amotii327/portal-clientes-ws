import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  BolsaResumenFila, FuncionesTicketsMant, GarantiaFila, HoraRegistradaFila, PlanBaseFila, PlanHistorialFila, PlanMantenimientoFila,
} from '@/lib/supabase/tipos-tickets-mant';

type Cliente = SupabaseClient<Database>;
type A<N extends keyof FuncionesTicketsMant> = FuncionesTicketsMant[N]['Args'];
type R<N extends keyof FuncionesTicketsMant> = FuncionesTicketsMant[N]['Returns'];
type Lectura<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Módulo 10 · Mantenimiento por empresa. Apagado por defecto: solo el super admin (con 2FA) lo activa.
 * Sin plan activo no hay módulo para el cliente: usar miMantenimientoActivo para mostrar u ocultar el menú.
 */
const rpc = <N extends keyof FuncionesTicketsMant>(c: Cliente, nombre: N, args: A<N>) =>
  (c.rpc as unknown as (n: string, a: unknown) => Promise<{ data: R<N> | null; error: { message: string } | null }>)(nombre, args);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const desde = (c: Cliente, tabla: string) => (c as unknown as { from: (t: string) => any }).from(tabla);

// ---------- Super admin ----------
export const activarMantenimiento = (c: Cliente, a: A<'activar_mantenimiento'>) => rpc(c, 'activar_mantenimiento', a);
export const apagarMantenimiento = (c: Cliente, empresaId: string, motivo: string) => rpc(c, 'apagar_mantenimiento', { p_empresa_id: empresaId, p_motivo: motivo });
/** p_aplicar_desde: 'proximo_mes' (por defecto) o 'hoy'. Queda en el historial con el motivo. */
export const configurarMantenimiento = (c: Cliente, a: A<'configurar_mantenimiento'>) => rpc(c, 'configurar_mantenimiento', a);
/** Horas manuales por ticket; quedan pendientes hasta que el dueño las revise. */
export const anotarHorasTicket = (c: Cliente, a: A<'anotar_horas_ticket'>) => rpc(c, 'anotar_horas_ticket', a);
export const revisarHoras = (c: Cliente, a: A<'revisar_horas'>) => rpc(c, 'revisar_horas', a);
export const planesBase = (c: Cliente) => desde(c, 'planes_base_mantenimiento').select('*') as unknown as Lectura<PlanBaseFila>;
export const registrarGarantia = (c: Cliente, a: { empresa_id: string; inicia_en: string; vence_en: string; proyecto_id?: string | null; nota?: string | null }) =>
  desde(c, 'garantias').insert(a as never);

// ---------- Admin del cliente ----------
export const decidirHorasExtra = (c: Cliente, a: A<'decidir_horas_extra'>) => rpc(c, 'decidir_horas_extra', a);
/** Pre-autoriza las horas extra de la bolsa del mes (si no, la bolsa agotada frena los tickets). */
export const autorizarHorasExtra = (c: Cliente, bolsaId: string) => rpc(c, 'autorizar_horas_extra', { p_bolsa_id: bolsaId });

// ---------- Lectura ----------
export const miMantenimientoActivo = (c: Cliente) => rpc(c, 'mi_mantenimiento_activo', {});
export const miPlanMantenimiento = (c: Cliente) => desde(c, 'planes_mantenimiento').select('*') as unknown as Lectura<PlanMantenimientoFila>;
export const historialDelPlan = (c: Cliente) => desde(c, 'planes_mantenimiento_historial').select('*').order('creado_en', { ascending: false }) as unknown as Lectura<PlanHistorialFila>;
export const resumenDeBolsas = (c: Cliente) => desde(c, 'bolsa_mensual_resumen').select('*').order('mes', { ascending: false }) as unknown as Lectura<BolsaResumenFila>;
export const horasRegistradas = (c: Cliente) => desde(c, 'horas_registradas').select('*').order('registrado_en', { ascending: false }) as unknown as Lectura<HoraRegistradaFila>;
export const garantias = (c: Cliente) => desde(c, 'garantias').select('*') as unknown as Lectura<GarantiaFila>;
