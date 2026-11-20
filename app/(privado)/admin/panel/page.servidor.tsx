import { PanelGeneralReal } from '@/components/portal/panel-general';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Panel general · Portal de clientes Websourcing' };
export default async function Page() { await exigirRuta('/admin/panel'); return <PanelGeneralReal />; }
