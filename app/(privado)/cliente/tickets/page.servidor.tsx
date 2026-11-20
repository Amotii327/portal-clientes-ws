import { TicketsListaReal } from '@/components/portal/tickets/lista';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Tickets · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/cliente/tickets'); return <TicketsListaReal modo="cliente" />; }
