import { MENSAJE_GENERICO } from '@/lib/portal/errores';

/** Código que devuelve el freno de intentos (gancho de Auth o, en el plan B, la acción de servidor `entrarServidor`). */
export const CODIGO_FRENADA = 'cuenta_frenada_temporalmente';
export const MENSAJES_FRENADA = 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.';

interface ErrorAuth { message?: string; code?: string; status?: number }

/** Traduce los errores de Supabase Auth a mensajes para la persona. Nunca muestra el texto técnico. */
export const esFrenada = (e: ErrorAuth | null | undefined) => !!e?.message?.includes('cuenta_frenada_temporalmente');

export function mensajeDeAuth(error: ErrorAuth | null | undefined): string {
  if (!error) return MENSAJE_GENERICO;
  const m = error.message ?? '';
  if (esFrenada(error)) return MENSAJES_FRENADA;
  if (m.includes('registro_solo_por_invitacion')) return 'Para crear una cuenta necesitas una invitación de tu empresa.';
  if (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit') {
    return 'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentar.';
  }
  switch (error.code) {
    case 'invalid_credentials': return 'Correo o contraseña incorrectos. Revísalos e intenta de nuevo.';
    case 'email_not_confirmed': return 'Falta confirmar tu correo. Abre el mensaje que te enviamos y vuelve aquí.';
    case 'weak_password': return 'Esa contraseña es muy fácil de adivinar. Prueba con una más larga y única.';
    case 'same_password': return 'Usa una contraseña diferente a la anterior.';
    case 'user_already_exists': return 'No pudimos crear la cuenta con esos datos. Si ya tienes una cuenta, entra desde "Entrar"; si olvidaste tu contraseña, usa "Recuperar contraseña".';
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
