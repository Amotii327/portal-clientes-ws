import { RevisionesClienteLista } from '@/components/portal/revisiones/cliente-lista';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Revisiones · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/cliente/revisiones'); return <RevisionesClienteLista />; }
