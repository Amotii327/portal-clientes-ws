'use server';
import { crearClienteServidor } from '@/lib/supabase/server';
import { crearEmpresa, invitarMiembro, miContexto } from '@/lib/portal/acciones';
import { mensajeDeError } from '@/lib/portal/errores';
import type { ResultadoInvitacion, Rol } from '@/lib/supabase/database.types';
import { enviarInvitacion } from './enviar-invitacion';

/**
 * Acciones de servidor que crean invitaciones. Son lo ÚNICO que ve el token de la invitación:
 * el token se usa aquí para armar el enlace del correo y no vuelve al navegador ni se escribe en logs.
 *
 * Excepción de desarrollo (solo si MOSTRAR_ENLACE_INVITACION_DEV=true y NODE_ENV no es production, y solo
 * cuando quien llama es super admin): se devuelve el enlace para mostrarlo en pantalla con el aviso
 * "solo desarrollo", porque todavía no hay envío real de correos.
 */
export type ResultadoCrear =
  | { ok: true; correo: string; venceEn: string; correoEnviado: boolean; enlaceDev?: string; empresaId?: string }
  | { ok: false; mensaje: string };

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const limpio = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function entregar(inv: ResultadoInvitacion, esSuper: boolean) {
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const enlace = `${sitio}/activar?token=${encodeURIComponent(inv.token)}`;
  const { enviado } = await enviarInvitacion({ correo: inv.correo, enlace, venceEn: inv.vence_en });
  const mostrar = esSuper && process.env.NODE_ENV !== 'production' && process.env.MOSTRAR_ENLACE_INVITACION_DEV === 'true';
  return { correoEnviado: enviado, ...(mostrar ? { enlaceDev: enlace } : {}) };
}

export async function crearEmpresaServidor(entrada: {
  nombre: string; razonSocial: string; nit: string; correoFacturas: string; correoAdmin: string;
}): Promise<ResultadoCrear> {
  const a = {
    p_nombre: limpio(entrada?.nombre), p_razon_social: limpio(entrada?.razonSocial), p_nit: limpio(entrada?.nit, 30),
    p_correo_facturas: limpio(entrada?.correoFacturas), p_correo_admin: limpio(entrada?.correoAdmin),
  };
  if (!a.p_nombre || !a.p_razon_social || !a.p_nit || !CORREO.test(a.p_correo_facturas) || !CORREO.test(a.p_correo_admin)) {
    return { ok: false, mensaje: 'Revisa los datos: hay un campo vacío o con formato incorrecto.' };
  }
  const c = await crearClienteServidor();
  const { data, error } = await crearEmpresa(c, a);
  if (error || !data) return { ok: false, mensaje: mensajeDeError(error) };
  const { data: ctx } = await miContexto(c);
  const extra = await entregar(data, ctx?.estado === 'super_admin');
  return { ok: true, correo: data.correo, venceEn: data.vence_en, empresaId: data.empresa_id, ...extra };
}

export async function invitarMiembroServidor(entrada: { empresaId: string; correo: string; rol?: Rol }): Promise<ResultadoCrear> {
  const correo = limpio(entrada?.correo);
  const empresaId = limpio(entrada?.empresaId, 64);
  const rol: Rol = entrada?.rol === 'admin_cliente' ? 'admin_cliente' : 'equipo';
  if (!CORREO.test(correo) || !empresaId) return { ok: false, mensaje: 'El correo no parece válido. Revísalo e intenta de nuevo.' };
  const c = await crearClienteServidor();
  const { data, error } = await invitarMiembro(c, { p_empresa_id: empresaId, p_correo: correo, p_rol: rol });
  if (error || !data) return { ok: false, mensaje: mensajeDeError(error) };
  const { data: ctx } = await miContexto(c);
  const extra = await entregar(data, ctx?.estado === 'super_admin');
  return { ok: true, correo: data.correo, venceEn: data.vence_en, ...extra };
}
