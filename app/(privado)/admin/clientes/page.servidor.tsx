import { ClientesReal } from '@/components/portal/clientes';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Clientes · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/clientes'); return <ClientesReal />; }
