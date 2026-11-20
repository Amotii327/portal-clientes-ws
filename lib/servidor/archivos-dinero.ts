import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { crearClienteServidor } from '@/lib/supabase/server';
import { anotarRechazo } from '@/lib/portal/acciones';
import { BUCKET_DINERO, crearFactura, subirComprobante } from '@/lib/portal/acciones-dinero';
import { codigoDeErrorDinero, mensajeDeErrorDinero } from '@/lib/portal/errores-dinero';
import type { TipoArchivoComprobante } from '@/lib/supabase/tipos-dinero';

/**
 * Subida de archivos del Módulo 4 (comprobantes del cliente y facturas del super admin). Va en el SERVIDOR porque
 * la ruta nunca la elige la persona: `<empresa_id>/<comprobantes|facturas>/<uuid>.<ext>` con uuid nuevo y extensión
 * decidida por el CONTENIDO del archivo (no por su nombre ni por el tipo que declare el navegador).
 * Se usa la sesión de la persona (nunca la llave de sistema): Storage y la base aplican sus propias reglas.
 */
export type RespuestaArchivo = { ok: true } | { ok: false; mensaje: string };

const MAX_COMPROBANTE = 10 * 1024 * 1024;
const MAX_FACTURA = 20 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MONTO = /^\d{1,12}(\.\d{1,2})?$/;
const GENERICO = 'No pudimos completar la acción. Intenta de nuevo y, si sigue, escríbenos.';
const falla = (mensaje: string): RespuestaArchivo => ({ ok: false, mensaje });

