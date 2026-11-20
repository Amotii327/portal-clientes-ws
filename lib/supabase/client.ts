import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { leerEntornoSupabase } from './env';

/** Cliente para componentes del navegador ('use client'). Usa la sesión del usuario: todo pasa por RLS. */
export function crearClienteNavegador() {
  const { url, anonKey } = leerEntornoSupabase();
  return createBrowserClient<Database>(url, anonKey);
}
