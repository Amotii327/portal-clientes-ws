import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database, EstadoSprint, InicioCliente, LineaDeTiempo, MiContexto, PanelSuperAdmin,
} from '@/lib/supabase/database.types';

type Cliente = SupabaseClient<Database>;

/**
 * Funciones de los sprints 1 y 2 listas para usar. Todas reciben un cliente de SESIÓN DE USUARIO
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
export const revocarInvitacion = (c: Cliente, invitacionId: string) => c.rpc('revocar_invitacion', { p_invitacion_id: invitacionId });
export const quitarMiembro = (c: Cliente, miembroId: string) => c.rpc('quitar_miembro', { p_miembro_id: miembroId });
export const bloquearMiembro = (c: Cliente, miembroId: string, bloqueado = true) =>
  c.rpc('bloquear_miembro', { p_miembro_id: miembroId, p_bloqueado: bloqueado });
export const pausarEmpresa = (c: Cliente, empresaId: string, motivo?: string) =>
  c.rpc('pausar_empresa', { p_empresa_id: empresaId, p_motivo: motivo ?? null });
export const reactivarEmpresa = (c: Cliente, empresaId: string) => c.rpc('reactivar_empresa', { p_empresa_id: empresaId });
export const bloquearUsuario = (c: Cliente, userId: string, bloqueado = true) =>
  c.rpc('bloquear_usuario', { p_user_id: userId, p_bloqueado: bloqueado });

// ---------------- Sprint 2: proyectos, hitos, plan de sprints, panel y "ver como" ----------------
type Args<N extends keyof Database['public']['Functions']> = Database['public']['Functions'][N]['Args'];

// Escritura (solo super admin con 2FA y sin "ver como" abierto)
export const crearProyecto = (c: Cliente, a: Args<'crear_proyecto'>) => c.rpc('crear_proyecto', a);
export const editarProyecto = (c: Cliente, a: Args<'editar_proyecto'>) => c.rpc('editar_proyecto', a);
/** Cambiar una fecha ya fijada exige p_motivo y p_lado (y p_que_falta si el lado es "cliente"). */
export const editarHito = (c: Cliente, a: Args<'editar_hito'>) => c.rpc('editar_hito', a);
export const fijarPagoHito = (c: Cliente, hitoId: string, concepto: string | null) =>
  c.rpc('fijar_pago_hito', { p_hito_id: hitoId, p_concepto: concepto });
export const cargarPlanSprints = (c: Cliente, a: Args<'cargar_plan_sprints'>) => c.rpc('cargar_plan_sprints', a);
export const agregarSprint = (c: Cliente, a: Args<'agregar_sprint'>) => c.rpc('agregar_sprint', a);
/** Con el plan aprobado, cambiar fechas o contenido exige p_motivo. */
export const editarSprint = (c: Cliente, a: Args<'editar_sprint'>) => c.rpc('editar_sprint', a);
export const cambiarEstadoSprint = (c: Cliente, sprintId: string, estado: EstadoSprint) =>
  c.rpc('editar_sprint', { p_sprint_id: sprintId, p_estado: estado });
export const quitarSprint = (c: Cliente, sprintId: string, motivo?: string) =>
  c.rpc('quitar_sprint', { p_sprint_id: sprintId, p_motivo: motivo ?? null });
export const reordenarSprints = (c: Cliente, proyectoId: string, orden: string[], motivo?: string) =>
  c.rpc('reordenar_sprints', { p_proyecto_id: proyectoId, p_orden: orden, p_motivo: motivo ?? null });
/** "Aprobar" aquí es publicar el plan al cliente; no es la aprobación del cliente. */
export const aprobarPlanSprints = (c: Cliente, proyectoId: string) => c.rpc('aprobar_plan_sprints', { p_proyecto_id: proyectoId });

// Lectura (respetan RLS: el cliente solo recibe lo suyo y lo visible)
export const panelSuperAdmin = (c: Cliente) =>
  c.rpc('panel_super_admin').then((r) => ({ data: r.data as PanelSuperAdmin | null, error: r.error }));
export const inicioCliente = (c: Cliente) =>
  c.rpc('inicio_cliente').then((r) => ({ data: r.data as InicioCliente | null, error: r.error }));
export const lineaDeTiempo = (c: Cliente, proyectoId: string) =>
  c.rpc('linea_de_tiempo', { p_proyecto_id: proyectoId }).then((r) => ({ data: r.data as LineaDeTiempo | null, error: r.error }));

// "Ver como el cliente": solo lectura, vence a los 60 minutos, queda en el registro.
export const iniciarVerComo = (c: Cliente, a: Args<'iniciar_ver_como'>) => c.rpc('iniciar_ver_como', a);
export const terminarVerComo = (c: Cliente) => c.rpc('terminar_ver_como');

/**
 * M-7: una función que falla deshace todo, incluido su rastro. Cuando una acción sensible responde con
 * error, el servidor llama esta función aparte para dejar anotado el intento rechazado.
 * `accion` es el nombre de la función que falló (por ejemplo "editar_hito") y `codigo` el código del error.
 * Nunca falla hacia la pantalla: si no se pudo anotar, se ignora.
 */
export const anotarRechazo = (c: Cliente, accion: string, codigo: string) =>
  c.rpc('anotar_rechazo', { p_accion: accion, p_codigo: codigo });

// Consumo del equipo (interno: solo super admin; el cliente nunca lo recibe). Valores en % de una semana.
export const fijarConsumoProyecto = (c: Cliente, a: Args<'fijar_consumo_proyecto'>) => c.rpc('fijar_consumo_proyecto', a);
export const anotarConsumoSprint = (c: Cliente, a: Args<'anotar_consumo_sprint'>) => c.rpc('anotar_consumo_sprint', a);
export const consumoEquipo = (c: Cliente, proyectoId: string) => c.rpc('consumo_equipo', { p_proyecto_id: proyectoId });

// ---------------------------------------------------------------------------------------------
// Integración (sprints 3 a 6): un solo punto de entrada. Cada módulo conserva su archivo, porque las pantallas ya
// lo importan; aquí se re-exporta todo para poder importar solo desde '@/lib/portal/acciones'.
// ---------------------------------------------------------------------------------------------
export * from './acciones-revisiones-docs';
export * from './acciones-dinero';
export * from './acciones-tickets';
export * from './acciones-mantenimiento';
export * from './acciones-espacio';
