import { TicketDetalleReal } from '@/components/portal/tickets/detalle';
import { exigirRutaConId } from '@/lib/servidor/guardia-tickets-mant';
export const metadata = { title: 'Ticket · Portal de clientes Websourcing' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirRutaConId('/admin/tickets', id);
  return <TicketDetalleReal id={id} modo="admin" />;
}