/** Tipo real según los primeros bytes. Devuelve null si no es PDF, PNG, JPG ni WEBP. */
export function tipoReal(b: Uint8Array): { tipo: TipoArchivoComprobante; ext: 'pdf' | 'png' | 'jpg' | 'webp' } | null {
  const ascii = (a: number, z: number) => String.fromCharCode(...b.slice(a, z));
  if (b.length >= 5 && ascii(0, 5) === '%PDF-') return { tipo: 'application/pdf', ext: 'pdf' };
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG') return { tipo: 'image/png', ext: 'png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { tipo: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { tipo: 'image/webp', ext: 'webp' };
  return null;
}

const texto = (fd: FormData, k: string, max = 200) => { const v = fd.get(k); return typeof v === 'string' ? v.trim().slice(0, max) : ''; };

type Leido = { error: string } | { error?: undefined; bytes: Uint8Array; real: NonNullable<ReturnType<typeof tipoReal>>; nombre: string };
async function leerArchivo(fd: FormData, max: number, soloPdf: boolean): Promise<Leido> {
  const f = fd.get('archivo');
  if (!(f instanceof File) || f.size === 0) return { error: 'Elige el archivo.' };
  if (f.size > max) return { error: `El archivo pesa más de ${max / 1024 / 1024} MB.` };
  const bytes = new Uint8Array(await f.arrayBuffer());
  const real = tipoReal(bytes);
  if (!real || (soloPdf && real.tipo !== 'application/pdf')) return { error: soloPdf ? 'El archivo debe ser un PDF.' : 'El archivo debe ser PDF o imagen (PNG, JPG o WEBP).' };
  return { bytes, real, nombre: (f.name || 'archivo').replace(/[\r\n]/g, ' ').slice(0, 150) };
}

export async function procesarArchivoDinero(fd: FormData): Promise<{ status: number; cuerpo: RespuestaArchivo }> {
  const c = (await crearClienteServidor()) as unknown as SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: u } = await c.auth.getUser();
  if (!u.user) return { status: 401, cuerpo: falla('Tu sesión terminó. Entra de nuevo para continuar.') };
  const tipo = texto(fd, 'tipo');
  const sale = (r: RespuestaArchivo) => ({ status: 200, cuerpo: r });
  const anotar = (accion: string, error: { message?: string } | null) => {
    const cod = codigoDeErrorDinero(error) ?? error?.message?.trim().split(':')[0] ?? '';
    if (cod) void Promise.resolve(anotarRechazo(c, accion, cod)).then(() => undefined, () => undefined);
  };

  if (tipo === 'comprobante') {
    const pagoId = texto(fd, 'pagoId'); const valor = texto(fd, 'valor'); const fechaPago = texto(fd, 'fechaPago');
    if (!UUID.test(pagoId) || !MONTO.test(valor) || !FECHA.test(fechaPago)) return sale(falla(mensajeDeErrorDinero({ message: 'datos_invalidos' })));
    const a = await leerArchivo(fd, MAX_COMPROBANTE, false);
    if (a.error !== undefined) return sale(falla(a.error));
    // La empresa sale de la cuota (la base solo la entrega si es de la empresa de quien llama).
    const { data: cuota } = await c.from('v_pagos_programados').select('empresa_id').eq('pago_id', pagoId).maybeSingle();
    const empresaId = (cuota as { empresa_id?: string } | null)?.empresa_id;
    if (!empresaId) return sale(falla(mensajeDeErrorDinero({ message: 'pago_no_encontrado' })));
    const ruta = `${empresaId}/comprobantes/${randomUUID()}.${a.real.ext}`;
    const sube = await c.storage.from(BUCKET_DINERO).upload(ruta, a.bytes, { contentType: a.real.tipo, upsert: false });
    if (sube.error) return sale(falla('No pudimos guardar el archivo. Intenta de nuevo; si sigue, escríbenos.'));
    const { error } = await subirComprobante(c, {
      p_pago_id: pagoId, p_archivo_path: ruta, p_archivo_nombre: a.nombre, p_archivo_tipo: a.real.tipo, p_tamano_bytes: a.bytes.length,
      p_valor: valor, p_fecha_pago: fechaPago, p_nota: texto(fd, 'nota', 300) || null,
    });
    if (error) { anotar('subir_comprobante', error); return sale(falla(mensajeDeErrorDinero(error))); }
    return sale({ ok: true });
  }

  if (tipo === 'factura') {
    const contratoId = texto(fd, 'contratoId'); const numero = texto(fd, 'numero', 60); const valor = texto(fd, 'valor');
    const emision = texto(fd, 'fechaEmision'); const pagoId = texto(fd, 'pagoId');
    if (!UUID.test(contratoId) || !numero || !MONTO.test(valor) || !FECHA.test(emision) || (pagoId && !UUID.test(pagoId))) return sale(falla(mensajeDeErrorDinero({ message: 'datos_invalidos' })));
    const a = await leerArchivo(fd, MAX_FACTURA, true);
    if (a.error !== undefined) return sale(falla(a.error));
    const { data: contrato } = await c.from('v_contratos_saldo').select('empresa_id').eq('contrato_id', contratoId).maybeSingle();
    const empresaId = (contrato as { empresa_id?: string } | null)?.empresa_id;
    if (!empresaId) return sale(falla(mensajeDeErrorDinero({ message: 'contrato_no_encontrado' })));
    const ruta = `${empresaId}/facturas/${randomUUID()}.pdf`;
    const sube = await c.storage.from(BUCKET_DINERO).upload(ruta, a.bytes, { contentType: 'application/pdf', upsert: false });
    if (sube.error) return sale(falla('No pudimos guardar el archivo. Intenta de nuevo; si sigue, escríbenos.'));
    const { error } = await crearFactura(c, {
      p_contrato_id: contratoId, p_numero: numero, p_valor: valor, p_fecha_emision: emision, p_archivo_path: ruta,
      p_archivo_nombre: a.nombre, p_tamano_bytes: a.bytes.length, p_pago_id: pagoId || null,
    });
    if (error) { anotar('crear_factura', error); return sale(falla(mensajeDeErrorDinero(error))); }
    return sale({ ok: true });
  }
  return { status: 400, cuerpo: falla(GENERICO) };
}
