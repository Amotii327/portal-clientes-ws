import { PantallaMuestra } from '@/components/portal/muestra';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Portal de clientes Websourcing' };
export default async function Page({ params }: { params: Promise<{ ruta: string[] }> }) {
  const { ruta } = await params;
  await exigirRuta('/' + ruta.join('/'));
  return <PantallaMuestra />;
}
