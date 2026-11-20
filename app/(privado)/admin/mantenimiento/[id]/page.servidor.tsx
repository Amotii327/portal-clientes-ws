import { MantenimientoConfigReal } from '@/components/portal/mantenimiento/admin-config';
import { exigirRutaConId } from '@/lib/servidor/guardia-tickets-mant';
export const metadata = { title: 'Configurar mantenimiento · Portal de clientes Websourcing' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirRutaConId('/admin/mantenimiento', id);
  return <MantenimientoConfigReal empresaId={id} />;
}
