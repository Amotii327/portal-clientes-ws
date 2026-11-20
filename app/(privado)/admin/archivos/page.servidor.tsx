import { ArchivosAdmin } from '@/components/portal/documentos/admin-archivos';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Archivos de los clientes · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/archivos'); return <ArchivosAdmin />; }
