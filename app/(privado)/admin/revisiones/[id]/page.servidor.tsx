import { RevisionAdminDetalle } from '@/components/portal/revisiones/admin-detalle';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Revisión · Portal de clientes Websourcing' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirRuta('/admin/aprobaciones');
  return <RevisionAdminDetalle id={id} />;
}
