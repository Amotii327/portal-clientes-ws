import 'server-only';

/**
 * Envío por Resend (https://resend.com). La llave viene SOLO de RESEND_API_KEY y el remitente de CORREO_REMITENTE
 * (por ejemplo "Equipo Websourcing <portal@dominio-verificado>"). Si no hay llave, no se envía nada: el despachador deja
 * los avisos en "pendiente_sin_proveedor".
 * Nunca se devuelve ni se registra el texto de error del proveedor (puede traer datos): solo un código corto.
 */
export const hayProveedorDeCorreo = () => Boolean(process.env.RESEND_API_KEY);

export type ResultadoEnvio = { ok: true } | { ok: false; codigo: string; reintentable: boolean };

export async function enviarPorResend(a: { para: string; asunto: string; texto: string; html: string; claveIdempotencia?: string }): Promise<ResultadoEnvio> {
  const llave = process.env.RESEND_API_KEY;
  if (!llave) return { ok: false, codigo: 'sin_proveedor', reintentable: true };
  const remitente = process.env.CORREO_REMITENTE;
  if (!remitente) return { ok: false, codigo: 'falta_remitente', reintentable: true };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${llave}`,
        'Content-Type': 'application/json',
        ...(a.claveIdempotencia ? { 'Idempotency-Key': a.claveIdempotencia } : {}),
      },
      body: JSON.stringify({ from: remitente, to: [a.para], subject: a.asunto, text: a.texto, html: a.html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) return { ok: true };
    // 4xx (salvo 408/429) = el correo o la cuenta están mal: reintentar no ayuda, pero se cuenta como intento igual.
    return { ok: false, codigo: `resend_${r.status}`, reintentable: r.status === 408 || r.status === 429 || r.status >= 500 };
  } catch {
    return { ok: false, codigo: 'resend_sin_conexion', reintentable: true };
  }
}
