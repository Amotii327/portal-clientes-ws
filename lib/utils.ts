import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Pesos colombianos. Todas las cifras del prototipo son de ejemplo. */
export function cop(valor: number) {
  return '$ ' + Math.round(valor).toLocaleString('es-CO') + ' COP';
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-11-20" -> "20 nov 2026". No usa zona horaria: es solo texto. */
export function fecha(iso?: string | null, corta = false) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]}${corta ? '' : ' ' + y}`;
}

export function fechaHora(iso: string) {
  const hora = iso.length > 10 ? ' · ' + iso.slice(11, 16) : '';
  return fecha(iso) + hora;
}

/** Fecha "de hoy" fija del prototipo, para que los ejemplos no cambien. */
export const HOY = '2026-11-20';

export function diasEntre(a: string, b: string) {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86400000);
}

export function pesos(valor: number) {
  return '$ ' + Math.round(valor).toLocaleString('es-CO');
}
