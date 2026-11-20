import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';
import { miContexto } from '@/lib/portal/acciones';
import { necesita2FA } from '@/lib/app/rutas';
import { PantallaDeAcceso, ZonaPrivada } from '@/components/portal/zona-privada';

export const dynamic = 'force-dynamic';

/**
 * Puerta de toda la zona privada. Pregunta a la base quién es la persona (mi_contexto) y decide:
 * sin sesión -> entrar; pide 2FA -> verificar; suspendida o sin activar -> mensaje; activa -> menú y pantallas.
 * Las reglas de quién ve qué NO están aquí: las aplica la base (docs/matriz-permisos.md).
 */
export default async function LayoutPrivado({ children }: { children: React.ReactNode }) {
  const c = await crearClienteServidor();
  const { data: u } = await c.auth.getUser();
  if (!u.user) redirect('/entrar');
  const { data: ctx, error } = await miContexto(c);
  if (error || !ctx) return <PantallaDeAcceso estado="error" />;
  if (ctx.estado === 'sin_sesion') redirect('/entrar?salir=1');
  if (necesita2FA(ctx.estado)) redirect('/verificar');
  const tema = ctx.tema === 'oscura' ? 'dark' : 'light';
  const aplicarTema = <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme='${tema}'` }} />;
  if (ctx.estado !== 'activo' && ctx.estado !== 'super_admin') {
    return <>{aplicarTema}<PantallaDeAcceso estado={ctx.estado} empresa={ctx.empresa?.nombre} /></>;
  }
  return <>{aplicarTema}<ZonaPrivada contexto={ctx}>{children}</ZonaPrivada></>;
}
