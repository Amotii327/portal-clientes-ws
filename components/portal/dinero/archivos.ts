'use client';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { anotarDescargaFactura, urlFirmadaDinero } from '@/lib/portal/acciones-dinero';

/**
 * Descarga de una factura o comprobante: enlace firmado de 10 minutos, generado con la sesión de la persona.
 * Si es una factura, se deja anotada la descarga (si falla el registro, se ignora). Devuelve un mensaje si algo falló.
 */
export async function descargarArchivo(ruta: string, facturaId?: string): Promise<string | null> {
  const c = crearClienteNavegador();
  const { data, error } = await urlFirmadaDinero(c, ruta);
  if (error || !data?.signedUrl) return 'No pudimos preparar la descarga. Intenta de nuevo; si sigue, escríbenos.';
  if (facturaId) void Promise.resolve(anotarDescargaFactura(c, facturaId)).then(() => undefined, () => undefined);
  const a = document.createElement('a');
  a.href = data.signedUrl; a.rel = 'noopener'; a.download = '';
  document.body.appendChild(a); a.click(); a.remove();
  return null;
}

export type RespuestaArchivo = { ok: true } | { ok: false; mensaje: string };

/** Sube un archivo por el servidor (que arma la ruta, guarda el archivo y llama a la función de la base). */
export async function enviarArchivo(datos: FormData): Promise<RespuestaArchivo> {
  try {
    const r = await fetch('/api/dinero/archivo', { method: 'POST', body: datos, credentials: 'same-origin' });
    const j = (await r.json().catch(() => null)) as RespuestaArchivo | null;
    if (j && typeof j.ok === 'boolean') return j;
  } catch { /* cae al mensaje general */ }
  return { ok: false, mensaje: 'No pudimos enviar el archivo. Revisa tu conexión e intenta de nuevo.' };
}
