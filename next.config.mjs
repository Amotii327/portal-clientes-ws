/** Exportación estática: genera la carpeta `out/` para abrirla como página web sin servidor.
 *  Todo el prototipo vive en una sola página con rutas por "#" (ver lib/router.tsx),
 *  y después de compilar, scripts/relativizar.mjs vuelve relativas las rutas de los recursos
 *  (next/font no acepta un assetPrefix relativo), así funciona desde la raíz o desde una subcarpeta. */
/** Con NEXT_OUTPUT=server (script `build:servidor`) se compila como aplicación con servidor, que es la
 *  que necesita el middleware de sesión de Supabase (lib/supabase/middleware.ts). El middleware NO
 *  funciona con `output: 'export'`. Por defecto se mantiene la exportación del prototipo aprobado. */
/** Dos modos que conviven sin pisarse (decisión de Desarrollo, sprint 1):
 *  - Prototipo (por defecto, `npm run build`): solo cuentan los archivos `page.proto.tsx`.
 *  - App real (`NEXT_OUTPUT=server`, `npm run build:servidor`): solo cuentan los `*.servidor.tsx`
 *    (páginas, layouts y rutas con Supabase). Cada modo compila en su propia carpeta, así uno no borra al otro.
 *  Los archivos normales (`layout.tsx`, componentes, `lib/`) se comparten. */
const servidor = process.env.NEXT_OUTPUT === 'server';
const nextConfig = {
  output: servidor ? undefined : 'export',
  distDir: process.env.NEXT_DIST_DIR || (servidor ? '.next-servidor' : '.next'),
  pageExtensions: servidor ? ['tsx', 'ts', 'servidor.tsx', 'servidor.ts'] : ['tsx', 'ts', 'proto.tsx', 'proto.ts'],
  env: { NEXT_PUBLIC_MODO: servidor ? 'servidor' : 'prototipo' },
  ...(servidor && {
    async headers() {
      return [
        // El enlace de invitación lleva un token: que no viaje a otros sitios en el encabezado Referer.
        { source: '/activar', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'no-store' }] },
        { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'DENY' }] },
      ];
    },
  }),
  trailingSlash: !servidor,
  images: { unoptimized: true },
  reactStrictMode: true,
  devIndicators: false, // el indicador de desarrollo no debe tapar nada en las capturas
};
export default nextConfig;
