import { BandejaAdmin } from '@/components/portal/revisiones/admin-bandeja';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Bandeja de aprobaciones · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/aprobaciones'); return <BandejaAdmin />; }
