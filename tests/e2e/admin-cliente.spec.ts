import { expect, test } from '@playwright/test';
import { abrirSesion, entrarCliente, estadoMock, reiniciar } from './ayudas';

test.beforeEach(async () => { await reiniciar(); });

test.describe('Admin del cliente: Mi equipo', () => {
  test('lista a su equipo, a los quitados aparte y no muestra a otras empresas', async ({ page }) => {
    await entrarCliente(page);
    await page.getByRole('link', { name: 'Mi equipo' }).first().click();
    await expect(page.getByRole('heading', { name: 'Mi equipo' })).toBeVisible();
    const personas = page.getByTestId('miembro');
    await expect(personas.filter({ hasText: 'Equipo Uno' })).toBeVisible();
    await expect(personas.filter({ hasText: 'Equipo Con Dinero' })).toBeVisible();
    await expect(personas.filter({ hasText: 'Admina Prueba' })).toContainText('Solo Websourcing puede cambiar a un administrador');
    await expect(personas.filter({ hasText: 'Usuaria Pausada' })).toHaveCount(0);
    await expect(page.getByText('Personas que ya no están')).toBeVisible();
    await expect(page.getByText('Persona Quitada')).toBeVisible();
    await expect(page.getByTestId('invitacion').first()).toBeVisible();
  });

  test('prender "ver dinero" se guarda y la persona ve el módulo Dinero', async ({ page, browser }) => {
    await entrarCliente(page);
    await page.goto('/cliente/equipo');
    const tarjeta = page.getByTestId('miembro').filter({ hasText: 'Equipo Uno' });
    const sw = tarjeta.getByRole('switch', { name: 'Ver contrato, pagos y facturas' });
    await expect(sw).not.toBeChecked();
    await sw.click();
    await expect(sw).toBeChecked();
    await expect(page.getByText('activado.')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('miembro').filter({ hasText: 'Equipo Uno' }).getByRole('switch', { name: 'Ver contrato, pagos y facturas' })).toBeChecked();
    const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const p = await ctx.newPage();
    await entrarCliente(p, 'equipo@cliente.test');
    await expect(p.getByRole('navigation', { name: 'Menú principal' }).getByText('Dinero', { exact: true })).toBeVisible();
    await ctx.close();
  });

  test('bloquear y desbloquear a alguien', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/equipo');
    const t = page.getByTestId('miembro').filter({ hasText: 'Equipo Uno' });
    await t.getByRole('button', { name: 'Bloquear' }).click();
    await page.getByRole('button', { name: 'Sí, bloquear' }).click();
    await expect(t).toContainText('Bloqueado');
    await t.getByRole('button', { name: 'Desbloquear' }).click();
    await page.getByRole('button', { name: 'Sí, desbloquear' }).click();
    await expect(t).toContainText('Activo');
  });

  test('quitar a alguien le corta el acceso y conserva el historial', async ({ page, browser }) => {
    await entrarCliente(page);
    await page.goto('/cliente/equipo');
    const t = page.getByTestId('miembro').filter({ hasText: 'Equipo Uno' });
    await t.getByRole('button', { name: 'Quitar del equipo' }).click();
    await page.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(page.getByTestId('miembro').filter({ hasText: 'Equipo Uno' })).toHaveCount(0);
    await expect(page.getByText('Salió el')).toHaveCount(2);
    const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const p = await ctx.newPage();
    await abrirSesion(p, 'equipo@cliente.test');
    await expect(p.locator('[data-estado-acceso="miembro_quitado"]')).toBeVisible();
    await ctx.close();
  });

  test('invitar: valida el correo y deja la invitación pendiente, sin mostrar enlace', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/equipo');
    await page.getByRole('button', { name: 'Invitar a alguien' }).click();
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Escribe un correo válido.')).toBeVisible();
    await page.getByLabel('Correo').fill('nueva@cliente.test');
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    const resultado = page.getByTestId('resultado-invitacion');
    await expect(resultado).toContainText('nueva@cliente.test');
    await expect(resultado).toContainText('saldrá en cuanto activemos el envío de correos');
    await expect(page.getByText('Solo desarrollo')).toHaveCount(0);
    await expect(page.getByTestId('enlace-dev')).toHaveCount(0);
    const { ultimoToken } = await estadoMock();
    expect(await page.content()).not.toContain(ultimoToken);
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByTestId('invitacion').filter({ hasText: 'nueva@cliente.test' })).toContainText('Pendiente');
  });

  test('invitar a quien ya está en el equipo da un mensaje claro', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/equipo');
    await page.getByRole('button', { name: 'Invitar a alguien' }).click();
    await page.getByLabel('Correo').fill('equipo@cliente.test');
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Esa persona ya hace parte de tu equipo.')).toBeVisible();
  });
});

test.describe('Admin del cliente: datos de facturación', () => {
  test('edita, valida y guarda', async ({ page }) => {
    await entrarCliente(page);
    await page.getByRole('link', { name: 'Datos de facturación' }).first().click();
    await expect(page.getByLabel('NIT')).toHaveValue('900123456-7');
    await page.getByLabel('NIT').fill('x');
    await page.getByLabel('Correo para facturas').fill('mal');
    await page.getByLabel('Razón social').fill('');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Escribe un NIT válido')).toBeVisible();
    await expect(page.getByText('Escribe un correo válido.')).toBeVisible();
    await expect(page.getByText('Escribe la razón social.')).toBeVisible();
    await page.getByLabel('Razón social').fill('Comercial Ejemplo y Cía. S.A.S.');
    await page.getByLabel('NIT').fill('900123456-8');
    await page.getByLabel('Correo para facturas').fill('contabilidad@comercial-ejemplo.test');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Datos de facturación guardados.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Razón social')).toHaveValue('Comercial Ejemplo y Cía. S.A.S.');
    await expect(page.getByLabel('NIT')).toHaveValue('900123456-8');
  });
});
