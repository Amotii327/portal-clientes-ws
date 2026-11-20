/**
 * Los errores de las funciones de la base llegan con un código estable en `error.message`.
 * Esta tabla los traduce a mensajes para la persona (tono amable, firmado por el Equipo Websourcing).
 * Nunca se muestra el texto técnico original.
 */
const MENSAJES_BASE: Record<string, string> = {
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
  fechas_invalidas: 'Revisa las fechas: la final no puede ser anterior a la inicial y ni una fecha real ni una fecha de pago pueden ser futuras.',
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
  // Solicitud de cambio 5: ahorro de espacio
  cupo_espacio_lleno: 'El espacio de tu empresa está lleno. Libera archivos o escríbenos para ampliar el cupo.',
  video_demasiado_grande: 'El video pesa más de 20 MB. Pega un enlace al video en lugar de subir el archivo.',
  video_a_archivo_externo: 'Los videos ya no se suben aquí. Pega un enlace al video.',
  enlace_invalido: 'El enlace no es válido. Debe empezar por https:// y no tener espacios.',
  demasiados_enlaces: 'Este ticket ya tiene el máximo de enlaces de video.',
  archivo_no_encontrado: 'No encontramos ese archivo.',
  archivo_no_archivado: 'Ese archivo no está archivado.',
};

