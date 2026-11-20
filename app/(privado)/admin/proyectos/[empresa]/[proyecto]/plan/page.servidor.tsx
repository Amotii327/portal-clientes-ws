import { PlanSprintsReal } from '@/components/portal/plan-sprints';
import { exigirRuta } from '@/lib/servidor/guardia';
export const metadata = { title: 'Plan de sprints · Portal de clientes Websourcing' };
export default async function Page({ params }: { params: Promise<{ empresa: string; proyecto: string }> }) {
  const { empresa, proyecto } = await params;
  await exigirRuta('/admin/proyectos');
  return <PlanSprintsReal empresaId={empresa} proyectoId={proyecto} />;
}
