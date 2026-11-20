import { expect, test, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { entrarCliente, entrarSuper, reiniciar } from './ayudas';
import { ID } from './ayudas-revdocs';

/** Capturas de Revisiones y Documentos: 1440 y 390 px, Clara y Oscura, sin scroll de lado. */
const DIR = process.env.CAPTURAS_DIR || '/tmp/claude-0/-home-user/fdcc695c-b830-5a5c-9507-b6535dccc24e/scratchpad/capturas-revdocs';
fs.mkdirSync(DIR, { recursive: true });

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
test.beforeEach(async () => { await reiniciar(undefined, 'revdocs'); });

test('cliente: revisiones, documentos y archivos', async ({ page }, info) => {
  await entrarCliente(page);
  await page.goto('/cliente/revisiones');
  await expect(page.getByText('Tienes 1 revisión por aprobar')).toBeVisible();
  await ambosTemas(page, info, '01-revisiones-lista');
  await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
  await expect(page.getByRole('button', { name: 'Apruebo', exact: true })).toBeVisible();
  await ambosTemas(page, info, '02-revision-detalle');
  await page.getByRole('button', { name: 'Apruebo', exact: true }).click();
  await expect(page.getByText('Esta respuesta no se puede deshacer')).toBeVisible();
  await ambosTemas(page, info, '03-confirmar-apruebo');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Pido cambios' }).click();
  await page.getByRole('button', { name: 'Enviar cambios' }).click();
  await ambosTemas(page, info, '04-pido-cambios-error');
  await page.keyboard.press('Escape');
  await page.goto(`/cliente/revisiones/${ID.revSprint1}`);
  await expect(page.getByText(/Aprobada por/)).toBeVisible();
  await ambosTemas(page, info, '05-revision-versiones');
  await page.goto('/cliente/documentos');
  await expect(page.getByText('Contrato de desarrollo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Versiones \(2\)/ }).click();
  await ambosTemas(page, info, '06-documentos');
  await page.goto('/cliente/archivos');
  await expect(page.getByText('logo-comercial.png')).toBeVisible();
  await ambosTemas(page, info, '07-archivos');
});

test('cliente sin permisos y estados', async ({ page }, info) => {
  await entrarCliente(page, 'equipo@cliente.test');
  await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
  await expect(page.getByText(/No tienes permiso para aprobar/)).toBeVisible();
  await ambosTemas(page, info, '08-equipo-sin-aprobar');
  await page.goto('/cliente/archivos');
  await expect(page.getByText('No tienes permiso para subir archivos')).toBeVisible();
  await ambosTemas(page, info, '09-equipo-sin-subir');
  await page.goto('/cliente/revisiones/99999999-9999-4999-8999-999999999999');
  await expect(page.getByText('No encontramos esa revisión')).toBeVisible();
  await ambosTemas(page, info, '10-revision-no-encontrada');
});

test('super admin: bandeja, detalle con evidencia, documentos y archivos', async ({ page }, info) => {
  await entrarSuper(page);
  await page.goto('/admin/aprobaciones');
  await expect(page.getByText('Sprint 2: Pagos y facturas')).toBeVisible();
  await ambosTemas(page, info, '11-bandeja');
  await page.getByRole('button', { name: 'Nueva revisión' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await ambosTemas(page, info, '12-nueva-revision');
  await page.keyboard.press('Escape');
  await page.goto(`/admin/revisiones/${ID.revSprint1}`);
  await expect(page.locator('[data-evidencia]').first()).toBeVisible();
  await ambosTemas(page, info, '13-detalle-evidencia');
  await page.goto(`/admin/revisiones/${ID.revBorrador}`);
  await expect(page.getByText('Borrador de la versión 1')).toBeVisible();
  await ambosTemas(page, info, '14-detalle-borrador');
  await page.goto('/admin/documentos');
  await expect(page.getByText('Contrato de desarrollo', { exact: true })).toBeVisible();
  await ambosTemas(page, info, '15-admin-documentos');
  await page.goto('/admin/archivos');
  await expect(page.getByText('logo-comercial.png')).toBeVisible();
  await ambosTemas(page, info, '16-admin-archivos');
});
