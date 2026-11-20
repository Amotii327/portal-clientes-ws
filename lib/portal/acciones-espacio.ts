import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArchivoArchivado, EnlaceVideoTicket, EspacioDeEmpresa, EspacioPorEmpresa } from '@/lib/supabase/database.types';

/**
 * Solicitud de cambio 5 · ahorro de espacio. Cliente de SESIÓN DE USUARIO; la base decide quién puede.
 * Errores: mensajeDeError (./errores): cupo_espacio_lleno, video_demasiado_grande, video_a_archivo_externo,
 * enlace_invalido, demasiados_enlaces, archivo_no_encontrado, archivo_no_archivado.
 */
type Cliente = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const tipar = <T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) =>
  p.then((r) => ({ data: r.data as T | null, error: r.error }));

/** Admin del cliente: el espacio de su empresa. Super admin: el de la empresa que indique. */
export const espacioDeEmpresa = (c: Cliente, empresaId?: string) =>
  tipar<EspacioDeEmpresa>(c.rpc('espacio_de_empresa', { p_empresa_id: empresaId ?? null }));
/** Super admin: todas las empresas, de la más llena a la menos llena. */
export const espacioPorEmpresas = (c: Cliente) => tipar<EspacioPorEmpresa[]>(c.rpc('espacio_por_empresas'));
/** Super admin: cambia el cupo de una empresa (en bytes, entre 10 MB y 1 TB); `null` vuelve al cupo por defecto (1 GB). */
export const fijarCupoEspacio = (c: Cliente, empresaId: string, cupoBytes: number | null) =>
  tipar<{ empresa_id: string; cupo_bytes: number }>(c.rpc('fijar_cupo_espacio', { p_empresa_id: empresaId, p_cupo_bytes: cupoBytes }));

/** Un video de más de 20 MB no se sube: se pega un enlace (https). */
export const agregarEnlaceVideoTicket = (c: Cliente, ticketId: string, url: string, mensajeId?: string) =>
  tipar<{ enlace_id: string }>(c.rpc('agregar_enlace_video_ticket', { p_ticket_id: ticketId, p_url: url, p_mensaje_id: mensajeId ?? null }));
export const enlacesVideoDeTicket = (c: Cliente, ticketId: string) =>
  tipar<EnlaceVideoTicket[]>(c.from('ticket_enlaces_video').select('*').eq('ticket_id', ticketId).order('creado_en'));

/** Lista de archivos archivados (cada quien ve los suyos). */
export const archivosArchivados = (c: Cliente) =>
  tipar<ArchivoArchivado[]>(c.from('archivos_archivados').select('*').order('marcado_en', { ascending: false }));
/** "Se recuperan a pedido": el admin del cliente o el super admin piden un archivo de vuelta. */
export const pedirRecuperarArchivo = (c: Cliente, archivoId: string) =>
  tipar<{ archivo_id: string; estado: 'recuperacion_pedida' }>(c.rpc('pedir_recuperar_archivo', { p_id: archivoId }));

