import { expect, type Page } from '@playwright/test';

/** Puertos: PW_PUERTO (la app A; la B es el siguiente) y PW_MOCK_PUERTO (el Supabase simulado). Los mismos que lee playwright.config.ts. */
export const APP = `http://127.0.0.1:${Number(process.env.PW_PUERTO ?? 3100)}`;
export const APP_B = `http://127.0.0.1:${Number(process.env.PW_PUERTO ?? 3100) + 1}`;
export const MOCK = `http://127.0.0.1:${Number(process.env.PW_MOCK_PUERTO ?? 54399)}`;
export const CLAVE = 'ClaveSegura123';
export const CODIGO = '123456';

/** `perfil` elige los proyectos de ejemplo: 'base' (los del sprint 2) o 'revdocs' (los de las pruebas de revisiones y documentos). */
export async function reiniciar(config?: Record<string, unknown>, perfil: 'base' | 'revdocs' | 'dinero' = 'base') {
  await fetch(`${MOCK}/__reset?perfil=${perfil}`);
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

/** Entra como persona del cliente. El administrador pasa por el código de 6 dígitos (D-014: obligatorio por defecto). */
export async function entrarCliente(page: Page, correo = 'admin@cliente.test') {
  await entrar(page, correo);
  await page.waitForURL((u) => /^\/(verificar|cliente\/inicio)/.test(u.pathname));
  if (new URL(page.url()).pathname.startsWith('/verificar')) {
    await page.getByLabel('Código de 6 dígitos').fill(CODIGO);
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  }
  await expect(page).toHaveURL(/\/cliente\/inicio/);
  await page.waitForLoadState('networkidle');
}

/** Entra y espera a salir de la pantalla de entrar (para cuentas que no llegan al inicio normal). */
export async function abrirSesion(page: Page, correo: string) {
  await entrar(page, correo);
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
  await page.waitForLoadState('networkidle');
}
