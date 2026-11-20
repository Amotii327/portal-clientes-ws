import { RegistroReal } from '@/components/portal/registro';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Registro de actividad · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/registro'); return <RegistroReal />; }
