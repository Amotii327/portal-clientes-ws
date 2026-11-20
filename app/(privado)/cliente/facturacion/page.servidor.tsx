import { FacturacionReal } from '@/components/portal/facturacion';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Datos de facturación · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/cliente/facturacion'); return <FacturacionReal />; }
