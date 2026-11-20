import { ClienteDetalleReal } from '@/components/portal/cliente-detalle';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Cliente · Portal de clientes Websourcing' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirRuta('/admin/clientes');
  return <ClienteDetalleReal id={id} />;
}
