'use client';
import * as React from 'react';
import { Star } from 'lucide-react';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { anotarRechazo } from '@/lib/portal/acciones';
import { mensajeTicketsMant } from '@/lib/portal/errores-tickets-mant';
import type { Area, TicketEstado, TicketTipo, Prioridad } from '@/lib/data';
import type {
  AreaEquipo, EstadoTicket, MotivoFueraDePlan, PrioridadTicket, Semaforo as SemaforoValor, TicketFila, TicketSemaforoFila, TipoTicket,
} from '@/lib/supabase/tipos-tickets-mant';
import { cn } from '@/lib/utils';

/** Textos de los valores que guarda la base. Todo lo que ve la persona sale de aquí, nunca el código crudo. */
export const TIPO_TXT: Record<TipoTicket, TicketTipo> = { error: 'Error', solicitud_cambio: 'Solicitud de cambio', pregunta: 'Pregunta', acceso: 'Acceso' };
export const PRIORIDAD_TXT: Record<PrioridadTicket, Prioridad> = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baja: 'Baja' };
export const ESTADO_TXT: Record<EstadoTicket, TicketEstado> = {
  nuevo: 'Nuevo', clasificado: 'Clasificado', en_progreso: 'En progreso', esperando_cliente: 'Esperando al cliente', resuelto: 'Resuelto', cerrado: 'Cerrado',
};
export const AREAS: AreaEquipo[] = ['Producto', 'Arquitectura', 'Diseño', 'Desarrollo', 'Calidad', 'Operaciones'];
export type { Area };
export const AVISO_ACCESO = 'No escribas claves aquí. Te indicaremos cómo entregarlas de forma segura.';
export const MOTIVO_FUERA_DE_PLAN: Record<MotivoFueraDePlan, string> = {
  sin_mantenimiento: 'tu empresa no tiene un plan de mantenimiento activo y la garantía ya terminó',
  mantenimiento_vencido: 'el plan de mantenimiento de tu empresa está vencido y la garantía ya terminó',
  sin_cobertura_errores: 'tu plan de mantenimiento no incluye la corrección de errores',
};

export const numeroDe = (n: number) => 'T-' + String(n).padStart(4, '0');
export const prioridadDe = (t: Pick<TicketFila, 'prioridad' | 'prioridad_propuesta'>): PrioridadTicket => t.prioridad ?? t.prioridad_propuesta;
export const estaAbierto = (t: Pick<TicketFila, 'estado'>) => t.estado !== 'cerrado' && t.estado !== 'resuelto';
/** Pide la decisión del dueño: solicitud de cambio o fuera de plan, todavía sin decidir y sin cerrar. */
export const requiereDecision = (t: TicketFila) => (t.tipo === 'solicitud_cambio' || t.fuera_de_plan) && !t.decision_dueno && t.estado !== 'cerrado';
export const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
export const dinero = (valor: number, moneda: string | null) => `$ ${Math.round(valor).toLocaleString('es-CO')} ${moneda ?? 'COP'}`;
export const horas = (n: number) => `${Math.round(n * 100) / 100}`.replace('.', ',') + ' h';

