import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import { leerEntornoSupabase } from './env';

/**
 * Cliente para Server Components, rutas de servidor y acciones. Usa la sesión del usuario (cookies),
 * nunca la llave de sistema: así las reglas RLS siempre aplican.
 */
export async function crearClienteServidor() {
  const { url, anonKey } = leerEntornoSupabase();
  const almacen = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
        } catch {
          // En un Server Component no se pueden escribir cookies; el middleware ya renueva la sesión.
        }
      },
    },
  });
}
