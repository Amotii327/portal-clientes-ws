import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { MOCK, entrarCliente, entrarSuper, estadoMock, reiniciar } from './ayudas';
import fs from 'node:fs';
import path from 'node:path';

/** Capturas del sprint 2 en 1440 y 390 px, Clara y Oscura. Carpeta: CAPTURAS_DIR. */
const DIR = process.env.CAPTURAS_DIR || '/tmp/claude-0/-home-user/fdcc695c-b830-5a5c-9507-b6535dccc24e/scratchpad/capturas-s2';
fs.mkdirSync(DIR, { recursive: true });
const A = '11111111-1111-4111-8111-111111111111';

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
const cargar = async (page: Page, url: string) => { await page.goto(url); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300); };

test.beforeEach(async () => { await reiniciar(); });

test('cliente: inicio con datos reales, proyecto con plan en propuesta y sin proyectos', async ({ page }, info) => {
  await entrarCliente(page);
  await expect(page.getByTestId('linea-de-tiempo')).toBeVisible();
  await ambosTemas(page, info, '01-cliente-inicio');
  await page.getByRole('tab', { name: 'Sitio web corporativo' }).click();
  await expect(page.getByRole('heading', { name: 'Sitio web corporativo' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await ambosTemas(page, info, '02-cliente-inicio-plan-en-propuesta');
  await fetch(`${MOCK}/__vaciar_proyectos`);
  await cargar(page, '/cliente/inicio');
  await expect(page.getByText('Todavía no tienes un proyecto')).toBeVisible();
  await ambosTemas(page, info, '03-cliente-inicio-vacio');
});

test('super admin: panel, proyectos y detalle de empresa', async ({ page }, info) => {
  await entrarSuper(page);
  await cargar(page, '/admin/panel');
  await expect(page.getByTestId('atencion')).toBeVisible();
  await ambosTemas(page, info, '04-admin-panel');
  await cargar(page, '/admin/proyectos');
  await expect(page.getByTestId('fila-proyecto').first()).toBeVisible();
  await ambosTemas(page, info, '05-admin-proyectos');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).first().click();
  await page.getByRole('button', { name: 'Crear proyecto' }).click();
  await ambosTemas(page, info, '06-admin-nuevo-proyecto-errores');
  await page.keyboard.press('Escape');
  await cargar(page, `/admin/clientes/${A}`);
  await expect(page.getByTestId('fila-proyecto-empresa').first()).toBeVisible();
  await ambosTemas(page, info, '07-admin-empresa-detalle');
  await page.getByRole('button', { name: 'Ver como el cliente' }).click();
  await ambosTemas(page, info, '08-admin-ver-como-dialogo');
});

test('super admin: detalle del proyecto, hito con retraso y consumo', async ({ page }, info) => {
  await entrarSuper(page);
  const s = await estadoMock();
  await cargar(page, `/admin/proyectos/${A}/${s.p1}`);
  await expect(page.getByTestId('consumo-equipo')).toBeVisible();
  await ambosTemas(page, info, '09-admin-proyecto-detalle');
  await page.getByRole('button', { name: 'Editar hito 7' }).click();
  await page.getByLabel('Fecha planeada').fill('2027-03-01');
  await page.getByLabel('¿De quién es el cambio?').selectOption('cliente');
  await page.getByRole('button', { name: 'Guardar hito' }).click();
  await ambosTemas(page, info, '10-admin-hito-retraso-errores');
});

test('super admin: plan de sprints y registro', async ({ page }, info) => {
  await entrarSuper(page);
  const s = await estadoMock();
  await cargar(page, `/admin/proyectos/${A}/${s.p2}/plan`);
  await expect(page.getByTestId('sprint').first()).toBeVisible();
  await ambosTemas(page, info, '11-admin-plan-propuesta');
  await page.getByRole('button', { name: 'Agregar sprint' }).click();
  await ambosTemas(page, info, '12-admin-plan-agregar-sprint');
  await page.keyboard.press('Escape');
  await cargar(page, `/admin/proyectos/${A}/${s.p1}/plan`);
  await expect(page.getByTestId('sprint').first()).toBeVisible();
  await ambosTemas(page, info, '13-admin-plan-publicado');
  await page.getByTestId('sprint').nth(1).getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Fin', { exact: true }).fill('2027-01-01');
  await page.getByRole('button', { name: 'Guardar sprint' }).click();
  await ambosTemas(page, info, '14-admin-plan-editar-motivo');
  await page.keyboard.press('Escape');
  await cargar(page, '/admin/registro');
  await ambosTemas(page, info, '15-admin-registro');
});

test('ver como el cliente: franja y solo lectura', async ({ page }, info) => {
  await entrarSuper(page);
  await cargar(page, `/admin/clientes/${A}`);
  await page.getByRole('button', { name: 'Ver como el cliente' }).click();
  await page.getByRole('button', { name: 'Empezar a mirar' }).click();
  await expect(page.getByTestId('franja-ver-como')).toBeVisible();
  await expect(page.getByTestId('linea-de-tiempo')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await ambosTemas(page, info, '16-ver-como-inicio');
});
