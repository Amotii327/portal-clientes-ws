import { ProyectosListaReal } from '@/components/portal/proyectos';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Proyectos · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/proyectos'); return <ProyectosListaReal />; }
