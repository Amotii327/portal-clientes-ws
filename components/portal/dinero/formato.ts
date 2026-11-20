import type { EstadoPago, MedioPago, Moneda } from '@/lib/supabase/tipos-dinero';

/**
 * Formato y lectura de montos del Módulo 4. REGLA: la pantalla nunca suma ni resta dinero; saldo, abonado,
 * pendiente y estados vienen calculados por la base. Aquí solo se MUESTRA (Intl, es-CO) y se arma el TEXTO
 * que se envía ("4000000.50"), sin pasar por cuentas con decimales.
 */
const FORMATOS: Record<Moneda, Intl.NumberFormat> = {
  COP: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

export function monto(valor: number | string | null | undefined, moneda: Moneda): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? FORMATOS[moneda].format(n) : '—';
}

/** Texto de un monto para el campo de un formulario (sin formato de miles). */
export const montoParaCampo = (valor: number | string): string => String(valor);

/**
 * Convierte lo que escribió la persona en texto listo para enviar. COP: solo enteros. USD: hasta 2 decimales (coma o punto).
 * Devuelve null si no es válido. No acepta puntos de miles ("4.000.000") para no confundir 1.500 con 1,5.
 */
export function normalizarMonto(texto: string, moneda: Moneda): string | null {
  const s = texto.trim().replace(/\s/g, '').replace(',', '.');
  const ok = moneda === 'COP' ? /^\d{1,12}$/.test(s) : /^\d{1,12}(\.\d{1,2})?$/.test(s);
  if (!ok || /^0+(\.0+)?$/.test(s)) return null;
  return s;
}
export const AYUDA_MONTO: Record<Moneda, string> = {
  COP: 'Solo números, sin puntos ni comas. Ejemplo: 4000000.',
  USD: 'Números con hasta 2 decimales. Ejemplo: 1500,50.',
};

/** Fecha de hoy en Colombia, AAAA-MM-DD (para el máximo de los campos de fecha de pago). */
export const hoyColombia = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "2026-11-01" o "2026-11" -> "noviembre 2026". */
export function mesLargo(m: string): string {
  const [y, mm] = m.slice(0, 7).split('-').map(Number);
  return mm >= 1 && mm <= 12 ? `${MESES_LARGO[mm - 1]} ${y}` : m;
}

export const MEDIOS: { id: MedioPago; label: string }[] = [
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'consignacion', label: 'Consignación' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'otro', label: 'Otro' },
];
export const etiquetaMedio = (m: MedioPago | string) => MEDIOS.find((x) => x.id === m)?.label ?? m;

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  pagado: 'Pagado', en_revision: 'En revisión', vencido: 'Vencido', por_vencer: 'Vence pronto', pendiente: 'Pendiente',
};

export const TIPOS_COMPROBANTE = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_COMPROBANTE = 10 * 1024 * 1024;
export const MAX_FACTURA = 20 * 1024 * 1024;
