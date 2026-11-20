import { TicketsListaReal } from '@/components/portal/tickets/lista';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Tickets de todos · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/tickets'); return <TicketsListaReal modo="admin" />; }
