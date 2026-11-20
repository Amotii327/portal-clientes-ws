import { MantenimientoListaReal } from '@/components/portal/mantenimiento/admin-lista';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Mantenimiento · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/mantenimiento'); return <MantenimientoListaReal />; }