/** Sprint 3: revisiones y documentos. */
export const MENSAJES_REVISIONES_DOCS: Record<string, string> = {
  // Revisiones
  revision_no_encontrada: 'No encontramos esa revisión.',
  revision_ya_existe: 'Ese diseño o sprint ya tiene su revisión: para una nueva ronda se crea una versión.',
  revision_sin_contenido: 'Agrega el link de prueba o el video antes de publicar.',
  revision_ya_publicada: 'La revisión ya está publicada.',
  revision_ya_aprobada: 'La revisión ya fue aprobada.',
  revision_no_pendiente: 'Esta revisión ya no espera una respuesta.',
  revision_no_editable: 'Solo se puede abrir una versión nueva cuando hay cambios pedidos o la revisión se reabrió.',
  revision_no_aprobada: 'Solo se puede reabrir una revisión aprobada.',
  version_desactualizada: 'Hay una versión más nueva de esta revisión. Recarga la página y revísala.',
  sin_borrador: 'No hay un borrador para publicar o editar.',
  ya_hay_borrador: 'Ya hay una versión nueva en borrador.',
  sin_permiso_aprobar: 'Tu administrador no te ha dado permiso para aprobar. Pídeselo.',
  cambios_requiere_comentario: 'Cuéntanos qué hay que cambiar (mínimo 5 caracteres).',
  terminado_requiere_aprobacion: 'Este hito o sprint solo se da por terminado cuando el cliente aprueba su revisión.',
  reabrir_requiere_revision: 'Una aprobación solo se deshace reabriendo la revisión, con un motivo.',
  sprint_no_revisable: 'El sprint aún es una propuesta: aprueba el plan antes de revisarlo.',
  sprint_ya_terminado: 'Ese sprint ya está terminado.',
  hito_ya_terminado: 'El hito de diseño ya está terminado. Reábrelo antes de publicar otra revisión.',
  enlace_invalido: 'El enlace debe empezar por https:// y no tener espacios.',
  acta_invalida: 'El acta debe ser un documento de la categoría "acta" de la misma empresa.',
  // Documentos y archivos
  documento_no_encontrado: 'No encontramos ese documento.',
  miembro_invalido: 'Solo se puede compartir con personas activas de esa empresa.',
  archivo_no_encontrado: 'No encontramos ese archivo.',
  archivo_ya_recibido: 'Websourcing ya recibió este archivo y quedó fijo: no se puede borrar.',
  // Subidas
  reserva_invalida: 'La subida no es válida o ya se usó. Intenta subir el archivo de nuevo.',
  reserva_vencida: 'La subida venció. Intenta subir el archivo de nuevo.',
  archivo_no_subido: 'El archivo no llegó completo. Intenta subirlo de nuevo.',
  archivo_demasiado_grande: 'El archivo es muy pesado: el máximo es 50 MB (10 MB para capturas).',
  tipo_no_permitido: 'Ese tipo de archivo no está permitido. Usa imágenes, PDF, video, audio, Office (sin macros), CSV o ZIP.',
  demasiadas_subidas: 'Hiciste muchas subidas seguidas. Espera un rato e intenta de nuevo.',
};
/** Sprint 4: dinero. */
export const MENSAJES_DINERO: Record<string, string> = {
  contrato_no_encontrado: 'No encontramos ese contrato.',
  contrato_ya_existe: 'Este proyecto ya tiene contrato.',
  contrato_bajo_lo_comprometido: 'El valor del contrato no puede ser menor que lo ya programado o abonado.',
  moneda_con_movimientos: 'La moneda no se puede cambiar cuando el contrato ya tiene cuotas o abonos.',
  anticipo_excede_valor: 'El anticipo no puede ser mayor que el valor del contrato.',
  pago_no_encontrado: 'No encontramos ese pago.',
  pagos_exceden_contrato: 'Las cuotas no pueden sumar más que el valor del contrato.',
  pago_bajo_lo_abonado: 'La cuota no puede quedar por debajo de lo que ya se abonó.',
  pago_con_movimientos: 'Esta cuota ya tiene abonos, comprobantes o facturas y no se puede quitar.',
  pago_en_revision: 'Hay un comprobante en revisión para esta cuota: resuélvelo antes de cambiar su valor o fecha.',
  pago_ya_pagado: 'Esta cuota ya está pagada.',
  hito_de_otro_proyecto: 'Ese hito no pertenece al proyecto del contrato.',
  abono_no_encontrado: 'No encontramos ese abono.',
  abono_excede_saldo: 'El abono es mayor que el saldo del contrato.',
  abono_excede_pago: 'El abono es mayor que lo que falta de esa cuota.',
  abono_ya_anulado: 'Ese abono ya estaba anulado.',
  abono_no_modificable: 'Un abono no se puede editar: anúlalo y registra otro.',
  factura_no_encontrada: 'No encontramos esa factura.',
  factura_numero_repetido: 'Ya existe una factura con ese número.',
  factura_ya_anulada: 'Esa factura ya estaba anulada.',
  factura_no_modificable: 'Una factura no se puede editar: anúlala y sube otra.',
  archivo_invalido: 'El archivo no es válido: debe ser PDF o imagen (PNG, JPG, WEBP) de hasta 10 MB.',
  valor_excede_pendiente: 'El valor del pago es mayor que lo que falta por pagar.',
  comprobante_en_revision: 'Ya hay un comprobante en revisión para este pago. Te avisaremos cuando lo revisemos.',
  comprobante_no_encontrado: 'No encontramos ese comprobante.',
  comprobante_ya_revisado: 'Ese comprobante ya fue revisado.',
};
/** Sprints 5 y 6: tickets y mantenimiento. */
export const MENSAJES_TICKETS_MANT: Record<string, string> = {
  ticket_no_encontrado: 'No encontramos ese ticket.',
  ticket_cerrado: 'Este ticket ya está cerrado. Si necesitas algo más, crea uno nuevo.',
  transicion_invalida: 'Ese cambio de estado no está permitido desde el estado actual.',
  prioridad_requerida: 'Primero hay que confirmar la prioridad del ticket.',
  resolucion_requerida: 'Para marcarlo como resuelto escribe cómo se resolvió.',
  ticket_requiere_decision: 'Este ticket necesita primero la decisión del dueño (regalar, cobrar o rechazar).',
  decision_invalida: 'Esa decisión no es válida.',
  decision_no_aplica: 'Este ticket no necesita decisión.',
  valor_cobro_requerido: 'Para cobrar indica el valor y la moneda.',
  motivo_requerido: 'Escribe el motivo (mínimo 3 caracteres).',
  cobro_ya_aceptado: 'El cobro ya fue aceptado.',
  cobro_no_aplica: 'Este ticket no tiene un cobro pendiente.',
  area_invalida: 'Elige el área del equipo que responde.',
  adjunto_invalido: 'El archivo no es válido. Se aceptan imágenes, videos y audios de hasta 50 MB.',
  demasiados_adjuntos: 'Este ticket ya tiene el máximo de archivos adjuntos.',
  mensaje_no_encontrado: 'No encontramos ese mensaje.',
  mensaje_ya_retirado: 'Ese mensaje ya estaba retirado.',
  proyecto_no_disponible: 'Ese proyecto no está disponible para esta empresa.',
  ya_es_solicitud_cambio: 'Este ticket ya es una solicitud de cambio.',
  tipo_invalido: 'El tipo de ticket no es válido.',
  calificacion_invalida: 'La calificación debe ser de 1 a 5 estrellas.',
  ya_calificado: 'Este ticket ya fue calificado.',
  ticket_no_cerrado: 'Solo se califica un ticket cerrado.',
  ticket_no_resuelto: 'Solo se confirma un ticket marcado como resuelto.',
  mantenimiento_no_activo: 'El plan de mantenimiento no está activo para esta empresa.',
  mantenimiento_ya_activo: 'El mantenimiento ya está activo. Usa la configuración para cambiar sus parámetros.',
  parametros_invalidos: 'Revisa los parámetros del plan: hay valores fuera de rango.',
  parametro_invalido: 'Hay un parámetro del plan que no se reconoce.',
  horario_invalido: 'El horario de atención no es válido.',
  zona_invalida: 'La zona horaria no es válida.',
  horas_requeridas: 'Para activar un plan personalizado indica las horas incluidas al mes.',
  ticket_en_progreso: 'Este ticket ya está en trabajo: no se puede proponer un cobro. Decide antes de empezar.',
  cuota_requerida: 'Para activar el plan indica la cuota mensual.',
  fecha_inicio_requerida: 'Para activar el plan indica la fecha de inicio.',
  fecha_invalida: 'La fecha no es válida (no puede ser futura ni de una bolsa inexistente).',
  rango_demasiado_largo: 'El rango de fechas es demasiado largo.',
  plan_no_encontrado: 'No encontramos el plan de mantenimiento.',
  ticket_fuera_de_bolsa: 'Las horas de una solicitud de cambio o de un ticket fuera de plan no se descuentan de la bolsa.',
  hora_no_encontrada: 'No encontramos ese registro de horas.',
  horas_ya_revisadas: 'Esas horas ya fueron revisadas.',
  bolsa_cerrada: 'La bolsa de ese mes ya está cerrada.',
  bolsa_no_encontrada: 'No encontramos esa bolsa de horas.',
  bolsa_agotada_sin_autorizacion: 'La bolsa de horas del mes se agotó. Para seguir trabajando se necesita autorizar horas extra.',
};

/** Todos los códigos estables del portal (sprints 1 a 6). */
const MENSAJES: Record<string, string> = {
  ...MENSAJES_BASE, ...MENSAJES_REVISIONES_DOCS, ...MENSAJES_DINERO, ...MENSAJES_TICKETS_MANT,
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
