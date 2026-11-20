import { ArchivosCliente } from '@/components/portal/documentos/cliente-archivos';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Archivos de la empresa · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/cliente/archivos'); return <ArchivosCliente />; }
