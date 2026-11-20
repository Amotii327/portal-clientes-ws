import 'server-only';
import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';
import { miMantenimientoActivo } from '@/lib/portal/acciones-mantenimiento';
const esUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
import { exigirRuta } from '@/lib/servidor/guardia';

/** Valida en el SERVIDOR la ruta (zona y rol) y, si trae un id, que tenga forma de id. Un id raro nunca llega a la base. */
export async function exigirRutaConId(ruta: string, id: string) {
  await exigirRuta(ruta);
  if (!esUuid(id)) redirect(`/sin-permiso?r=${encodeURIComponent(ruta)}`);
}

/** "Mi mantenimiento" solo existe si el super admin lo activó para la empresa: si no, la persona va a "Sin permiso". */
export async function exigirMantenimientoActivo() {
  await exigirRuta('/cliente/mantenimiento');
  const { data } = await miMantenimientoActivo(await crearClienteServidor());
  if (data !== true) redirect('/sin-permiso?r=%2Fcliente%2Fmantenimiento');
}
