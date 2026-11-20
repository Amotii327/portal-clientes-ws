import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MOCK } from './ayudas';

/** IDs fijos de los datos de ejemplo (tests/mock-supabase/revdocs.mjs). */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ID = {
  revDiseno: id(21), revSprint1: id(22), revBorrador: id(23), revCambios: id(24), revB: id(25),
  archivoLogo: id(41), archivoTextos: id(42), archivoFotos: id(43),
};
export const EMPRESA_A = '11111111-1111-4111-8111-111111111111';

export async function darPermisos(correo: string, campos: Record<string, boolean>) {
  await fetch(`${MOCK}/__miembro`, { method: 'POST', body: JSON.stringify({ correo, campos }) });
}
export const estadoRD = async () => (await fetch(`${MOCK}/__revdocs`)).json();
export async function iniciarVerComo(rol: 'admin_cliente' | 'equipo', extra: Record<string, boolean> = {}) {
  await fetch(`${MOCK}/__ver_como`, { method: 'POST', body: JSON.stringify({ empresa_id: EMPRESA_A, rol, ...extra }) });
}

/** Un PNG mínimo válido (1x1). */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export function archivoGrande(bytes: number) {
  const ruta = path.join(os.tmpdir(), `grande-${bytes}.pdf`);
  const fd = fs.openSync(ruta, 'w'); fs.ftruncateSync(fd, bytes); fs.closeSync(fd);
  return ruta;
}

export async function textoVisible(page: Page) { return (await page.locator('body').innerText()).toLowerCase(); }
export async function sinIA(page: Page) {
  const t = await textoVisible(page);
  for (const p of ['inteligencia artificial', 'claude', 'agente', 'modelo de ia', 'openai', 'chatgpt']) expect(t, `menciona "${p}"`).not.toContain(p);
}
export const menu = (page: Page) => page.getByRole('navigation', { name: 'Menú principal' });
