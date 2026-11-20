import { expect, test, type Page } from '@playwright/test';
import { APP, CLAVE, CODIGO, MOCK, abrirSesion, entrarCliente, entrarSuper, estadoMock, reiniciar } from './ayudas';

const A = '11111111-1111-4111-8111-111111111111';
test.beforeEach(async () => { await reiniciar(); });

async function crearEmpresa(page: Page, datos: { nombre?: string; nit?: string; admin?: string } = {}) {
  await page.getByRole('button', { name: 'Crear empresa' }).first().click();
  await page.getByLabel('Nombre de la empresa').fill(datos.nombre ?? 'Taller Nuevo S.A.S.');
  await page.getByLabel('Razón social').fill('Taller Nuevo S.A.S.');
  await page.getByLabel('NIT', { exact: true }).fill(datos.nit ?? '901234567-8');
  await page.getByLabel('Correo para facturas').fill('facturas@taller-nuevo.test');
  await page.getByLabel('Correo del primer administrador').fill(datos.admin ?? 'jefe@taller-nuevo.test');
  await page.getByRole('button', { name: 'Crear empresa', exact: true }).click();
}

test.describe('Super admin: empresas', () => {
  test('lista las empresas con su estado', async ({ page }) => {
    await entrarSuper(page);
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Comercial Ejemplo S\.A\.S\..*Activa/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Servicios Demo Ltda\..*Pausada/ })).toBeVisible();
    await expect(page.getByText('Zona del super administrador')).toBeVisible();
  });

  test('crear empresa valida los campos', async ({ page }) => {
    await entrarSuper(page);
    await page.getByRole('button', { name: 'Crear empresa' }).first().click();
    await page.getByRole('button', { name: 'Crear empresa', exact: true }).click();
    await expect(page.getByText('Escribe el nombre de la empresa.')).toBeVisible();
    await expect(page.getByText('Escribe la razón social.')).toBeVisible();
    await expect(page.getByText('Escribe el NIT.')).toBeVisible();
    await expect(page.getByText('Escribe un correo válido.')).toHaveCount(2);
  });

  test('crear empresa con su primer admin: enlace solo en desarrollo y el admin puede activarse', async ({ page, browser }) => {
    await entrarSuper(page);
    await crearEmpresa(page);
    await expect(page.getByTestId('resultado-invitacion')).toContainText('jefe@taller-nuevo.test');
    await expect(page.getByText('Solo desarrollo')).toBeVisible();
    const enlace = (await page.getByTestId('enlace-dev').innerText()).trim();
    const { ultimoToken } = await estadoMock();
    expect(enlace).toBe(`${APP}/activar?token=${ultimoToken}`);
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByRole('row', { name: /Taller Nuevo S\.A\.S\..*Activa/ })).toBeVisible();

    // la persona invitada abre el enlace y queda como admin de su empresa
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto(enlace);
    await p2.getByLabel('Correo').fill('jefe@taller-nuevo.test');
    await p2.getByLabel('Crea tu contraseña').fill(CLAVE);
    await p2.getByLabel('Repite tu contraseña').fill(CLAVE);
    await p2.getByRole('button', { name: 'Continuar' }).click();
    await fetch(`${MOCK}/__confirmar?correo=jefe@taller-nuevo.test`);
    await p2.getByRole('button', { name: 'Ya confirmé mi correo' }).click();
    await p2.getByLabel('Nombre completo').fill('Jefa del Taller');
    await p2.getByRole('checkbox').check();
    await p2.getByRole('button', { name: 'Activar mi cuenta' }).click();
    // D-014: el administrador de la empresa crea su código de 6 dígitos antes de entrar
    await expect(p2).toHaveURL(/\/verificar/);
    await p2.getByRole('button', { name: 'Empezar' }).click();
    await p2.getByLabel('Código de 6 dígitos').fill(CODIGO);
    await p2.getByRole('button', { name: 'Verificar y entrar' }).click();
    await expect(p2).toHaveURL(/\/cliente\/inicio/);
    await expect(p2.getByRole('navigation', { name: 'Menú principal' }).getByText('Mi equipo')).toBeVisible();
    await expect(p2.getByText('Taller Nuevo S.A.S.').first()).toBeVisible();
    await ctx.close();
  });

  test('NIT repetido: mensaje claro', async ({ page }) => {
    await entrarSuper(page);
    await crearEmpresa(page, { nit: '900123456-7' });
    await expect(page.getByText('Ya existe una empresa con ese NIT.')).toBeVisible();
  });

  test('pausar con motivo y reactivar', async ({ page }) => {
    await entrarSuper(page);
    const fila = page.getByRole('row', { name: /Comercial Ejemplo/ });
    await fila.getByRole('button', { name: 'Pausar' }).click();
    await page.getByLabel('Motivo (opcional)').fill('Pago pendiente');
    await page.getByRole('button', { name: 'Sí, pausar' }).click();
    await expect(fila.getByText('Pausada')).toBeVisible();
    expect((await estadoMock()).empresas.find((e: { id: string }) => e.id === A).motivo_pausa).toBe('Pago pendiente');
    await fila.getByRole('button', { name: 'Reactivar' }).click();
    await expect(fila.getByText('Activa')).toBeVisible();
  });

  test('cancelar la pausa no cambia nada', async ({ page }) => {
    await entrarSuper(page);
    await page.getByRole('row', { name: /Comercial Ejemplo/ }).getByRole('button', { name: 'Pausar' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('row', { name: /Comercial Ejemplo/ }).getByText('Activa')).toBeVisible();
  });
});

