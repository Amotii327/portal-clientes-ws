import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { entrarCliente, entrarSuper, reiniciar } from './ayudas';
import fs from 'node:fs';
import path from 'node:path';

/** Capturas del Módulo 4 (Dinero): 1440 y 390 px, Clara y Oscura, sin scroll de lado. */
const DIR = process.env.CAPTURAS_DIR || '/tmp/claude-0/-home-user/fdcc695c-b830-5a5c-9507-b6535dccc24e/scratchpad/capturas-dinero';
fs.mkdirSync(DIR, { recursive: true });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function ambosTemas(page: Page, info: TestInfo, nombre: string) {
  const vista = info.project.name.replace('capturas-', '');
  for (const [tema, attr] of [['clara', 'light'], ['oscura', 'dark']] as const) {
    await page.evaluate((a) => { document.documentElement.dataset.theme = a; }, attr);
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    expect(r.ancho, `scroll de lado en ${nombre} ${vista} ${tema}`).toBeLessThanOrEqual(r.ventana);
    await page.screenshot({ path: path.join(DIR, `${vista}_${tema}_${nombre}.png`), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
}

test.beforeEach(async () => { await reiniciar(undefined, 'dinero'); });

test('dinero del cliente', async ({ page }, info) => {
  await entrarCliente(page);
  await page.goto('/cliente/dinero');
  await expect(page.getByTestId('tarjetas-contrato')).toBeVisible();
  await ambosTemas(page, info, '01-cliente-dinero');
  const boton = page.getByRole('button', { name: 'Subir comprobante' }).first();
  await boton.click();
  await expect(page.getByRole('dialog', { name: 'Subir comprobante de pago' })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar comprobante' }).click();
  await ambosTemas(page, info, '02-cliente-subir-comprobante-errores');
  await page.keyboard.press('Escape');
  await page.getByLabel('Proyecto').selectOption({ label: 'Sitio web corporativo' });
  await expect(page.getByRole('heading', { name: 'Aún no hay contrato cargado' })).toBeVisible();
  await ambosTemas(page, info, '03-cliente-sin-contrato');
});

test('comprobante rechazado y en revisión', async ({ page, browser }, info) => {
  await entrarCliente(page);
  await page.goto('/cliente/dinero');
  await page.getByRole('button', { name: 'Subir comprobante' }).first().click();
  await page.getByLabel('Comprobante (PDF o imagen)').setInputFiles({ name: 'c.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: 'Enviar comprobante' }).click();
  await expect(page.getByTestId('comprobante').first()).toContainText('En revisión');
  await ambosTemas(page, info, '04-cliente-en-revision');
  const ctx = await browser.newContext({ ...info.project.use });
  const sup = await ctx.newPage();
  await entrarSuper(sup);
  await sup.goto('/admin/finanzas');
  await expect(sup.getByTestId('comprobante-pendiente')).toHaveCount(1);
  await ambosTemas(sup, info, '05-admin-bandeja');
  await sup.getByRole('button', { name: 'Rechazar' }).click();
  await sup.getByLabel('Motivo').fill('El valor del comprobante no coincide con el pago.');
  await ambosTemas(sup, info, '06-admin-rechazar');
  await sup.getByRole('button', { name: 'Rechazar', exact: true }).last().click();
  await ctx.close();
  await page.reload();
  await expect(page.locator('[data-testid="motivo-rechazo"]:visible').first()).toBeVisible();
  await ambosTemas(page, info, '07-cliente-rechazado');
});

test('finanzas del super admin', async ({ page }, info) => {
  await entrarSuper(page);
  await page.goto('/admin/finanzas');
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Contratos y pagos' }).click();
  await expect(page.getByTestId('tarjetas-contrato')).toBeVisible();
  await ambosTemas(page, info, '08-admin-contrato-plan');
  await page.getByRole('button', { name: 'Agregar cuota' }).click();
  await ambosTemas(page, info, '09-admin-agregar-cuota');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Registrar abono' }).click();
  await ambosTemas(page, info, '10-admin-registrar-abono');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Ingresos' }).click();
  await expect(page.getByTestId('ingresos')).toBeVisible();
  await ambosTemas(page, info, '11-admin-ingresos');
});
