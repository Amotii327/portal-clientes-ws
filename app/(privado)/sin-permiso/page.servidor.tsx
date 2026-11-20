import { crearClienteServidor } from '@/lib/supabase/server';
import { miContexto } from '@/lib/portal/acciones';
import { rutaPermitida } from '@/lib/app/rutas';
import { PageHeader } from '@/components/ds/page';
import { SinPermiso } from '@/components/ds/states';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sin permiso · Portal de clientes Websourcing' };

export default async function Page({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const { data: ctx } = await miContexto(await crearClienteServidor());
  const ruta = r && r.startsWith('/') ? r : '/';
  const p = ctx ? rutaPermitida(ctx, ruta) : { ok: true as const };
  return (
    <>
      <PageHeader titulo="Sin permiso" />
      <SinPermiso texto={p.ok ? undefined : p.texto} inicio={ctx?.estado === 'super_admin' ? '/admin/clientes' : '/cliente/inicio'} />
    </>
  );
}
