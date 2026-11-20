// Vuelve relativas las rutas "/_next/..." de la exportación estática (out/),
// para que el sitio funcione desde cualquier subcarpeta e incluso abriendo index.html directo.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = new URL('../out', import.meta.url).pathname;
let tocados = 0;
function recorrer(dir) {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) { recorrer(f); continue; }
    if (!/\.(html|js|css|txt)$/.test(n)) continue;
    const antes = readFileSync(f, 'utf8');
    let t = antes;
    if (n.endsWith('.css')) t = t.replace(/\/_next\/static\/media\//g, '../media/');
    else t = t.replace(/(?<![.\w])\/_next\//g, './_next/');
    if (t !== antes) { writeFileSync(f, t); tocados++; }
  }
}
recorrer(raiz);
console.log(`Rutas relativas aplicadas en ${tocados} archivos de out/`);
