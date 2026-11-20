import { ClienteDetalleReal } from '@/components/portal/cliente-detalle';
export const metadata = { title: 'Cliente · Portal de clientes Websourcing' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClienteDetalleReal id={id} />;
}
