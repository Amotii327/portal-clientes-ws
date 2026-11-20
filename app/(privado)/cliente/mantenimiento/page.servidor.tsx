import { MiMantenimientoReal } from '@/components/portal/mantenimiento/cliente';
import { exigirMantenimientoActivo } from '@/lib/servidor/guardia-tickets-mant';
export const metadata = { title: 'Mi plan de mantenimiento · Portal de clientes Websourcing' };
export default async function Page() { await exigirMantenimientoActivo(); return <MiMantenimientoReal />; }
