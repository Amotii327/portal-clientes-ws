/**
 * Códigos estables de error de tickets y mantenimiento (llegan en `error.message`) y su mensaje para la persona.
 * Se usa junto a mensajeDeError de ./errores: primero este mapa, y si no está el código, el general.
 * Tono amable; todo se firma como Equipo Websourcing. Nunca se muestra el texto técnico.
 */
import { mensajeDeError } from '@/lib/portal/errores';

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

export const mensajeTicketsMant = (error: { message?: string } | null | undefined): string => {
  const codigo = (error?.message ?? '').split(':')[0].trim();
  return MENSAJES_TICKETS_MANT[codigo] ?? mensajeDeError(error);
};
