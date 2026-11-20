'use server';
import { crearClienteServidor } from '@/lib/supabase/server';
import { CODIGO_FRENADA, mensajeDeAuth } from '@/lib/app/auth-errores';
import { crearClienteSistema, sistemaConfigurado } from './avisos/sistema';

/**
 * Entrar con correo y contraseña, con el FRENO de 5 intentos fallidos / 15 minutos hecho en el servidor (plan B: el gancho
 * `password_verification_attempt` de Auth no está en el plan Pro). Orden:
 *   1. Pregunta a la base (clave de sistema, función freno_acceso_consultar) si la cuenta está frenada. Si lo está, responde
 *      `cuenta_frenada_temporalmente` SIN llamar a Auth (ni con la clave correcta se entra durante el freno).
 *   2. Llama a signInWithPassword con la sesión del servidor (las cookies las pone el servidor).
 *   3. Anota el resultado (freno_acceso_anotar): cada fallo suma; al quinto la cuenta queda frenada 15 minutos y el
 *      registro de actividad lo guarda. Un acierto reinicia la cuenta. Si entre 1 y 3 la cuenta se frenó (carreras), se
 *      cierra la sesión recién abierta y se responde igual.
 * La contraseña no se escribe en ningún registro. Límite conocido: quien llame a Auth directo se salta este freno
 * (por eso se recomienda encender el gancho si el plan algún día lo permite).
 */
export type ResultadoEntrar = { ok: true } | { ok: false; frenada: boolean; mensaje: string };

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const frenada = (): ResultadoEntrar => ({ ok: false, frenada: true, mensaje: mensajeDeAuth({ message: CODIGO_FRENADA }) });

export async function entrarServidor(entrada: { correo: string; clave: string }): Promise<ResultadoEntrar> {
  const correo = (typeof entrada?.correo === 'string' ? entrada.correo : '').trim().toLowerCase().slice(0, 254);
  const clave = typeof entrada?.clave === 'string' ? entrada.clave : '';
  if (!CORREO.test(correo) || !clave || clave.length > 1000) {
    return { ok: false, frenada: false, mensaje: mensajeDeAuth({ code: 'invalid_credentials' }) };
  }

  const hayFreno = sistemaConfigurado();
  if (!hayFreno && process.env.NODE_ENV === 'production') {
    // En producción sin la clave de sistema no hay freno: se cierra la entrada en lugar de dejarla sin protección.
    return { ok: false, frenada: false, mensaje: mensajeDeAuth(null) };
  }
  const sistema = hayFreno ? crearClienteSistema() : null;

  if (sistema) {
    const { data, error } = await sistema.rpc('freno_acceso_consultar', { p_correo: correo });
    if (error) return { ok: false, frenada: false, mensaje: mensajeDeAuth(null) };
    if ((data as { bloqueado?: boolean } | null)?.bloqueado) return frenada();
  }

  const c = await crearClienteServidor();
  const { error } = await c.auth.signInWithPassword({ email: correo, password: clave });

  if (error) {
    if (sistema && error.code === 'invalid_credentials') {
      const { data } = await sistema.rpc('freno_acceso_anotar', { p_correo: correo, p_valido: false });
      if ((data as { decision?: string } | null)?.decision === 'reject') return frenada();
    }
    return { ok: false, frenada: false, mensaje: mensajeDeAuth(error) };
  }

  if (sistema) {
    const { data } = await sistema.rpc('freno_acceso_anotar', { p_correo: correo, p_valido: true });
    if ((data as { decision?: string } | null)?.decision === 'reject') {
      await c.auth.signOut();
      return frenada();
    }
  }
  return { ok: true };
}
