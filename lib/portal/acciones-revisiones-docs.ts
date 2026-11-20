import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ArchivoBorrado, ArchivoCreado, BandejaRevisiones, DestinoSubida, DocumentoCreado, ReservaSubida,
  RespuestaRevision, RevisionCreada, VisibilidadDocumento, CategoriaDocumento, TipoRevision, DecisionRevision,
} from '../supabase/tipos-revisiones-docs';

/**
 * Acciones de revisiones y documentos (sprint 3). Todas usan el cliente de SESIÓN DEL USUARIO, nunca la llave de
 * sistema. Devuelven `{ data, error }`; para el error use `mensajeDeErrorRevDocs` (errores-revisiones-docs.ts).
 * Las pantallas no repiten reglas de permisos: preguntan a la base y la base responde.
 *
 * El cliente se tipa sin el tipo `Database` a propósito: `database.types.ts` no se toca en este sprint.
 */
type Cliente = SupabaseClient;

const ENLACE_VENCE_SEGUNDOS = 600; // 10 minutos (arquitectura, seccion 4)

// ---------------- Subir archivos (los tres pasos) ----------------
// 1) reservarSubida: la base valida permiso, tipo y tamaño y devuelve la ruta (la genera el servidor).
// 2) subir el archivo a Storage EXACTAMENTE a esa ruta (subirAReserva).
// 3) confirmar con la función del destino (confirmarArchivoCliente, crearDocumento, confirmarVersionDocumento,
//    o responderRevision para una captura). La base vuelve a medir el archivo en Storage.
export const reservarSubida = (
  c: Cliente,
  a: { p_destino: DestinoSubida; p_empresa_id: string; p_nombre: string; p_mime: string; p_tamano: number },
) => c.rpc('reservar_subida', a).then((r) => ({ data: r.data as ReservaSubida | null, error: r.error }));

/** Paso 2. Nunca pisa un archivo (upsert apagado). */
export const subirAReserva = (c: Cliente, reserva: ReservaSubida, archivo: Blob, tipo: string) =>
  c.storage.from(reserva.bucket).upload(reserva.ruta, archivo, { contentType: tipo, upsert: false });

/** Los tres pasos de reserva + subida. Devuelve la reserva lista para confirmar. */
export async function reservarYSubir(
  c: Cliente, destino: DestinoSubida, empresaId: string, archivo: File,
): Promise<{ data: ReservaSubida | null; error: { message: string } | null }> {
  const { data, error } = await reservarSubida(c, {
    p_destino: destino, p_empresa_id: empresaId, p_nombre: archivo.name, p_mime: archivo.type, p_tamano: archivo.size,
  });
  if (error || !data) return { data: null, error: error ?? { message: 'reserva_invalida' } };
  const subida = await subirAReserva(c, data, archivo, archivo.type);
  if (subida.error) return { data: null, error: { message: 'archivo_no_subido' } };
  return { data, error: null };
}

// ---------------- Archivos de la empresa (los sube el cliente) ----------------
export const confirmarArchivoCliente = (c: Cliente, a: { p_reserva_id: string; p_nota?: string; p_proyecto_id?: string }) =>
  c.rpc('confirmar_archivo_cliente', a).then((r) => ({ data: r.data as ArchivoCreado | null, error: r.error }));

/**
 * El cliente borra lo que subió mientras Websourcing no lo haya marcado "recibido". La base marca el borrado
 * y devuelve la ruta; aquí se quita el objeto de Storage con la misma sesión (la regla de Storage lo permite).
 */
export async function borrarArchivoCliente(c: Cliente, archivoId: string) {
  const r = await c.rpc('borrar_archivo_cliente', { p_archivo_id: archivoId });
  if (r.error || !r.data) return { data: null, error: r.error };
  const { bucket, ruta } = r.data as ArchivoBorrado;
  await c.storage.from(bucket).remove([ruta]); // si falla, el archivo ya no sale en el portal; DevOps limpia huérfanos
  return { data: r.data as ArchivoBorrado, error: null };
}

/** Solo super admin: marca el archivo como recibido (queda fijo). Su bandeja: archivos con estado 'nuevo'. */
export const marcarArchivoRecibido = (c: Cliente, archivoId: string) =>
  c.rpc('marcar_archivo_recibido', { p_archivo_id: archivoId });

