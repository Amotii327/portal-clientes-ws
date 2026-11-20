import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ArgsAgregarPago, ArgsConfirmarComprobante, ArgsCrearAbono, ArgsCrearContrato, ArgsCrearFactura, ArgsEditarContrato,
  ArgsEditarPago, ArgsSubirComprobante, ComprobantePorRevisar, ContratoConSaldo, DineroDelProyecto, IngresoPorCliente,
  IngresoPorMes, IngresoPorMesYCliente, PagoProgramado,
} from '@/lib/supabase/tipos-dinero';

/**
 * Funciones del Módulo 4 (Dinero) listas para usar, sprint 4. Reciben el cliente de SESIÓN DE USUARIO, nunca uno de
 * sistema: la base decide quién puede (permiso "ver dinero", empresa, super admin con 2FA). Devuelven { data, error };
 * para el texto del error use mensajeDeErrorDinero (./errores-dinero).
 *
 * Las funciones de este módulo aún no están en database.types.ts (se regenera al integrar), por eso el cliente se usa
 * sin tipos de función y las respuestas se tipan aquí.
 *
 * Archivos (facturas y comprobantes): el SERVIDOR genera la ruta `<empresa_id>/<facturas|comprobantes|abonos>/<uuid>.<ext>`
 * (uuid nuevo, nunca el nombre del usuario), sube el archivo al bucket privado "dinero" con la sesión del usuario y
 * después llama la función con esa ruta. La descarga usa enlace firmado de 10 minutos, generado con la sesión del usuario.
 */
type Cliente = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const tipar = <T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) =>
  p.then((r) => ({ data: r.data as T | null, error: r.error }));

export const BUCKET_DINERO = 'dinero';
/** Descarga de una factura o comprobante: enlace firmado de 10 minutos, con la sesión del usuario (nunca la clave de sistema). */
export const urlFirmadaDinero = (c: Cliente, ruta: string) => c.storage.from(BUCKET_DINERO).createSignedUrl(ruta, 600, { download: true });
/** Dejar en el registro que se descargó una factura (llamar al firmar el enlace). Si falla, se ignora. */
export const anotarDescargaFactura = (c: Cliente, facturaId: string) => c.rpc('anotar_descarga_factura', { p_factura_id: facturaId });

// ---------------- Lectura (el cliente solo recibe lo suyo y solo con "ver dinero") ----------------
/** Todo el módulo de un proyecto en una llamada. Sin "ver dinero" responde no_autorizado (no vacío). */
export const dineroDelProyecto = (c: Cliente, proyectoId: string) =>
  tipar<DineroDelProyecto>(c.rpc('dinero_del_proyecto', { p_proyecto_id: proyectoId }));
export const saldosDeContratos = (c: Cliente) => tipar<ContratoConSaldo[]>(c.from('v_contratos_saldo').select('*'));
export const pagosProgramados = (c: Cliente, contratoId?: string) => {
  const q = c.from('v_pagos_programados').select('*').order('vence_el');
  return tipar<PagoProgramado[]>(contratoId ? q.eq('contrato_id', contratoId) : q);
};

// ---------------- Cliente con "ver dinero" Y "subir archivos" ----------------
/** Queda "en revisión", NO baja el saldo. Solo el super admin lo confirma o rechaza. */
export const subirComprobante = (c: Cliente, a: ArgsSubirComprobante) => tipar<{ comprobante_id: string }>(c.rpc('subir_comprobante', a));

// ---------------- Super admin (2FA, sin "ver como" abierto) ----------------
export const crearContrato = (c: Cliente, a: ArgsCrearContrato) => tipar<{ contrato_id: string }>(c.rpc('crear_contrato', a));
export const editarContrato = (c: Cliente, a: ArgsEditarContrato) => c.rpc('editar_contrato', a);
export const agregarPago = (c: Cliente, a: ArgsAgregarPago) => tipar<{ pago_id: string }>(c.rpc('agregar_pago', a));
export const editarPago = (c: Cliente, a: ArgsEditarPago) => c.rpc('editar_pago', a);
export const quitarPago = (c: Cliente, pagoId: string) => c.rpc('quitar_pago', { p_pago_id: pagoId });
export const crearAbono = (c: Cliente, a: ArgsCrearAbono) => tipar<{ abono_id: string; saldo: number }>(c.rpc('crear_abono', a));
export const anularAbono = (c: Cliente, abonoId: string, motivo: string) =>
  tipar<{ abono_id: string; saldo: number }>(c.rpc('anular_abono', { p_abono_id: abonoId, p_motivo: motivo }));
export const crearFactura = (c: Cliente, a: ArgsCrearFactura) => tipar<{ factura_id: string }>(c.rpc('crear_factura', a));
export const anularFactura = (c: Cliente, facturaId: string, motivo: string) => c.rpc('anular_factura', { p_factura_id: facturaId, p_motivo: motivo });
export const comprobantesPorRevisar = (c: Cliente) => tipar<ComprobantePorRevisar[]>(c.rpc('comprobantes_por_revisar'));
/** Aquí, y solo aquí, nace el abono. Puede corregir el valor/fecha con lo que vio en el banco. */
export const confirmarComprobante = (c: Cliente, a: ArgsConfirmarComprobante) => tipar<{ abono_id: string; saldo: number }>(c.rpc('confirmar_comprobante', a));
/** El motivo es obligatorio (5 a 500 letras) y el cliente lo lee. No crea abono. */
export const rechazarComprobante = (c: Cliente, comprobanteId: string, motivo: string) =>
  c.rpc('rechazar_comprobante', { p_comprobante_id: comprobanteId, p_motivo: motivo });
export const ingresosPorMes = (c: Cliente) => tipar<IngresoPorMes[]>(c.from('v_ingresos_por_mes').select('*').order('mes', { ascending: false }));
export const ingresosPorCliente = (c: Cliente) => tipar<IngresoPorCliente[]>(c.from('v_ingresos_por_cliente').select('*').order('total', { ascending: false }));
export const ingresosPorMesYCliente = (c: Cliente) =>
  tipar<IngresoPorMesYCliente[]>(c.from('v_ingresos_por_mes_y_cliente').select('*').order('mes', { ascending: false }));
