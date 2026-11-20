import { DocumentosAdmin } from '@/components/portal/documentos/admin-documentos';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Documentos de los clientes · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/documentos'); return <DocumentosAdmin />; }
