import { crearClienteNavegador } from '@/lib/supabase/client';
import { leerEquipo, nombreDe } from '@/lib/app/datos';
import type { ArchivoCliente, Documento, DocumentoPermiso, DocumentoVersion } from '@/lib/supabase/tipos-revisiones-docs';

// Las tablas nuevas no están en `database.types.ts` (no se toca este sprint): se leen sin tipo y se tipan aquí.
const tabla = (nombre: string) => (crearClienteNavegador() as unknown as { from: (n: string) => any }).from(nombre); // eslint-disable-line @typescript-eslint/no-explicit-any

export interface EmpresaMini { id: string; nombre: string; estado: string }
export interface ProyectoMini { id: string; nombre: string; empresa_id: string }
export interface PersonaMini { id: string; nombre: string }

export async function leerEmpresas(): Promise<EmpresaMini[]> {
  const r = await tabla('empresas').select('id, nombre, estado').order('nombre');
  if (r.error) throw new Error('lectura_fallida');
  return (r.data ?? []) as EmpresaMini[];
}

/** Documentos que la base deja ver a quien pregunta (el cliente: por visibilidad; el super admin: todos). */
export async function leerDocumentos(empresaId?: string) {
  const filtrar = (q: any) => (empresaId ? q.eq('empresa_id', empresaId) : q); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [d, v, p] = await Promise.all([
    filtrar(tabla('documentos').select('*')).order('actualizado_en', { ascending: false }),
    filtrar(tabla('documento_versiones').select('*')).order('version', { ascending: false }),
    filtrar(tabla('documento_permisos').select('*')),
  ]);
  if (d.error || v.error || p.error) throw new Error('lectura_fallida');
  return { documentos: (d.data ?? []) as Documento[], versiones: (v.data ?? []) as DocumentoVersion[], permisos: ((p.data ?? []) as DocumentoPermiso[]).filter((x) => !x.revocado_en) };
}

export async function leerArchivos(empresaId?: string) {
  const q = tabla('archivos_cliente').select('*');
  const r = await (empresaId ? q.eq('empresa_id', empresaId) : q).order('creado_en', { ascending: false });
  if (r.error) throw new Error('lectura_fallida');
  return (r.data ?? []) as ArchivoCliente[];
}

/** Personas activas de una empresa (no quitadas ni bloqueadas), para compartir documentos. */
export async function leerPersonas(empresaId: string): Promise<PersonaMini[]> {
  const { miembros } = await leerEquipo(empresaId);
  return miembros.filter((m) => !m.quitado_en && !m.bloqueado).map((m) => ({ id: m.id, nombre: nombreDe(m) }));
}

export async function leerProyectosDe(empresaId: string): Promise<ProyectoMini[]> {
  const r = await tabla('proyectos').select('id, nombre, empresa_id').eq('empresa_id', empresaId);
  if (r.error) throw new Error('lectura_fallida');
  return (r.data ?? []) as ProyectoMini[];
}

export const CATEGORIAS: { id: Documento['categoria']; etiqueta: string }[] = [
  { id: 'contrato', etiqueta: 'Contrato' }, { id: 'propuesta', etiqueta: 'Propuesta' }, { id: 'requerimientos', etiqueta: 'Requerimientos' },
  { id: 'arquitectura', etiqueta: 'Arquitectura' }, { id: 'acta', etiqueta: 'Acta' }, { id: 'manual', etiqueta: 'Manual' },
  { id: 'entregable', etiqueta: 'Entregable' }, { id: 'otro', etiqueta: 'Otro' },
];
export const etiquetaCategoria = (c: string) => CATEGORIAS.find((x) => x.id === c)?.etiqueta ?? c;
