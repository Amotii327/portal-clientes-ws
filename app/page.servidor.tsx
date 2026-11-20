import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';
import { miContexto } from '@/lib/portal/acciones';
import { inicioPara, necesita2FA } from '@/lib/app/rutas';

export const dynamic = 'force-dynamic';

/** Raíz de la app real: decide a dónde va cada quien según su estado (miContexto). */
export default async function Raiz() {
  const c = await crearClienteServidor();
  const { data: u } = await c.auth.getUser();
  if (!u.user) redirect('/entrar');
  const { data: ctx } = await miContexto(c);
  if (necesita2FA(ctx?.estado)) redirect('/verificar');
  redirect(inicioPara(ctx));
}
