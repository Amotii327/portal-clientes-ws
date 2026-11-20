'use client';
import * as React from 'react';
import { CheckCircle2, Hourglass, MessageSquareReply, RotateCcw, FileEdit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { enlaceDeCaptura, enlaceDeDescarga } from '@/lib/portal/acciones-revisiones-docs';
import { mensajeDeErrorRevDocs } from '@/lib/portal/errores-revisiones-docs';
import { useStore } from '@/lib/store';
import type { EstadoRevision, TipoRevision } from '@/lib/supabase/tipos-revisiones-docs';
import { usePortal } from '../contexto';

/** Lo que la persona puede hacer. Es solo comodidad de pantalla: la base decide en cada acción. */
export function useAcceso() {
  const ctx = usePortal();
  const esAdmin = ctx.rol === 'admin_cliente';
  const soloLectura = ctx.estado === 'ver_como';
  return {
    ctx,
    empresaId: ctx.empresa?.id ?? '',
    userId: ctx.user_id ?? '',
    esSuper: ctx.estado === 'super_admin',
    esAdmin,
    soloLectura,
    puedeAprobar: !soloLectura && (esAdmin || !!ctx.permisos?.aprobar),
    puedeSubir: !soloLectura && (esAdmin || !!ctx.permisos?.subir_archivos),
    tienePermisoAprobar: esAdmin || !!ctx.permisos?.aprobar,
    tienePermisoSubir: esAdmin || !!ctx.permisos?.subir_archivos,
  };
}

export const ETIQUETA_TIPO: Record<TipoRevision, string> = { diseno: 'Diseño', sprint: 'Sprint', documento: 'Documento' };

/** Estado de una revisión. `vistaWebsourcing` cambia las palabras a las del equipo. */
export function EstadoBadge({ estado, vistaWebsourcing = false }: { estado: EstadoRevision; vistaWebsourcing?: boolean }) {
  const m = {
    borrador: ['neutral', vistaWebsourcing ? 'Borrador: por publicar' : 'Borrador', FileEdit],
    publicada: ['warning', vistaWebsourcing ? 'Esperando al cliente' : 'Esperando tu aprobación', Hourglass],
    aprobada: ['success', 'Aprobada', CheckCircle2],
    cambios_pedidos: ['danger', 'Cambios pedidos', MessageSquareReply],
    reabierta: ['info', vistaWebsourcing ? 'Reabierta: por rehacer' : 'Reabierta por Websourcing', RotateCcw],
  } as const;
  const [v, t, I] = m[estado];
  return <Badge variant={v}><I className="size-3.5" aria-hidden />{t}</Badge>;
}

const FORMATO = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const FORMATO_DIA = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' });
/** Fecha y hora de Colombia. Si el texto no es una fecha, devuelve "—". */
export function fechaHoraCo(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : FORMATO.format(d).replace(',', ' ·').replace(/\./g, '');
}
export function fechaCo(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : FORMATO_DIA.format(d).replace(/\./g, '');
}
export function tamanoLegible(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
/** Solo se pintan enlaces https. */
export const esHttps = (v?: string | null): v is string => !!v && /^https:\/\/\S+$/.test(v);

/** Descarga con enlace que vence en 10 minutos. El enlace no se guarda ni se muestra. */
export function useDescarga() {
  const { avisar } = useStore();
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  const bajar = (url: string) => { const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };
  const documento = async (clave: string, tipo: 'documento' | 'archivo', id: string, bucket: 'documentos' | 'archivos-empresa', ruta: string, nombre: string) => {
    setOcupado(clave);
    const r = await enlaceDeDescarga(crearClienteNavegador(), tipo, id, bucket, ruta, nombre);
    setOcupado(null);
    if (r.error || !r.data?.signedUrl) { avisar(mensajeDeErrorRevDocs(r.error as { message?: string } | null) || 'No pudimos preparar la descarga.'); return; }
    bajar(r.data.signedUrl);
  };
  const captura = async (clave: string, ruta: string) => {
    setOcupado(clave);
    const r = await enlaceDeCaptura(crearClienteNavegador(), ruta);
    setOcupado(null);
    if (r.error || !r.data?.signedUrl) { avisar('No pudimos preparar la descarga de la captura.'); return; }
    bajar(r.data.signedUrl);
  };
  return { ocupado, documento, captura };
}