/** Minutos hábiles a texto corto: "45 min", "1 h 30 min", "3 h". */
export function duracion(min: number) {
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const SEM: Record<SemaforoValor, { color: string; tono: string; texto: (m: number | null) => string }> = {
  verde: { color: 'bg-success', tono: 'text-success', texto: (m) => `Quedan ${duracion(m ?? 0)} hábiles` },
  amarillo: { color: 'bg-warning', tono: 'text-warning', texto: (m) => `Quedan ${duracion(m ?? 0)} hábiles` },
  rojo: { color: 'bg-danger', tono: 'text-danger', texto: (m) => (m ? `Vencida hace ${duracion(m)}` : 'Vencida') },
  cumplido: { color: 'bg-success', tono: 'text-muted-foreground', texto: () => 'Respondido a tiempo' },
  incumplido: { color: 'bg-danger', tono: 'text-muted-foreground', texto: () => 'Respondido fuera de tiempo' },
  cerrado: { color: 'bg-muted-foreground', tono: 'text-muted-foreground', texto: () => 'Cerrado' },
  sin_plazo: { color: 'bg-muted-foreground', tono: 'text-muted-foreground', texto: () => 'Siguiente planeación' },
};
/** Orden para la bandeja: lo más urgente primero. */
export const PESO_SEMAFORO: Record<SemaforoValor, number> = { rojo: 0, amarillo: 1, verde: 2, sin_plazo: 3, incumplido: 4, cumplido: 5, cerrado: 6 };

/** Semáforo del tiempo de primera respuesta, con el valor que calcula la base (vista tickets_semaforo). */
export function SemaforoReal({ fila }: { fila: TicketSemaforoFila | undefined }) {
  if (!fila) return null;
  const s = SEM[fila.semaforo];
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs font-medium', s.tono)} title="Tiempo para la primera respuesta" data-semaforo={fila.semaforo}>
      <span className={cn('size-2.5 rounded-full', s.color)} aria-hidden />
      <span>{s.texto(fila.minutos_habiles_restantes)}</span>
    </span>
  );
}

export function Estrellas({ valor, onElegir, deshabilitado }: { valor: number; onElegir?: (n: number) => void; deshabilitado?: boolean }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Calificación de 1 a 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} disabled={deshabilitado || !onElegir} onClick={() => onElegir?.(n)} aria-label={`${n} de 5`} className="rounded p-1 disabled:cursor-default">
          <Star className={cn('size-8', valor >= n ? 'fill-warning text-warning' : 'text-muted-foreground')} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export type Resultado<T> = { ok: true; data: T | null } | { ok: false; mensaje: string };

/**
 * Ejecuta una acción de la base y devuelve el mensaje amable si falla (nunca el texto técnico).
 * Las acciones sensibles (decisiones, dinero, mantenimiento) dejan anotado el intento rechazado (M-7).
 */
export async function ejecutar<T>(accion: string, fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, sensible = false): Promise<Resultado<T>> {
  try {
    const { data, error } = await fn();
    if (error) {
      if (sensible) void Promise.resolve(anotarRechazo(crearClienteNavegador(), accion, (error.message ?? '').split(':')[0].trim().slice(0, 80))).catch(() => {});
      return { ok: false, mensaje: mensajeTicketsMant(error) };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, mensaje: 'No pudimos completar la acción. Tu información está a salvo. Intenta de nuevo; si sigue igual, escríbenos.' };
  }
}

/** Lo que acepta el bucket de adjuntos de tickets (debe coincidir con la base). */
export const MIME_ADJUNTOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg', 'audio/webm'];
export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // un video pesa como máximo 20 MB; si es más grande se pega un enlace (SC-5)
export const MAX_ADJUNTOS = 30;
/** El enlace debe ser https y sin espacios (igual que la base). */
export const enlaceValido = (t: string) => /^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{2,5})?(\/[^\s\x00-\x1f]*)?$/.test(t) && t.length >= 12 && t.length <= 500;
export const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/** Revisa un archivo antes de subirlo. Devuelve el motivo si no sirve. */
export function motivoDeRechazo(f: File): string | null {
  if (!MIME_ADJUNTOS.includes(f.type)) return `"${f.name}" no se puede adjuntar: solo imágenes, videos y audios.`;
  if (f.type.startsWith('video/') && f.size > MAX_VIDEO_BYTES) return `"${f.name}" pesa ${mb(f.size)}. Un video puede pesar hasta 20 MB. Para uno más grande, súbelo a tu nube y pega el enlace en "Link de video".`;
  if (f.size > MAX_BYTES) return `"${f.name}" pesa ${mb(f.size)}. El máximo es 50 MB por archivo.`;
  if (f.size === 0) return `"${f.name}" está vacío.`;
  return null;
}
