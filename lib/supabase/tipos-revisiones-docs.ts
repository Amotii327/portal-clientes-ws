/**
 * Tipos de revisiones y documentos (sprint 3). ESCRITOS A MANO, aparte de `database.types.ts` (que no se toca
 * en este sprint para no chocar con los otros equipos). Cuando exista el proyecto de Supabase se regeneran con
 * `supabase gen types` y estos se pueden fundir en ese archivo.
 *
 * Todas las tablas son de SOLO LECTURA desde la API: lo que se escribe, se escribe con las funciones de
 * `lib/portal/acciones-revisiones-docs.ts`.
 */
import type { Json } from './database.types';

export type TipoRevision = 'diseno' | 'sprint' | 'documento';
export type EstadoRevision = 'borrador' | 'publicada' | 'aprobada' | 'cambios_pedidos' | 'reabierta';
export type DecisionRevision = 'apruebo' | 'pido_cambios';
export type CategoriaDocumento =
  | 'contrato' | 'propuesta' | 'requerimientos' | 'arquitectura' | 'acta' | 'manual' | 'entregable' | 'otro';
export type VisibilidadDocumento = 'todo_el_equipo' | 'solo_admin' | 'personas';
export type EstadoArchivoCliente = 'nuevo' | 'recibido';
export type DestinoSubida = 'documento' | 'archivo_cliente' | 'captura';
export type BucketPortal = 'documentos' | 'archivos-empresa' | 'capturas-revisiones';

export interface Revision {
  id: string;
  empresa_id: string;
  proyecto_id: string;
  tipo: TipoRevision;
  sprint_id: string | null;
  documento_id: string | null;
  titulo: string;
  estado: EstadoRevision;
  /** Versión vigente (la última publicada; en `borrador`, la 1). */
  version_actual: number;
  creado_en: string;
  actualizado_en: string;
}

export interface RevisionVersion {
  id: string;
  empresa_id: string;
  revision_id: string;
  version: number;
  link_prueba: string | null;
  video_url: string | null;
  /** Documento (categoría "acta") con el acta del sprint o del diseño. */
  acta_documento_id: string | null;
  resumen: string | null;
  creada_en: string;
  /** El cliente solo recibe las publicadas; el super admin ve también el borrador (`null`). */
  publicada_en: string | null;
}

/** La respuesta del cliente. NO trae IP, usuario ni navegador (eso solo lo lee el super admin en el registro). */
export interface Aprobacion {
  id: string;
  empresa_id?: string;
  revision_id: string;
  version: number;
  decision: DecisionRevision;
  comentario: string | null;
  /** Ruta en el bucket `capturas-revisiones`. */
  captura_path: string | null;
  miembro_id?: string;
  /** Nombre de quien respondió (el que tenía ese día). */
  persona: string;
  creado_en: string;
}

export interface Documento {
  id: string;
  empresa_id: string;
  proyecto_id: string | null;
  categoria: CategoriaDocumento;
  titulo: string;
  descripcion: string | null;
  visibilidad: VisibilidadDocumento;
  version_actual: number;
  creado_en: string;
  actualizado_en: string;
}

export interface DocumentoVersion {
  id: string;
  empresa_id: string;
  documento_id: string;
  version: number;
  bucket_id: 'documentos';
  storage_path: string;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
  nota: string | null;
  creado_en: string;
}

export interface DocumentoPermiso {
  id: string;
  empresa_id: string;
  documento_id: string;
  miembro_id: string;
  otorgado_en: string;
  revocado_en: string | null;
}

export interface ArchivoCliente {
  id: string;
  empresa_id: string;
  proyecto_id: string | null;
  bucket_id: 'archivos-empresa';
  storage_path: string;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
  nota: string | null;
  estado: EstadoArchivoCliente;
  subido_por: string;
  subido_por_nombre: string;
  creado_en: string;
  recibido_en: string | null;
  /** Solo lo ve el super admin: al cliente le llegan únicamente los no borrados. */
  borrado_en: string | null;
}

// ---- Lo que devuelven las funciones ----
export interface ReservaSubida {
  reserva_id: string;
  bucket: BucketPortal;
  /** Ruta generada por el servidor: `<empresa_id>/<carpeta>/<uuid>.<ext>`. Se sube EXACTAMENTE a esta ruta. */
  ruta: string;
  vence_en: string;
  tamano_maximo: number;
}
export interface RevisionCreada { revision_id: string; version: number }
export interface RespuestaRevision { aprobacion_id: string; estado: 'aprobada' | 'cambios_pedidos' }
export interface DocumentoCreado { documento_id: string; version: number }
export interface ArchivoCreado { archivo_id: string }
export interface ArchivoBorrado { bucket: 'archivos-empresa'; ruta: string }

export interface ItemBandeja {
  revision_id: string;
  empresa_id: string;
  empresa_nombre: string;
  proyecto_id: string;
  proyecto_nombre: string;
  tipo: TipoRevision;
  titulo: string;
  estado: EstadoRevision;
  version: number;
  actualizado_en: string;
}
export interface BandejaRevisiones {
  aprobado: ItemBandeja[];
  cambios_pedidos: ItemBandeja[];
  /** Borradores por publicar y revisiones reabiertas por rehacer. */
  esperando_a_websourcing: ItemBandeja[];
  esperando_al_cliente: ItemBandeja[];
}

/** Tipos de archivo permitidos (idénticos a los de la base y a los de los buckets). */
export const TIPOS_PERMITIDOS: readonly string[] = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv', 'text/plain', 'application/zip', 'application/x-zip-compressed',
];
export const TIPOS_DE_CAPTURA: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
export const TAMANO_MAXIMO_ARCHIVO = 52_428_800; // 50 MB
export const TAMANO_MAXIMO_CAPTURA = 10_485_760; // 10 MB

export type { Json };
