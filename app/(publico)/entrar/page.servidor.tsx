import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';
import { PantallaEntrar } from '@/components/portal/entrada';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar · Portal de clientes Websourcing' };

export default async function Page({ searchParams }: { searchParams: Promise<{ salir?: string }> }) {
  const { salir } = await searchParams;
  if (!salir) {
    const c = await crearClienteServidor();
    const { data } = await c.auth.getUser();
    if (data.user) redirect('/');
  }
  return <PantallaEntrar />;
}
