import { DineroCliente } from '@/components/portal/dinero/cliente-dinero';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Dinero · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/cliente/dinero'); return <DineroCliente />; }
