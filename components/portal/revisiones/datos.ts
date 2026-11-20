import { crearClienteNavegador } from '@/lib/supabase/client';
import type { Aprobacion, Revision, RevisionVersion } from '@/lib/supabase/tipos-revisiones-docs';

export interface ProyectoMini { id: string; nombre: string; empresa_id: string }
export type Actas = Record<string, { titulo: string; versionId: string; ruta: string; nombre: string }>;
export interface EventoHistorial { id: number; tipo: string; detalle: Record<string, unknown>; creado_en: string }

/** Las tablas nuevas no están en `database.types.ts` (no se toca este sprint): se leen sin tipo y se tipan aquí. */
/** Las respuestas se leen de la vista `v_aprobaciones` con columnas explícitas. Nunca `select *` ni la tabla `aprobaciones` (permisos por columna, 42501): ip, navegador y user_id no salen por aquí. */
const COLUMNAS_APROBACION = 'id, revision_id, version, decision, comentario, captura_path, persona, creado_en';
const tabla = (nombre: string) => (crearClienteNavegador() as unknown as { from: (n: string) => any }).from(nombre); // eslint-disable-line @typescript-eslint/no-explicit-any

export async function leerLista() {
  const [r, p] = await Promise.all([
    tabla('revisiones').select('*').order('actualizado_en', { ascending: false }),
    tabla('proyectos').select('id, nombre, empresa_id'),
  ]);
  if (r.error || p.error) throw new Error('lectura_fallida');
  return { revisiones: (r.data ?? []) as Revision[], proyectos: (p.data ?? []) as ProyectoMini[] };
}

export async function leerDetalle(id: string) {
  const [r, v, a] = await Promise.all([
    tabla('revisiones').select('*').eq('id', id),
    tabla('revision_versiones').select('*').eq('revision_id', id).order('version'),
    tabla('v_aprobaciones').select(COLUMNAS_APROBACION).eq('revision_id', id).order('version'),
  ]);
  if (r.error || v.error || a.error) throw new Error('lectura_fallida');
  const revision = ((r.data ?? []) as Revision[])[0] ?? null;
  if (!revision) return { revision: null, versiones: [], aprobaciones: [], proyecto: null, actas: {} as Actas, reapertura: null, evidencias: {} as Record<string, Evidencia> };
  const versiones = (v.data ?? []) as RevisionVersion[];
  const [p, h, d] = await Promise.all([
    tabla('proyectos').select('id, nombre, empresa_id').eq('id', revision.proyecto_id),
    tabla('historial_proyecto').select('*').eq('proyecto_id', revision.proyecto_id),
    tabla('documentos').select('*').eq('categoria', 'acta'),
  ]);
  const eventos = ((h.data ?? []) as EventoHistorial[]).filter((e) => e.tipo === 'revision_reabierta' && e.detalle?.revision_id === id).sort((x, y) => (x.creado_en < y.creado_en ? 1 : -1));
  const idsActa = new Set(versiones.map((x) => x.acta_documento_id).filter(Boolean));
  const docsActa = ((d.data ?? []) as { id: string; titulo: string }[]).filter((x) => idsActa.has(x.id));
  const vers = docsActa.length ? await tabla('documento_versiones').select('*').order('version', { ascending: false }) : { data: [] };
  const actas: Actas = {};
  for (const doc of docsActa) {
    const ult = ((vers.data ?? []) as { id: string; documento_id: string; storage_path: string; nombre_original: string }[]).find((x) => x.documento_id === doc.id);
    if (ult) actas[doc.id] = { titulo: doc.titulo, versionId: ult.id, ruta: ult.storage_path, nombre: ult.nombre_original };
  }
  return {
    revision, versiones, aprobaciones: (a.data ?? []) as Aprobacion[], proyecto: ((p.data ?? []) as ProyectoMini[])[0] ?? null, actas,
    reapertura: (eventos[0]?.detalle?.motivo as string | undefined) ?? null, evidencias: {} as Record<string, Evidencia>,
  };
}

export interface Evidencia { ip: string | null; user_agent: string | null; creado_en: string }

/** Solo el super admin: quién, cuándo, IP y navegador de cada respuesta. Vive en el registro, no en la tabla. */
export async function leerEvidencias(revisionId: string): Promise<Record<string, Evidencia>> {
  const r = await tabla('registro_actividad').select('*').eq('accion', 'revision_respondida').eq('entidad_id', revisionId);
  if (r.error) throw new Error('lectura_fallida');
  const salida: Record<string, Evidencia> = {};
  for (const f of (r.data ?? []) as { ip: string | null; creado_en: string; detalle: { aprobacion_id?: string; user_agent?: string | null } }[]) {
    if (f.detalle?.aprobacion_id) salida[f.detalle.aprobacion_id] = { ip: f.ip, user_agent: f.detalle.user_agent ?? null, creado_en: f.creado_en };
  }
  return salida;
}
