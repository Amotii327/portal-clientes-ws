'use client';
import * as React from 'react';
import { crearClienteNavegador } from '@/lib/supabase/client';
import type { Rol } from '@/lib/supabase/database.types';

/** Carga de datos con estados cargando / ok / error. `fn` debe lanzar un error si algo falla. */
export function useCargar<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [estado, setEstado] = React.useState<'cargando' | 'ok' | 'error'>('cargando');
  const [datos, setDatos] = React.useState<T | null>(null);
  const [version, setVersion] = React.useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = React.useCallback(fn, deps);
  React.useEffect(() => {
    let vivo = true;
    f().then((d) => { if (vivo) { setDatos(d); setEstado('ok'); } }).catch(() => { if (vivo) setEstado('error'); });
    return () => { vivo = false; };
  }, [f, version]);
  const recargar = React.useCallback((silencioso = false) => { if (!silencioso) setEstado('cargando'); setVersion((v) => v + 1); }, []);
  return { estado, datos, recargar, setDatos };
}

export interface PerfilMini { nombre: string; correo: string; bloqueado: boolean }
export interface FilaMiembro {
  id: string; empresa_id: string; user_id: string; rol: Rol;
  aprobar: boolean; ver_dinero: boolean; ver_todos_tickets: boolean; subir_archivos: boolean;
  bloqueado: boolean; quitado_en: string | null;
  perfiles: PerfilMini | null;
}
export interface FilaInvitacion { id: string; correo: string; rol: Rol; vence_en: string; usada_en: string | null; revocada_en: string | null }

const COLS_MIEMBRO = 'id, empresa_id, user_id, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos, bloqueado, quitado_en, perfiles(nombre, correo, bloqueado)';
// Ojo: nunca select('*') en invitaciones; token_hash no se puede leer.
const COLS_INVITACION = 'id, correo, rol, vence_en, usada_en, revocada_en';

/** Miembros (con historial) e invitaciones sin usar de una empresa. Lo que se ve lo decide la base (RLS). */
export async function leerEquipo(empresaId: string) {
  const c = crearClienteNavegador();
  const [m, i] = await Promise.all([
    c.from('miembros').select(COLS_MIEMBRO).eq('empresa_id', empresaId).order('creado_en', { ascending: true }).returns<FilaMiembro[]>(),
    c.from('invitaciones').select(COLS_INVITACION).eq('empresa_id', empresaId).is('usada_en', null).is('revocada_en', null).order('creada_en', { ascending: false }).returns<FilaInvitacion[]>(),
  ]);
  if (m.error || i.error) throw new Error('lectura_fallida');
  return { miembros: m.data ?? [], invitaciones: i.data ?? [] };
}

export const nombreDe = (m: FilaMiembro) => m.perfiles?.nombre?.trim() || m.perfiles?.correo || 'Persona sin nombre';
export const estaVencida = (i: FilaInvitacion) => new Date(i.vence_en).getTime() < Date.now();
export const esUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
