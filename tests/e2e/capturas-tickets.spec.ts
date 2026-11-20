import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { entrarCliente, entrarSuper, reiniciar } from './ayudas';
import fs from 'node:fs';
import path from 'node:path';

/** Capturas de Tickets y Mantenimiento: 1440 y 390 px, tema Clara y Oscura, sin scroll de lado. */
const DIR = process.env.CAPTURAS_DIR || '/tmp/claude-0/-home-user/fdcc695c-b830-5a5c-9507-b6535dccc24e/scratchpad/capturas-tickets';
fs.mkdirSync(DIR, { recursive: true });

async function ambosTemas(page: Page, info: TestInfo, nombre: string) {
  const vista = info.project.name.replace('capturas-', '');
  for (const [tema, attr] of [['clara', 'light'], ['oscura', 'dark']] as const) {
    await page.evaluate((a) => { document.documentElement.dataset.theme = a; }, attr);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    expect(r.ancho, `scroll de lado en ${nombre} ${vista} ${tema}`).toBeLessThanOrEqual(r.ventana);
    await page.screenshot({ path: path.join(DIR, `${vista}_${tema}_${nombre}.png`), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
}
const ir = async (page: Page, ruta: string) => { await page.goto(ruta); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300); };
const abrirTicket = async (page: Page, titulo: string) => { await page.getByRole('link', { name: new RegExp(titulo) }).click(); await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(500); };

test.beforeEach(async () => { await reiniciar(); });

test('cliente: tickets, nuevo, detalle, cobro y mantenimiento', async ({ page }, info) => {
  test.setTimeout(180_000);
  await entrarCliente(page);
  await ir(page, '/cliente/tickets');
  await expect(page.getByTestId('ticket').first()).toBeVisible();
  await ambosTemas(page, info, '10-cliente-tickets');
  await ir(page, '/cliente/tickets/nuevo');
  await page.getByText('Acceso', { exact: true }).click();
  await ambosTemas(page, info, '11-cliente-ticket-nuevo');
  await ir(page, '/cliente/tickets');
  await abrirTicket(page, 'No llega el correo de confirmación');
  await ambosTemas(page, info, '12-cliente-ticket-detalle');
  await ir(page, '/cliente/tickets');
  await page.getByRole('tab', { name: 'Todos' }).click();
  await abrirTicket(page, 'Nuevo módulo de cupones');
  await ambosTemas(page, info, '13-cliente-cobro');
  await ir(page, '/cliente/mantenimiento');
  await expect(page.getByTestId('bolsa')).toBeVisible();
  await ambosTemas(page, info, '14-cliente-mantenimiento');
});

test('super admin: bandeja, detalle, mantenimiento y configuración', async ({ page }, info) => {
  test.setTimeout(180_000);
  await entrarSuper(page);
  await ir(page, '/admin/tickets');
  await expect(page.getByTestId('ticket').first()).toBeVisible();
  await ambosTemas(page, info, '20-admin-bandeja');
  await abrirTicket(page, 'Agregar exportación a Excel');
  await ambosTemas(page, info, '21-admin-ticket-detalle');
  await ir(page, '/admin/mantenimiento');
  await expect(page.getByTestId('empresa-mant').first()).toBeVisible();
  await ambosTemas(page, info, '22-admin-mantenimiento');
  await page.getByTestId('empresa-mant').filter({ hasText: 'Comercial Ejemplo' }).getByRole('link', { name: 'Configurar' }).click();
  await expect(page.getByTestId('formulario-plan')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await ambosTemas(page, info, '23-admin-mantenimiento-config');
});
