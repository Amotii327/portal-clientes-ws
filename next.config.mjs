/** Exportación estática: genera la carpeta `out/` para abrirla como página web sin servidor.
 *  Todo el prototipo vive en una sola página con rutas por "#" (ver lib/router.tsx),
 *  y después de compilar, scripts/relativizar.mjs vuelve relativas las rutas de los recursos
 *  (next/font no acepta un assetPrefix relativo), así funciona desde la raíz o desde una subcarpeta. */
/** Con NEXT_OUTPUT=server (script `build:servidor`) se compila como aplicación con servidor, que es la
 *  que necesita el middleware de sesión de Supabase (lib/supabase/middleware.ts). El middleware NO
 *  funciona con `output: 'export'`. Por defecto se mantiene la exportación del prototipo aprobado. */
const nextConfig = {
  output: process.env.NEXT_OUTPUT === 'server' ? undefined : 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
