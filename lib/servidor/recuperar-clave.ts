'use server';
import { crearClienteServidor } from '@/lib/supabase/server';
import { crearClienteSistema, sistemaConfigurado } from './avisos/sistema';
import { armarCorreoRecuperarClave } from './avisos/plantillas';
import { enviarPorResend, hayProveedorDeCorreo } from './avisos/resend';

/**
 * Recuperar contraseña desde el servidor. SIEMPRE responde igual, exista o no el correo (no revela quién tiene cuenta).
 *  - Con RESEND_API_KEY y clave de sistema: la base de Auth genera el enlace de recuperación (admin.generateLink), que se
 *    envía con la plantilla de Websourcing. El enlace/token solo existe aquí, en el servidor.
 *  - Si no hay proveedor: se usa el correo propio de Supabase Auth (resetPasswordForEmail), que ya funcionaba.
 */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function recuperarClaveServidor(entrada: { correo: string }): Promise<{ ok: true }> {
  const correo = (typeof entrada?.correo === 'string' ? entrada.correo : '').trim().toLowerCase().slice(0, 254);
  const respuesta = { ok: true } as const;
  if (!CORREO.test(correo)) return respuesta;
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const redirectTo = `${sitio}/cambiar-clave`;
  try {
    if (hayProveedorDeCorreo() && sistemaConfigurado()) {
      const { data, error } = await crearClienteSistema().auth.admin.generateLink({ type: 'recovery', email: correo, options: { redirectTo } });
      const enlace = data?.properties?.action_link;
      if (!error && enlace) {
        const c = armarCorreoRecuperarClave(enlace);
        await enviarPorResend({ para: correo, asunto: c.asunto, texto: c.texto, html: c.html });
      }
      return respuesta; // sin cuenta, generateLink falla en silencio: la respuesta es la misma
    }
    await (await crearClienteServidor()).auth.resetPasswordForEmail(correo, { redirectTo });
  } catch {
    // Sin detalles: la respuesta no cambia.
  }
  return respuesta;
}
