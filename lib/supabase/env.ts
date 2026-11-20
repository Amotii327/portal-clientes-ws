/**
 * Variables de entorno de Supabase. Se leen de `.env.local` (local) o del gestor de secretos de
 * Coolify (VPS). Aquí NUNCA hay valores reales: ver `.env.example`.
 * Solo se usan las dos variables públicas; la llave de sistema (service role) no se usa en esta app
 * salvo en el módulo `notificaciones` (sprint 6).
 */
export function leerEntornoSupabase(): { url: string; anonKey: string } {
  // process.env.NEXT_PUBLIC_* debe escribirse completo para que Next lo inserte en el navegador.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. Copia .env.example a .env.local y completa los valores.',
    );
  }
  return { url, anonKey };
}
