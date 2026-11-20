/** Exportación estática: genera la carpeta `out/` para abrirla como página web sin servidor.
 *  Todo el prototipo vive en una sola página con rutas por "#" (ver lib/router.tsx),
 *  y después de compilar, scripts/relativizar.mjs vuelve relativas las rutas de los recursos
 *  (next/font no acepta un assetPrefix relativo), así funciona desde la raíz o desde una subcarpeta. */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
