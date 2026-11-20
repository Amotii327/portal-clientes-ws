import { MENSAJE_GENERICO } from '@/lib/portal/errores';

interface ErrorAuth { message?: string; code?: string; status?: number }

/** Traduce los errores de Supabase Auth a mensajes para la persona. Nunca muestra el texto técnico. */
export function mensajeDeAuth(error: ErrorAuth | null | undefined): string {
  if (!error) return MENSAJE_GENERICO;
  const m = error.message ?? '';
  if (m.includes('registro_solo_por_invitacion')) return 'Para crear una cuenta necesitas una invitación de tu empresa.';
  if (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit') {
    return 'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentar.';
  }
  switch (error.code) {
    case 'invalid_credentials': return 'Correo o contraseña incorrectos. Revísalos e intenta de nuevo.';
    case 'email_not_confirmed': return 'Falta confirmar tu correo. Abre el mensaje que te enviamos y vuelve aquí.';
    case 'weak_password': return 'Esa contraseña es muy fácil de adivinar. Prueba con una más larga y única.';
    case 'same_password': return 'Usa una contraseña diferente a la anterior.';
    case 'user_already_exists': return 'Ese correo ya tiene una cuenta. Entra con tu contraseña.';
    case 'signup_disabled': return 'Para crear una cuenta necesitas una invitación de tu empresa.';
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired':
    case 'otp_expired': return 'Ese código no es correcto o ya venció. Intenta de nuevo.';
    default: return MENSAJE_GENERICO;
  }
}

export const CLAVE_MINIMA = 10;
export function errorDeClave(clave: string): string {
  return clave.length < CLAVE_MINIMA ? `Mínimo ${CLAVE_MINIMA} caracteres.` : '';
}
