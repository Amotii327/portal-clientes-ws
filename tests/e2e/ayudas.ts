import { expect, type Page } from '@playwright/test';

export const MOCK = `http://127.0.0.1:${process.env.MOCK_PUERTO || 54399}`;
export const CLAVE = 'ClaveSegura123';
export const CODIGO = '123456';

export async function reiniciar(config?: Record<string, unknown>) {
  await fetch(`${MOCK}/__reset`);
  if (config) await fetch(`${MOCK}/__config`, { method: 'POST', body: JSON.stringify(config) });
}
export const estadoMock = async () => (await fetch(`${MOCK}/__estado`)).json();

/** Entra por la pantalla de entrar, como lo haría una persona. */
export async function entrar(page: Page, correo: string, clave = CLAVE) {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

/** Entra como super admin con código adicional ya configurado. */
export async function entrarSuper(page: Page) {
  await entrar(page, 'super@websourcing.test');
  await expect(page).toHaveURL(/\/verificar/);
  await page.getByLabel('Código de 6 dígitos').fill(CODIGO);
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await expect(page).toHaveURL(/\/admin\/clientes/);
  await page.waitForLoadState('networkidle'); // en desarrollo, espera a que la pantalla termine de cargar antes de tocarla
}

export async function entrarCliente(page: Page, correo = 'admin@cliente.test') {
  await entrar(page, correo);
  await expect(page).toHaveURL(/\/cliente\/inicio/);
  await page.waitForLoadState('networkidle');
}

/** Entra y espera a salir de la pantalla de entrar (para cuentas que no llegan al inicio normal). */
export async function abrirSesion(page: Page, correo: string) {
  await entrar(page, correo);
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
  await page.waitForLoadState('networkidle');
}
