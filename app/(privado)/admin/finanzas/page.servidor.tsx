import { FinanzasAdmin } from '@/components/portal/dinero/finanzas-admin';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Finanzas · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/finanzas'); return <FinanzasAdmin />; }
