import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * Guardia de las rutas que corre el cron del VPS. El secreto vive SOLO en la variable de entorno CRON_SECRETO (gestor de
 * secretos de Coolify) y llega en el encabezado `Authorization: Bearer <secreto>`. Sin la variable configurada la ruta
 * responde 503 (cerrada): nunca queda abierta por olvido. Comparación en tiempo constante.
 */
export function revisarCron(request: Request): { ok: true } | { ok: false; estado: 401 | 503 } {
  const secreto = process.env.CRON_SECRETO;
  if (!secreto || secreto.length < 24) return { ok: false, estado: 503 };
  const dado = request.headers.get('authorization') ?? '';
  const esperado = `Bearer ${secreto}`;
  const a = Buffer.from(dado);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, estado: 401 };
  return { ok: true };
}
