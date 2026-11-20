import 'server-only';
import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';
import { miContexto } from '@/lib/portal/acciones';
import { rutaPermitida } from '@/lib/app/rutas';

/**
 * Valida en el SERVIDOR que la persona puede ver esta ruta (zona, rol y permiso de dinero), con mi_contexto().
 * Si no corresponde, redirige a "Sin permiso" antes de enviar la pantalla. Se llama desde cada página
 * de /admin y /cliente. La copia del navegador (Interior) queda solo por comodidad; la base sigue siendo la que manda.
 */
export async function exigirRuta(ruta: string) {
  const c = await crearClienteServidor();
  const { data: ctx } = await miContexto(c);
  if (!ctx) return; // el layout ya maneja sin sesión y estados de acceso
  const r = rutaPermitida(ctx, ruta);
  if (!r.ok) redirect(`/sin-permiso?r=${encodeURIComponent(ruta)}`);
}
