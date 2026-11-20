import { InicioClienteReal } from '@/components/portal/inicio-cliente';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Inicio · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/cliente/inicio'); return <InicioClienteReal />; }
