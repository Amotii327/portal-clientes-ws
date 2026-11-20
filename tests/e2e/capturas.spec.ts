import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { CODIGO, abrirSesion, entrar, entrarCliente, entrarSuper, reiniciar } from './ayudas';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Capturas para la revisión de pantallas (listas-de-chequeo/revision-de-pantallas.md):
 * cada pantalla clave en 1440 px y 390 px, tema Clara y Oscura, comprobando que no hay scroll de lado.
 * Carpeta: CAPTURAS_DIR (por defecto la del scratchpad de la sesión).
 */
const DIR = process.env.CAPTURAS_DIR || '/tmp/claude-0/-home-user/fdcc695c-b830-5a5c-9507-b6535dccc24e/scratchpad/capturas-s1';
fs.mkdirSync(DIR, { recursive: true });

async function sinScrollDeLado(page: Page, etiqueta: string) {
  const r = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
  expect(r.ancho, `scroll de lado en ${etiqueta}`).toBeLessThanOrEqual(r.ventana);
}

async function ambosTemas(page: Page, info: TestInfo, nombre: string) {
  const vista = info.project.name.replace('capturas-', '');
  for (const [tema, attr] of [['clara', 'light'], ['oscura', 'dark']] as const) {
    await page.evaluate((a) => { document.documentElement.dataset.theme = a; }, attr);
    await page.waitForTimeout(150);
    await sinScrollDeLado(page, `${nombre} ${vista} ${tema}`);
    await page.screenshot({ path: path.join(DIR, `${vista}_${tema}_${nombre}.png`), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
}

test.beforeEach(async () => { await reiniciar(); });

test('entrada: entrar, error, recuperar', async ({ page }, info) => {
  await page.goto('/entrar');
  await ambosTemas(page, info, '01-entrar');
  await page.getByLabel('Correo').fill('admin@cliente.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('mala-clave-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Correo o contraseña incorrectos')).toBeVisible();
  await ambosTemas(page, info, '02-entrar-error');
  await page.goto('/recuperar');
  await page.getByLabel('Correo').fill('admin@cliente.test');
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await ambosTemas(page, info, '03-recuperar-enviado');
});

test('activar invitación', async ({ page, browser }, info) => {
  await page.goto('/activar?token=tok-valido-123');
  await expect(page.getByRole('heading', { name: 'Activa tu cuenta' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click(); // muestra los errores de validación
  await ambosTemas(page, info, '04-activar-crear');
  await page.goto('/activar');
  await ambosTemas(page, info, '05-activar-sin-enlace');
  const ctx = await browser.newContext({ ...info.project.use, baseURL: 'http://127.0.0.1:3100' });
  const p = await ctx.newPage();
  await abrirSesion(p, 'existente@cliente.test');
  await p.goto('/activar?token=tok-confirmado-777');
  await expect(p.getByRole('heading', { name: 'Cuéntanos quién eres' })).toBeVisible();
  await p.getByText('Leer la política de tratamiento de datos').click();
  await ambosTemas(p, info, '06-activar-completar');
  await ctx.close();
});

test('código adicional (2FA)', async ({ page }, info) => {
  await entrar(page, 'super-nuevo@websourcing.test');
  await expect(page.getByRole('heading', { name: 'Activa tu código de seguridad' })).toBeVisible();
  await ambosTemas(page, info, '07-2fa-explicar');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.getByAltText('Código QR para tu app de verificación')).toBeVisible();
  await ambosTemas(page, info, '08-2fa-qr');
  await page.context().clearCookies();
  await entrar(page, 'super@websourcing.test');
  await expect(page.getByRole('heading', { name: 'Código de verificación' })).toBeVisible();
  await page.getByLabel('Código de 6 dígitos').fill('000000');
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await expect(page.getByText('Ese código no es correcto')).toBeVisible();
  await ambosTemas(page, info, '09-2fa-codigo-error');
});

test('estados de acceso', async ({ page, browser }, info) => {
  for (const [correo, nombre] of [['pausada@servicios.test', '10-estado-empresa-pausada'], ['quitado@cliente.test', '11-estado-quitado'], ['bloqueado@cliente.test', '12-estado-bloqueado'], ['sinmembresia@cliente.test', '13-estado-sin-activar']] as const) {
    const ctx = await browser.newContext({ ...info.project.use, baseURL: 'http://127.0.0.1:3100' });
    const p = await ctx.newPage();
    await abrirSesion(p, correo);
    await expect(p.locator('[data-estado-acceso]')).toBeVisible();
    await ambosTemas(p, info, nombre);
    await ctx.close();
  }
  expect(page).toBeTruthy();
});

test('zona del cliente (admin)', async ({ page }, info) => {
  await entrarCliente(page);
  await ambosTemas(page, info, '14-cliente-inicio-muestra');
  if (info.project.name === 'capturas-390') {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await ambosTemas(page, info, '15-menu-celular');
    await page.keyboard.press('Escape');
  }
  await page.goto('/cliente/equipo');
  await expect(page.getByTestId('miembro').first()).toBeVisible();
  await ambosTemas(page, info, '16-mi-equipo');
  await page.getByRole('button', { name: 'Invitar a alguien' }).click();
  await ambosTemas(page, info, '17-mi-equipo-invitar');
  await page.getByLabel('Correo').fill('nueva@cliente.test');
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByTestId('resultado-invitacion')).toBeVisible();
  await ambosTemas(page, info, '18-mi-equipo-invitacion-creada');
  await page.keyboard.press('Escape');
  await page.goto('/cliente/facturacion');
  await expect(page.getByLabel('NIT')).toHaveValue('900123456-7');
  await ambosTemas(page, info, '19-facturacion');
  await page.getByLabel('NIT').fill('x');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await ambosTemas(page, info, '20-facturacion-errores');
});

test('sin permiso (equipo)', async ({ page }, info) => {
  await entrarCliente(page, 'equipo@cliente.test');
  await page.goto('/cliente/equipo');
  await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
  await ambosTemas(page, info, '21-sin-permiso');
});

test('zona del super admin', async ({ page }, info) => {
  await entrarSuper(page);
  await expect(page.getByTestId('fila-empresa').first()).toBeVisible();
  await ambosTemas(page, info, '22-admin-clientes');
  await page.getByRole('button', { name: 'Crear empresa' }).first().click();
  await ambosTemas(page, info, '23-admin-crear-empresa');
  await page.getByLabel('Nombre de la empresa').fill('Taller Nuevo S.A.S.');
  await page.getByLabel('Razón social').fill('Taller Nuevo S.A.S.');
  await page.getByLabel('NIT', { exact: true }).fill('901234567-8');
  await page.getByLabel('Correo para facturas').fill('facturas@taller-nuevo.test');
  await page.getByLabel('Correo del primer administrador').fill('jefe@taller-nuevo.test');
  await page.getByRole('button', { name: 'Crear empresa', exact: true }).click();
  await expect(page.getByTestId('enlace-dev')).toBeVisible();
  await ambosTemas(page, info, '24-admin-empresa-creada-enlace-dev');
  await page.keyboard.press('Escape');
  await page.goto('/admin/clientes/11111111-1111-4111-8111-111111111111');
  await expect(page.getByTestId('fila-miembro').first()).toBeVisible();
  await ambosTemas(page, info, '25-admin-detalle-empresa');
  await page.getByRole('row', { name: /Equipo Uno/ }).getByRole('button', { name: 'Quitar' }).click();
  await ambosTemas(page, info, '26-admin-confirmar-quitar');
  await page.keyboard.press('Escape');
  await page.goto('/admin/panel');
  await expect(page.getByText('Disponible en el próximo sprint')).toBeVisible();
  await ambosTemas(page, info, '27-admin-panel-muestra');
  expect(CODIGO).toBe('123456');
});
