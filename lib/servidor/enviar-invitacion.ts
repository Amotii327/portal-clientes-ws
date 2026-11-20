import 'server-only';

/**
 * PUNTO DE CONEXIÓN del correo de invitación. Solo corre en el servidor.
 *
 * PENDIENTE (plan de sprints, 30 nov): conectar Resend. Cuando exista la cuenta:
 *   1. Guardar RESEND_API_KEY y el remitente en el gestor de secretos de Coolify (nunca en el repositorio).
 *   2. Enviar aquí un correo firmado "Equipo Websourcing" con `enlace`.
 *   3. Devolver { enviado: true }.
 * REGLAS: el enlace lleva el token; nunca se escribe en logs ni se devuelve al navegador.
 */
export interface DatosInvitacion {
  correo: string;
  /** Enlace completo /activar?token=... (contiene el token). */
  enlace: string;
  venceEn: string;
}

export async function enviarInvitacion(_datos: DatosInvitacion): Promise<{ enviado: boolean }> {
  void _datos;
  return { enviado: false };
}
