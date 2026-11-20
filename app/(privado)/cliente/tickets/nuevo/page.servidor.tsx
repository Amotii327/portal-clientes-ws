import { TicketNuevoReal } from '@/components/portal/tickets/nuevo';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Nuevo ticket · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/cliente/tickets/nuevo'); return <TicketNuevoReal />; }
