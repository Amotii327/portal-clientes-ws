import type { MiContexto } from '@/lib/supabase/database.types';

/** Pantalla a la que va cada persona después de entrar. */
export function inicioPara(ctx: Pick<MiContexto, 'estado'> | null | undefined): string {
  if (ctx?.estado === 'super_admin' || ctx?.estado === 'super_admin_requiere_2fa') return '/admin/clientes';
  return '/cliente/inicio';
}

export function necesita2FA(estado: string | undefined) {
  return estado === 'super_admin_requiere_2fa' || estado === 'requiere_2fa';
}

/** ¿Esta persona puede ver esta ruta? Es solo comodidad de pantalla: el permiso real lo da la base (RLS). */
export function rutaPermitida(ctx: MiContexto, ruta: string): { ok: true } | { ok: false; texto: string } {
  const r = ruta.replace(/\/$/, '') || '/';
  const esSuper = ctx.estado === 'super_admin';
  if (r.startsWith('/admin') && !esSuper) {
    return { ok: false, texto: 'Esta zona es solo para el equipo de Websourcing. Tu cuenta no tiene acceso.' };
  }
  if (r.startsWith('/cliente')) {
    if (esSuper) return { ok: false, texto: 'Esta zona es de las empresas clientes. Desde "Clientes" puedes ver a cada empresa.' };
    const esAdmin = ctx.rol === 'admin_cliente';
    const p = ctx.permisos;
    if (r === '/cliente/equipo' && !esAdmin) return { ok: false, texto: 'Solo el administrador de la empresa puede invitar personas y decidir qué ve cada una.' };
    if ((r === '/cliente/facturacion' || r === '/cliente/dinero') && !esAdmin && !p?.ver_dinero) {
      return { ok: false, texto: 'El administrador de tu empresa decide quién ve el dinero y la facturación. Si lo necesitas, pídele que te dé acceso.' };
    }
  }
  return { ok: true };
}
