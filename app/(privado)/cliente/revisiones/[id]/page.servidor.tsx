import { RevisionClienteDetalle } from '@/components/portal/revisiones/cliente-detalle';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Revisión · Portal de clientes Websourcing' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirRuta('/cliente/revisiones');
  return <RevisionClienteDetalle id={id} />;
}
