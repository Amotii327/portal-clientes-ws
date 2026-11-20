'use client';
import * as React from 'react';
import { FileAudio, FileImage, FileVideo, Paperclip, X } from 'lucide-react';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { prepararAdjuntoTicket } from '@/lib/portal/acciones-tickets';
import { agregarEnlaceVideoTicket } from '@/lib/portal/acciones-espacio';
import { Field, Input } from '@/components/ui/form';
import type { EnlaceVideoTicket } from '@/lib/supabase/database.types';
import type { TicketAdjuntoFila } from '@/lib/supabase/tipos-tickets-mant';
import { MIME_ADJUNTOS, ejecutar, enlaceValido, mb, motivoDeRechazo } from './comunes';

/**
 * Sube archivos en dos pasos: la base da la ruta (preparar_adjunto_ticket) y luego se sube a Storage.
 * Devuelve los nombres que no se pudieron subir.
 */
export async function subirAdjuntos(ticketId: string, archivos: File[], mensajeId: string | null, progreso?: (n: number, total: number) => void): Promise<string[]> {
  const c = crearClienteNavegador();
  const fallidos: string[] = [];
  for (let i = 0; i < archivos.length; i++) {
    const f = archivos[i];
    progreso?.(i + 1, archivos.length);
    const p = await ejecutar('preparar_adjunto_ticket', () => prepararAdjuntoTicket(c, { p_ticket_id: ticketId, p_nombre: f.name, p_mime: f.type, p_tamano_bytes: f.size, p_mensaje_id: mensajeId }));
    if (!p.ok || !p.data) { fallidos.push(f.name); continue; }
    try {
      const { error } = await c.storage.from(p.data.bucket).upload(p.data.ruta, f, { upsert: false, contentType: f.type });
      if (error) fallidos.push(f.name);
    } catch { fallidos.push(f.name); }
  }
  return fallidos;
}

/** Selector de archivos con lista, validación y botón para quitar. */
export function SelectorAdjuntos({ archivos, onCambio, id, cupo }: { archivos: File[]; onCambio: (f: File[]) => void; id: string; cupo: number }) {
  const [aviso, setAviso] = React.useState<string | null>(null);
  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevos = Array.from(e.target.files ?? []); e.target.value = '';
    const buenos: File[] = []; const malos: string[] = [];
    for (const f of nuevos) { const m = motivoDeRechazo(f); if (m) malos.push(m); else buenos.push(f); }
    let todos = [...archivos, ...buenos];
    if (todos.length > cupo) { malos.push(`Solo caben ${cupo} archivo(s) más en este ticket.`); todos = todos.slice(0, cupo); }
    setAviso(malos.length ? malos.join(' ') : null);
    onCambio(todos);
  };
  return (
    <div>
      <label className="flex min-h-12 cursor-pointer flex-wrap items-center gap-2 rounded border border-dashed border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
        <Paperclip className="size-4" aria-hidden />{archivos.length ? `${archivos.length} archivo(s) elegido(s). Agregar más` : 'Elegir imágenes, videos o audios'}
        <input id={id} type="file" multiple accept={MIME_ADJUNTOS.join(',')} className="sr-only" onChange={elegir} />
      </label>
      {aviso && <p className="mt-1.5 text-xs text-danger" role="alert">{aviso}</p>}
      {archivos.length > 0 && (
        <ul className="mt-2 space-y-1.5" aria-label="Archivos elegidos">
          {archivos.map((f, i) => (
            <li key={f.name + i} className="flex items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5 text-xs">
              <span className="min-w-0 truncate">{f.name} <span className="text-muted-foreground">· {mb(f.size)}</span></span>
              <button type="button" onClick={() => onCambio(archivos.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Un adjunto ya guardado: pide un enlace temporal a Storage y lo muestra según el tipo. */
export function AdjuntoVista({ a }: { a: TicketAdjuntoFila }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [fallo, setFallo] = React.useState(false);
  React.useEffect(() => {
    let vivo = true;
    crearClienteNavegador().storage.from('portal-tickets').createSignedUrl(a.storage_path, 300)
      .then(({ data, error }) => { if (!vivo) return; if (error || !data?.signedUrl) setFallo(true); else setUrl(data.signedUrl); })
      .catch(() => { if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, [a.storage_path]);
  const Icono = a.mime.startsWith('video') ? FileVideo : a.mime.startsWith('audio') ? FileAudio : FileImage;
  return (
    <figure className="max-w-xs overflow-hidden rounded border border-border bg-surface" data-testid="adjunto">
      {url && a.mime.startsWith('image/') && (
        <a href={url} target="_blank" rel="noopener noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={a.nombre_original} className="max-h-48 w-full object-cover" /></a>
      )}
      {url && a.mime.startsWith('video/') && <video src={url} controls preload="metadata" className="max-h-48 w-full" aria-label={a.nombre_original} />}
      {url && a.mime.startsWith('audio/') && <audio src={url} controls preload="metadata" className="w-full" aria-label={a.nombre_original} />}
      <figcaption className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
        <Icono className="size-3.5 shrink-0" aria-hidden /><span className="min-w-0 truncate">{a.nombre_original}</span><span className="shrink-0">· {mb(a.tamano_bytes)}</span>
        {fallo && <span className="shrink-0 text-warning">· no disponible</span>}
      </figcaption>
    </figure>
  );
}

/** Guarda el link de video de un ticket (alternativa al archivo para videos de más de 20 MB). Devuelve true si quedó guardado. */
export async function guardarLinkVideo(ticketId: string, url: string, mensajeId: string | null): Promise<{ ok: boolean; mensaje?: string }> {
  const r = await ejecutar('agregar_enlace_video_ticket', () => agregarEnlaceVideoTicket(crearClienteNavegador(), ticketId, url.trim(), mensajeId ?? undefined));
  return r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje };
}

/** Campo "Link de video": para videos pesados se pega un enlace en vez de subir el archivo. */
export function CampoLinkVideo({ id, valor, onCambio, intento, deshabilitado }: { id: string; valor: string; onCambio: (v: string) => void; intento?: boolean; deshabilitado?: boolean }) {
  const malo = valor.trim() !== '' && !enlaceValido(valor.trim());
  return (
    <Field label="Link de video (opcional)" htmlFor={id} hint="Si tu video pesa más de 20 MB, súbelo a tu nube y pega aquí el enlace (empieza por https://)." error={malo && intento ? 'El enlace debe empezar por https:// y no tener espacios.' : undefined}>
      <Input id={id} type="url" inputMode="url" maxLength={500} value={valor} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value)} placeholder="https://" />
    </Field>
  );
}

/** Enlaces de video ya guardados en el ticket. */
export function EnlacesVideo({ enlaces }: { enlaces: EnlaceVideoTicket[] }) {
  if (enlaces.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5 text-sm" aria-label="Videos por enlace" data-testid="enlaces-video">
      {enlaces.map((e) => (
        <li key={e.id} className="flex items-center gap-2"><FileVideo className="size-4 shrink-0 text-muted-foreground" aria-hidden /><a href={e.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-primary-text underline">{e.url}</a></li>
      ))}
    </ul>
  );
}
