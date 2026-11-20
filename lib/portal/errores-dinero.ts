import { mensajeDeError } from './errores';

/**
 * Códigos de error del Módulo 4 (Dinero) traducidos para la persona. Los de los sprints 1 y 2
 * (no_autorizado, datos_invalidos, ver_como_solo_lectura, proyecto_no_encontrado...) siguen en ./errores:
 * `mensajeDeErrorDinero` primero busca aquí y, si no es de dinero, delega en `mensajeDeError`.
 * Al integrar, estos pueden pasar a MENSAJES de errores.ts.
 */
export const MENSAJES_DINERO: Record<string, string> = {
  contrato_no_encontrado: 'No encontramos ese contrato.',
  contrato_ya_existe: 'Este proyecto ya tiene contrato.',
  contrato_bajo_lo_comprometido: 'El valor del contrato no puede ser menor que lo ya programado o abonado.',
  moneda_con_movimientos: 'La moneda no se puede cambiar cuando el contrato ya tiene cuotas o abonos.',
  anticipo_excede_valor: 'El anticipo no puede ser mayor que el valor del contrato.',
  pago_no_encontrado: 'No encontramos ese pago.',
  pagos_exceden_contrato: 'Las cuotas no pueden sumar más que el valor del contrato.',
  pago_bajo_lo_abonado: 'La cuota no puede quedar por debajo de lo que ya se abonó.',
  pago_con_movimientos: 'Esta cuota ya tiene abonos, comprobantes o facturas y no se puede quitar.',
  pago_en_revision: 'Hay un comprobante en revisión para esta cuota: resuélvelo antes de cambiar su valor o fecha.',
  pago_ya_pagado: 'Esta cuota ya está pagada.',
  hito_de_otro_proyecto: 'Ese hito no pertenece al proyecto del contrato.',
  abono_no_encontrado: 'No encontramos ese abono.',
  abono_excede_saldo: 'El abono es mayor que el saldo del contrato.',
  abono_excede_pago: 'El abono es mayor que lo que falta de esa cuota.',
  abono_ya_anulado: 'Ese abono ya estaba anulado.',
  abono_no_modificable: 'Un abono no se puede editar: anúlalo y registra otro.',
  factura_no_encontrada: 'No encontramos esa factura.',
  factura_numero_repetido: 'Ya existe una factura con ese número.',
  factura_ya_anulada: 'Esa factura ya estaba anulada.',
  factura_no_modificable: 'Una factura no se puede editar: anúlala y sube otra.',
  archivo_invalido: 'El archivo no es válido: debe ser PDF o imagen (PNG, JPG, WEBP) de hasta 10 MB.',
  valor_excede_pendiente: 'El valor del pago es mayor que lo que falta por pagar.',
  fechas_invalidas: 'Revisa la fecha: un pago no puede tener fecha futura.',
  comprobante_en_revision: 'Ya hay un comprobante en revisión para este pago. Te avisaremos cuando lo revisemos.',
  comprobante_no_encontrado: 'No encontramos ese comprobante.',
  comprobante_ya_revisado: 'Ese comprobante ya fue revisado.',
};

export const codigoDeErrorDinero = (error: { message?: string } | null | undefined): string | null => {
  const codigo = error?.message?.trim().split(':')[0].trim();
  return codigo && codigo in MENSAJES_DINERO ? codigo : null;
};

export function mensajeDeErrorDinero(error: { message?: string } | null | undefined): string {
  const codigo = codigoDeErrorDinero(error);
  return codigo ? MENSAJES_DINERO[codigo] : mensajeDeError(error);
}
