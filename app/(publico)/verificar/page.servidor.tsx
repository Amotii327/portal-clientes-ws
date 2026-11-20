import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';
import { PantallaVerificar } from '@/components/portal/verificar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Código de verificación · Portal de clientes Websourcing' };

export default async function Page() {
  const c = await crearClienteServidor();
  const { data } = await c.auth.getUser();
  if (!data.user) redirect('/entrar');
  return <PantallaVerificar />;
}
