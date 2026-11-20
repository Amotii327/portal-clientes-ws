import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente con la CLAVE DE SISTEMA (service role). Es el ÚNICO lugar del portal que la usa, y solo para:
 *  - el despachador de avisos (lib/servidor/avisos/despachar.ts) y las tareas diarias,
 *  - el freno de intentos de acceso (lib/servidor/entrar.ts).
 * En ambos casos solo llama a funciones de la base concedidas a service_role (reclamar_avisos, marcar_aviso,
 * freno_acceso_*, ...). La llave viene SOLO de la variable de entorno SUPABASE_SERVICE_ROLE_KEY (gestor de secretos de
 * Coolify); nunca del repositorio, nunca al navegador, nunca a los registros.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteSistema = SupabaseClient<any, any, any>;

export function sistemaConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function crearClienteSistema(): ClienteSistema {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  return createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
