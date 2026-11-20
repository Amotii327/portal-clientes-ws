import { MiEquipoReal } from '@/components/portal/mi-equipo';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Mi equipo · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/cliente/equipo'); return <MiEquipoReal />; }
