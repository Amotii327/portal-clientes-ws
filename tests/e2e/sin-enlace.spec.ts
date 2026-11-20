import { expect, test, type Page } from '@playwright/test';
import { entrarSuper, estadoMock, reiniciar } from './ayudas';

// Servidor B: SIN MOSTRAR_ENLACE_INVITACION_DEV. El token de la invitación no puede llegar al navegador por ningún camino.
test.beforeEach(async () => { await reiniciar(); });

function vigilar(page: Page) {
  const textos: string[] = [];
  page.on('response', async (r) => {
    try {
      const tipo = r.headers()['content-type'] ?? '';
      if (/json|text|html|javascript/.test(tipo) && r.url().startsWith('http://127.0.0.1:3101')) textos.push(await r.text());
    } catch { /* respuestas sin cuerpo */ }
  });
  return textos;
}

test('crear empresa: sin enlace en pantalla y el token no viaja al navegador', async ({ page }) => {
  const textos = vigilar(page);
  await entrarSuper(page);
  await page.getByRole('button', { name: 'Crear empresa' }).first().click();
  await page.getByLabel('Nombre de la empresa').fill('Taller Privado S.A.S.');
  await page.getByLabel('Razón social').fill('Taller Privado S.A.S.');
  await page.getByLabel('NIT', { exact: true }).fill('902222222-1');
  await page.getByLabel('Correo para facturas').fill('facturas@taller-privado.test');
  await page.getByLabel('Correo del primer administrador').fill('jefe@taller-privado.test');
  const accion = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().startsWith('http://127.0.0.1:3101') && r.request().headers()['next-action'] !== undefined);
  await page.getByRole('button', { name: 'Crear empresa', exact: true }).click();
  await accion;
  await expect(page.getByTestId('resultado-invitacion')).toContainText('jefe@taller-privado.test');
  await expect(page.getByText('El envío de correos todavía no está conectado')).toBeVisible();
  await expect(page.getByText('Solo desarrollo')).toHaveCount(0);
  await expect(page.getByTestId('enlace-dev')).toHaveCount(0);
  const { ultimoToken } = await estadoMock();
  expect(ultimoToken).toMatch(/^tok-/);
  expect(await page.content()).not.toContain(ultimoToken);
  expect(textos.length).toBeGreaterThan(0);
  for (const t of textos) expect(t).not.toContain(ultimoToken);
  const guardado = await page.evaluate(() => JSON.stringify({ ...localStorage }) + document.cookie);
  expect(guardado).not.toContain(ultimoToken);
});

test('invitar desde el detalle tampoco expone el token', async ({ page }) => {
  const textos = vigilar(page);
  await entrarSuper(page);
  await page.goto('/admin/clientes/11111111-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Invitar', exact: true }).click();
  await page.getByLabel('Correo').fill('otro@cliente.test');
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByTestId('resultado-invitacion')).toBeVisible();
  const { ultimoToken } = await estadoMock();
  expect(await page.content()).not.toContain(ultimoToken);
  for (const t of textos) expect(t).not.toContain(ultimoToken);
});
