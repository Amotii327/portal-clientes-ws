import { DocumentosCliente } from '@/components/portal/documentos/cliente-documentos';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Documentos · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/cliente/documentos'); return <DocumentosCliente />; }
