/**
 * Tipos del Módulo 4 (Dinero), sprint 4. Van aparte de database.types.ts a propósito (se integran al juntar las ramas).
 *
 * DINERO: la base guarda numeric(14,2). PostgREST lo entrega como número JSON. Las pantallas NO suman ni restan montos:
 * el saldo, lo abonado, lo pendiente y los estados ya vienen calculados por la base. Para MOSTRAR use Intl.NumberFormat
 * con la moneda del contrato (COP sin decimales, USD con 2). Para ENVIAR un monto use texto ("4000000.50"), no un
 * número calculado con float.
 */
export type Moneda = 'COP' | 'USD';
export type MedioPago = 'transferencia' | 'consignacion' | 'tarjeta' | 'efectivo' | 'otro';
/** Estado calculado de una cuota. `en_revision` gana sobre las fechas; `vencido` = fecha pasada y sin pagar. */
export type EstadoPago = 'pendiente' | 'por_vencer' | 'vencido' | 'en_revision' | 'pagado';
export type EstadoComprobante = 'en_revision' | 'confirmado' | 'rechazado';
export type TipoArchivoComprobante = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';

/** Fila de `v_contratos_saldo` (y `contrato` de dinero_del_proyecto). Fechas AAAA-MM-DD. */
export interface ContratoConSaldo {
  contrato_id: string; empresa_id: string; proyecto_id: string;
  valor: number; moneda: Moneda; anticipo: number; fecha_firma: string | null;
  abonado: number; saldo: number;
  /** Suma de las cuotas del plan y lo que aún no está repartido en cuotas. */
  programado: number; sin_programar: number;
  pagos_vencidos: number; monto_vencido: number; proximo_vence: string | null;
}

/** Fila de `v_pagos_programados`. Cada cuota con su hito asociado (si lo tiene y el cliente puede verlo). */
export interface PagoProgramado {
  pago_id: string; empresa_id: string; contrato_id: string; proyecto_id: string;
  concepto: string; valor: number; moneda: Moneda; vence_el: string;
  hito_id: string | null; hito_numero: number | null; hito_nombre: string | null;
  abonado: number; pendiente: number; estado: EstadoPago;
  /** Negativo = ya venció hace tantos días. */
  dias_para_vencer: number;
}

export interface AbonoDinero {
  id: string; pago_programado_id: string | null; valor: number; moneda: Moneda; fecha_pago: string; medio: MedioPago;
  referencia: string | null; tiene_archivo: boolean;
  /** Un abono anulado no cuenta para el saldo; se muestra tachado con su motivo (que el cliente también lee). */
  anulado_en: string | null; anulado_motivo: string | null;
}

export interface FacturaDinero {
  id: string; numero: string; valor: number; moneda: Moneda; fecha_emision: string; pago_programado_id: string | null;
  /** Ruta en el bucket privado "dinero". Se descarga con enlace firmado de 10 minutos, generado con la sesión del usuario. */
  archivo_path: string; archivo_nombre: string; anulada_en: string | null; anulada_motivo: string | null;
}

export interface ComprobanteDinero {
  id: string; pago_programado_id: string; valor_declarado: number; fecha_pago_declarada: string;
  estado: EstadoComprobante;
  /** Solo si fue rechazado: el cliente lo lee. */
  motivo_rechazo: string | null;
  archivo_nombre: string; archivo_path: string; nota: string | null; creado_en: string; revisado_en: string | null;
}

/** Respuesta de dinero_del_proyecto. `contrato` es null mientras el proyecto no tenga contrato. */
export interface DineroDelProyecto {
  contrato: ContratoConSaldo | null;
  pagos: PagoProgramado[]; abonos: AbonoDinero[]; facturas: FacturaDinero[]; comprobantes: ComprobanteDinero[];
}

/** Elemento de la bandeja del super admin (comprobantes_por_revisar). */
export interface ComprobantePorRevisar {
  id: string; empresa_id: string; empresa_nombre: string; pago_programado_id: string; concepto: string;
  valor_declarado: number; moneda: Moneda; fecha_pago_declarada: string; archivo_path: string; archivo_nombre: string;
  nota: string | null; creado_en: string;
}

