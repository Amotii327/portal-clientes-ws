import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, MiContexto } from '@/lib/supabase/database.types';

type Cliente = SupabaseClient<Database>;

/**
 * Funciones del sprint 1 listas para usar. Todas reciben un cliente de SESIÓN DE USUARIO
 * (crearClienteNavegador o crearClienteServidor), nunca uno de sistema: la base decide quién puede.
 * Cada una devuelve { data, error }; para el texto del error use mensajeDeError (./errores).
 *
 * ATENCIÓN con crearEmpresa e invitarMiembro: devuelven el token de la invitación EN CLARO.
 * Úselas solo desde el servidor (ruta o acción), envíe el token por correo y NUNCA lo regrese al navegador.
 */
export const miContexto = async (c: Cliente) =>
  c.rpc('mi_contexto').then((r) => ({ data: r.data as MiContexto | null, error: r.error }));

export const politicaVigente = (c: Cliente) => c.rpc('politica_vigente');

export const crearEmpresa = (c: Cliente, a: Database['public']['Functions']['crear_empresa']['Args']) => c.rpc('crear_empresa', a);
export const invitarMiembro = (c: Cliente, a: Database['public']['Functions']['invitar_miembro']['Args']) => c.rpc('invitar_miembro', a);
export const aceptarInvitacion = (c: Cliente, a: Database['public']['Functions']['aceptar_invitacion']['Args']) => c.rpc('aceptar_invitacion', a);
export const quitarMiembro = (c: Cliente, miembroId: string) => c.rpc('quitar_miembro', { p_miembro_id: miembroId });
export const bloquearMiembro = (c: Cliente, miembroId: string, bloqueado = true) =>
  c.rpc('bloquear_miembro', { p_miembro_id: miembroId, p_bloqueado: bloqueado });
export const pausarEmpresa = (c: Cliente, empresaId: string, motivo?: string) =>
  c.rpc('pausar_empresa', { p_empresa_id: empresaId, p_motivo: motivo ?? null });
export const reactivarEmpresa = (c: Cliente, empresaId: string) => c.rpc('reactivar_empresa', { p_empresa_id: empresaId });
export const bloquearUsuario = (c: Cliente, userId: string, bloqueado = true) =>
  c.rpc('bloquear_usuario', { p_user_id: userId, p_bloqueado: bloqueado });
