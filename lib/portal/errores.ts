/**
 * Los errores de las funciones de la base llegan con un código estable en `error.message`.
 * Esta tabla los traduce a mensajes para la persona (tono amable, firmado por el Equipo Websourcing).
 * Nunca se muestra el texto técnico original.
 */
const MENSAJES: Record<string, string> = {
  no_autorizado: 'No tienes permiso para hacer esto.',
  no_autenticado: 'Tu sesión terminó. Entra de nuevo para continuar.',
  datos_invalidos: 'Revisa los datos: hay un campo vacío o con formato incorrecto.',
  correo_invalido: 'El correo no parece válido. Revísalo e intenta de nuevo.',
  nit_duplicado: 'Ya existe una empresa con ese NIT.',
  empresa_no_disponible: 'Esta empresa no está disponible en este momento.',
  empresa_no_encontrada: 'No encontramos esa empresa.',
  empresa_ya_pausada: 'La empresa ya estaba pausada.',
  empresa_ya_activa: 'La empresa ya estaba activa.',
  correo_ya_es_miembro: 'Esa persona ya hace parte de tu equipo.',
  invitacion_no_pendiente: 'Esa invitación ya fue usada o cancelada.',
  cuenta_frenada_temporalmente: 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.',
  correo_no_invitable: 'No podemos invitar a ese correo.',
  invitacion_invalida: 'Este enlace de invitación no es válido o ya venció. Pide que te envíen uno nuevo.',
  correo_sin_confirmar: 'Primero confirma tu correo con el mensaje que te enviamos.',
  politica_version_invalida: 'La política de datos cambió. Recarga la página y acéptala de nuevo.',
  usuario_bloqueado: 'Tu cuenta está bloqueada. Escríbenos y te ayudamos.',
  ya_es_miembro: 'Tu cuenta ya pertenece a una empresa.',
  miembro_ya_quitado: 'Esa persona ya no hace parte del equipo.',
  no_se_puede_bloquear_super_admin: 'Esa cuenta no se puede bloquear.',
  usuario_no_encontrado: 'No encontramos a esa persona.',
  registro_solo_por_invitacion: 'Para crear una cuenta necesitas una invitación de tu empresa.',
  // Sprint 2: proyectos, hitos, plan de sprints y "ver como"
  proyecto_no_encontrado: 'No encontramos ese proyecto.',
  proyecto_cerrado: 'Este proyecto está terminado o cancelado. Reábrelo para poder cambiarlo.',
  hito_no_encontrado: 'No encontramos ese hito.',
  hito_derivado: 'El estado del hito de sprints se calcula solo a partir de los sprints.',
  hito_no_ocultable: 'Solo el hito de mantenimiento se puede ocultar o mostrar.',
  fechas_invalidas: 'Revisa las fechas: la final no puede ser anterior a la inicial ni la fecha real puede ser futura.',
  retraso_requiere_lado: 'Para cambiar una fecha elige quién causa el cambio: Websourcing o el cliente.',
  retraso_requiere_motivo: 'Para cambiar una fecha escribe el motivo (mínimo 5 caracteres).',
  retraso_requiere_que_falta: 'Si se espera al cliente, escribe qué es lo que falta.',
  plan_ya_aprobado: 'El plan ya está aprobado. Para cambiarlo, edita los sprints y escribe el motivo.',
  plan_no_aprobado: 'El plan de sprints todavía es una propuesta: apruébalo antes de iniciar sprints.',
  plan_vacio: 'El plan no tiene sprints. Agrega al menos uno para aprobarlo.',
  plan_requiere_motivo: 'El plan ya está aprobado: escribe el motivo del cambio (mínimo 5 caracteres).',
  sprint_no_encontrado: 'No encontramos ese sprint.',
  sprint_ya_iniciado: 'Un sprint que ya empezó no se puede quitar.',
  orden_invalido: 'El orden no es válido: incluye todos los sprints y no muevas los que ya empezaron.',
  ver_como_solo_lectura: 'Estás viendo como el cliente: aquí solo se puede mirar. Sal del modo "ver como" para hacer cambios.',
  sin_sesion_ver_como: 'No hay una sesión de "ver como" abierta.',
};

export const MENSAJE_GENERICO = 'No pudimos completar la acción. Intenta de nuevo y, si sigue, escríbenos.';

/** Devuelve el código estable (por ejemplo "invitacion_invalida") o null si no es uno de los nuestros. */
export function codigoDeError(error: { message?: string } | null | undefined): string | null {
  const texto = error?.message?.trim();
  if (!texto) return null;
  const codigo = texto.split(':')[0].trim();
  return codigo in MENSAJES ? codigo : null;
}

export function mensajeDeError(error: { message?: string } | null | undefined): string {
  const codigo = codigoDeError(error);
  return codigo ? MENSAJES[codigo] : MENSAJE_GENERICO;
}
