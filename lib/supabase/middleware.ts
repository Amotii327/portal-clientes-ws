import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './database.types';
import { leerEntornoSupabase } from './env';

/**
 * Rutas que exigen sesión. Está vacío a propósito: las pantallas reales las define Frontend
 * (sprint 1, historia de login). Ejemplo: ['/app', '/admin'].
 * Las rutas que NO deben pedir sesión (entrar, activar cuenta, recuperar contraseña) simplemente no van aquí.
 */
export const RUTAS_PRIVADAS: string[] = ['/admin', '/cliente'];
export const RUTA_ENTRAR = '/entrar';

/**
 * Renueva la sesión de Supabase en cada petición y reescribe las cookies.
 * Usa getUser() (valida el token con Auth), nunca getSession() en el servidor.
 * IMPORTANTE: el permiso real NO sale de aquí. Esto solo decide si hay sesión; qué ve cada quien
 * lo deciden las reglas RLS de la base (y la función mi_contexto()).
 */
export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  // Sin variables (por ejemplo el prototipo estático) no se hace nada.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return respuesta;
  }
  const { url, anonKey } = leerEntornoSupabase();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  const esPrivada = RUTAS_PRIVADAS.some((r) => request.nextUrl.pathname === r || request.nextUrl.pathname.startsWith(r + '/'));
  if (!data.user && esPrivada) {
    const destino = request.nextUrl.clone();
    destino.pathname = RUTA_ENTRAR;
    destino.search = '';
    const redireccion = NextResponse.redirect(destino);
    respuesta.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
    return redireccion;
  }
  return respuesta;
}