test.describe('Super admin: detalle de una empresa', () => {
  test('ve personas e invitaciones, bloquea, quita y bloquea en todo el portal', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await entrarSuper(page);
    await page.getByRole('row', { name: /Comercial Ejemplo/ }).getByRole('link', { name: 'Ver' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/clientes/${A}`));
    await expect(page.getByRole('heading', { name: 'Comercial Ejemplo S.A.S.' })).toBeVisible();
    await expect(page.getByText('facturas@comercial-ejemplo.test')).toBeVisible();
    const fila = (n: string) => page.getByRole('row', { name: new RegExp(n) });
    await expect(fila('Admina Prueba')).toContainText('Administrador');
    await expect(fila('Persona Quitada')).toContainText('Quitada');
    await expect(fila('Persona Bloqueada')).toContainText('Bloqueada');
    await expect(page.getByTestId('fila-invitacion')).toHaveCount(4);
    await expect(page.getByTestId('fila-invitacion').filter({ hasText: 'vencido@cliente.test' })).toContainText('Vencida');

    // bloquear en la empresa
    await fila('Equipo Uno').getByRole('button', { name: 'Bloquear', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, bloquear', exact: true }).click();
    await expect(fila('Equipo Uno')).toContainText('Bloqueada');
    // bloqueo global
    await fila('Equipo Con Dinero').getByRole('button', { name: 'Bloqueo global' }).click();
    await page.getByRole('button', { name: 'Sí, bloquear en todo el portal' }).click();
    await expect(fila('Equipo Con Dinero')).toContainText('Bloqueo global');
    // quitar
    await fila('Admina Prueba').getByRole('button', { name: 'Quitar' }).click();
    await page.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(fila('Admina Prueba')).toContainText('Quitada');

    // el efecto se ve del lado de cada persona
    for (const [correo, estado] of [['equipo@cliente.test', 'miembro_bloqueado'], ['equipo-dinero@cliente.test', 'usuario_bloqueado'], ['admin@cliente.test', 'miembro_quitado']]) {
      const ctx = await browser.newContext({ baseURL: APP });
      const p = await ctx.newPage();
      await abrirSesion(p, correo);
      await expect(p.locator(`[data-estado-acceso="${estado}"]`)).toBeVisible();
      await ctx.close();
    }
  });

  test('desbloquear a alguien devuelve el acceso', async ({ page, browser }) => {
    await entrarSuper(page);
    await page.goto(`/admin/clientes/${A}`);
    const fila = page.getByRole('row', { name: /Persona Bloqueada/ });
    await fila.getByRole('button', { name: 'Desbloquear' }).click();
    await page.getByRole('button', { name: 'Sí, desbloquear' }).click();
    await expect(fila).toContainText('Activa');
    const ctx = await browser.newContext({ baseURL: APP });
    const p = await ctx.newPage();
    await entrarCliente(p, 'bloqueado@cliente.test');
    await ctx.close();
  });

  test('invitar con rol de administrador muestra el enlace de desarrollo', async ({ page }) => {
    await entrarSuper(page);
    await page.goto(`/admin/clientes/${A}`);
    await page.getByRole('button', { name: 'Invitar', exact: true }).click();
    await page.getByLabel('Correo').fill('segundo-admin@cliente.test');
    await page.getByLabel('Rol').selectOption('admin_cliente');
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Solo desarrollo')).toBeVisible();
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByTestId('fila-invitacion').filter({ hasText: 'segundo-admin@cliente.test' })).toContainText('Administrador');
  });

  test('cancelar una invitación pendiente, con confirmación', async ({ page }) => {
    await entrarSuper(page);
    await page.goto(`/admin/clientes/${A}`);
    const fila = page.getByTestId('fila-invitacion').filter({ hasText: 'otro@cliente.test' });
    await fila.getByRole('button', { name: 'Cancelar invitación' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar invitación' }).click();
    await expect(page.getByText('Invitación cancelada.')).toBeVisible();
    await expect(page.getByTestId('fila-invitacion')).toHaveCount(3);
  });

  test('una empresa que no existe se explica', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/clientes/99999999-9999-4999-8999-999999999999');
    await expect(page.getByText('No encontramos esa empresa.')).toBeVisible();
    await page.goto('/admin/clientes/no-es-un-id');
    await expect(page.getByText('No encontramos esa empresa.')).toBeVisible();
  });

  test('2FA: un código incorrecto no da acceso a la zona del super admin', async ({ page }) => {
    await abrirSesion(page, 'super@websourcing.test');
    await page.getByLabel('Código de 6 dígitos').fill('654321');
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    await expect(page.getByText('Ese código no es correcto')).toBeVisible();
    await page.goto('/admin/clientes');
    await expect(page).toHaveURL(/\/verificar/);
  });
});