// ---------------- Documentos (los publica Websourcing) ----------------
export const crearDocumento = (c: Cliente, a: {
  p_empresa_id: string; p_proyecto_id: string | null; p_categoria: CategoriaDocumento; p_titulo: string;
  p_descripcion: string | null; p_visibilidad: VisibilidadDocumento; p_miembros: string[]; p_reserva_id: string;
}) => c.rpc('crear_documento', a).then((r) => ({ data: r.data as DocumentoCreado | null, error: r.error }));

export const confirmarVersionDocumento = (c: Cliente, a: { p_documento_id: string; p_reserva_id: string; p_nota?: string }) =>
  c.rpc('confirmar_version_documento', a).then((r) => ({ data: r.data as DocumentoCreado | null, error: r.error }));

export const fijarVisibilidadDocumento = (c: Cliente, a: { p_documento_id: string; p_visibilidad: VisibilidadDocumento; p_miembros?: string[] }) =>
  c.rpc('fijar_visibilidad_documento', a);

/**
 * Enlace de descarga que vence en 10 minutos. Se pide con la sesión de la persona DESPUÉS de leer la fila
 * (si no puede ver la fila, tampoco puede pedir el enlace). Descarga siempre como adjunto y deja la descarga
 * anotada en el registro. `tipo`: 'documento' (id de documento_versiones) o 'archivo' (id de archivos_cliente).
 */
export async function enlaceDeDescarga(
  c: Cliente, tipo: 'documento' | 'archivo', id: string, bucket: 'documentos' | 'archivos-empresa', ruta: string, nombre: string,
) {
  const anotada = await c.rpc('anotar_descarga', { p_tipo: tipo, p_id: id });
  if (anotada.error) return { data: null, error: anotada.error };
  return c.storage.from(bucket).createSignedUrl(ruta, ENLACE_VENCE_SEGUNDOS, { download: nombre });
}

/** Enlace (10 min) de la captura de una petición de cambios. */
export const enlaceDeCaptura = (c: Cliente, ruta: string) =>
  c.storage.from('capturas-revisiones').createSignedUrl(ruta, ENLACE_VENCE_SEGUNDOS, { download: true });

// ---------------- Revisiones ----------------
// Super admin: prepara y publica.
export const crearRevision = (c: Cliente, a: {
  p_proyecto_id: string; p_tipo: TipoRevision; p_titulo: string; p_sprint_id?: string; p_documento_id?: string;
  p_link_prueba?: string; p_video_url?: string; p_acta_documento_id?: string; p_resumen?: string;
}) => c.rpc('crear_revision', a).then((r) => ({ data: r.data as RevisionCreada | null, error: r.error }));

export const editarBorradorRevision = (c: Cliente, a: {
  p_revision_id: string; p_titulo?: string; p_link_prueba?: string; p_video_url?: string;
  p_acta_documento_id?: string; p_resumen?: string;
}) => c.rpc('editar_borrador_revision', a);

export const publicarRevision = (c: Cliente, revisionId: string) =>
  c.rpc('publicar_revision', { p_revision_id: revisionId }).then((r) => ({ data: r.data as RevisionCreada | null, error: r.error }));

export const nuevaVersionRevision = (c: Cliente, revisionId: string) =>
  c.rpc('nueva_version_revision', { p_revision_id: revisionId }).then((r) => ({ data: r.data as RevisionCreada | null, error: r.error }));

export const reabrirRevision = (c: Cliente, revisionId: string, motivo: string) =>
  c.rpc('reabrir_revision', { p_revision_id: revisionId, p_motivo: motivo });

export const bandejaRevisiones = (c: Cliente, empresaId?: string) =>
  c.rpc('bandeja_revisiones', empresaId ? { p_empresa_id: empresaId } : {})
    .then((r) => ({ data: r.data as BandejaRevisiones | null, error: r.error }));

/**
 * Cliente con permiso "aprobar": responde "apruebo" o "pido cambios". `version` es la que la persona está
 * viendo (si ya hay otra más nueva, responde `version_desactualizada`). Para pedir cambios, `comentario` es
 * obligatorio y `capturaReservaId` (opcional) viene de `reservarYSubir(c, 'captura', ...)`.
 * El super admin NO puede aprobar: la base lo rechaza (`no_autorizado`).
 */
export const responderRevision = (c: Cliente, a: {
  p_revision_id: string; p_version: number; p_decision: DecisionRevision; p_comentario?: string; p_captura_reserva_id?: string;
}) => c.rpc('responder_revision', a).then((r) => ({ data: r.data as RespuestaRevision | null, error: r.error }));