/** Fila de v_ingresos_por_mes / v_ingresos_por_cliente / v_ingresos_por_mes_y_cliente (solo super admin; sin mezclar monedas). */
export interface IngresoPorMes { mes: string; moneda: Moneda; abonos: number; total: number }
export interface IngresoPorCliente { empresa_id: string; empresa_nombre: string; moneda: Moneda; abonos: number; total: number; ultimo_pago: string }
export interface IngresoPorMesYCliente { mes: string; empresa_id: string; empresa_nombre: string; moneda: Moneda; abonos: number; total: number }

/** Lo nuevo que traen panel_super_admin() e inicio_cliente() desde el sprint 4. */
export interface PanelDinero { pagos_vencidos: number; comprobantes_en_revision: number }
export interface ItemAtencionPagoVencido {
  tipo: 'pago_vencido'; prioridad: '1'; empresa_id: string; empresa_nombre: string; proyecto_id: string; proyecto_nombre: string;
  pago_id: string; concepto: string; pendiente: number; moneda: Moneda; vence_el: string; dias_de_atraso: number;
}
export interface ItemAtencionComprobante {
  tipo: 'comprobante_en_revision'; prioridad: '2'; empresa_id: string; empresa_nombre: string; proyecto_id: string;
  comprobante_id: string; concepto: string; valor: number; moneda: Moneda; subido_en: string;
}
/** En inicio_cliente(): ambos vienen en null si quien llama no tiene "ver dinero". */
export interface InicioClienteDinero {
  pagos_vencidos: number | null;
  proximo_pago: { pago_id: string; proyecto_id: string; concepto: string; pendiente: number; moneda: Moneda; vence_el: string; estado: EstadoPago } | null;
}

/** Cola de avisos (tabla avisos_salientes). Forma genérica para que tickets y mantenimiento usen la misma. */
export interface AvisoSaliente {
  id: string; empresa_id: string; modulo: string; tipo: string; destino: 'super_admin' | 'cliente_dinero' | 'cliente_admin';
  referencia_id: string | null; clave_unica: string; datos: Record<string, unknown>; programado_para: string;
  estado: 'pendiente' | 'enviado' | 'fallido' | 'cancelado'; intentos: number; enviado_en: string | null; ultimo_error: string | null; creado_en: string;
}

// ---- Argumentos de las funciones (los montos como texto para no pasar por float) ----
export type Monto = string | number;
export interface ArgsCrearContrato { p_proyecto_id: string; p_valor: Monto; p_moneda: Moneda; p_anticipo?: Monto; p_fecha_firma?: string | null }
export interface ArgsEditarContrato { p_contrato_id: string; p_valor?: Monto; p_anticipo?: Monto; p_fecha_firma?: string; p_moneda?: Moneda }
export interface ArgsAgregarPago { p_contrato_id: string; p_concepto: string; p_valor: Monto; p_vence_el: string; p_hito_id?: string | null }
export interface ArgsEditarPago { p_pago_id: string; p_concepto?: string; p_valor?: Monto; p_vence_el?: string; p_hito_id?: string; p_quitar_hito?: boolean }
export interface ArgsCrearAbono {
  p_contrato_id: string; p_valor: Monto; p_fecha_pago: string; p_medio: MedioPago;
  p_pago_id?: string | null; p_referencia?: string | null; p_archivo_path?: string | null;
}
export interface ArgsCrearFactura {
  p_contrato_id: string; p_numero: string; p_valor: Monto; p_fecha_emision: string;
  p_archivo_path: string; p_archivo_nombre: string; p_tamano_bytes: number; p_pago_id?: string | null;
}
export interface ArgsSubirComprobante {
  p_pago_id: string; p_archivo_path: string; p_archivo_nombre: string; p_archivo_tipo: TipoArchivoComprobante;
  p_tamano_bytes: number; p_valor: Monto; p_fecha_pago: string; p_nota?: string | null;
}
export interface ArgsConfirmarComprobante { p_comprobante_id: string; p_medio?: MedioPago; p_valor?: Monto; p_fecha_pago?: string; p_referencia?: string }
