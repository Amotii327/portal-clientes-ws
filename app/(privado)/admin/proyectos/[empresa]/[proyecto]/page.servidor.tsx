import { ProyectoDetalleReal } from '@/components/portal/proyecto-detalle';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Proyecto · Portal de clientes Websourcing' };
export default async function Page({ params }: { params: Promise<{ empresa: string; proyecto: string }> }) {
  const { empresa, proyecto } = await params;
  await exigirRuta('/admin/proyectos');
  return <ProyectoDetalleReal empresaId={empresa} proyectoId={proyecto} />;
}
