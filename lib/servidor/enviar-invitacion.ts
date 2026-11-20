import 'server-only';
import { armarCorreoInvitacion } from './avisos/plantillas';
import { enviarPorResend, hayProveedorDeCorreo } from './avisos/resend';

/**
 * Envío del correo de invitación (el pendiente del sprint 1). Solo corre en el servidor.
 * El enlace lleva el token: existe únicamente en memoria del servidor, NO pasa por la cola de avisos, no se escribe en
 * logs y no se devuelve al navegador. Con RESEND_API_KEY envía por Resend; sin ella devuelve { enviado: false } y la
 * persona que invita ve "no se pudo enviar" (en desarrollo, MOSTRAR_ENLACE_INVITACION_DEV muestra el enlace al super admin).
 * Firmado "Equipo Websourcing".
 */
export interface DatosInvitacion {
  correo: string;
  /** Enlace completo /activar?token=... (contiene el token). */
  enlace: string;
  venceEn: string;
}

export async function enviarInvitacion(datos: DatosInvitacion): Promise<{ enviado: boolean }> {
  if (!hayProveedorDeCorreo()) return { enviado: false };
  const c = armarCorreoInvitacion(datos.enlace, datos.venceEn);
  const r = await enviarPorResend({ para: datos.correo.trim().toLowerCase(), asunto: c.asunto, texto: c.texto, html: c.html });
  return { enviado: r.ok };
}
