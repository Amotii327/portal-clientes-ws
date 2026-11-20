import { expect, test } from '@playwright/test';
import { abrirSesion, entrarCliente, entrarSuper, estadoMock, reiniciar } from './ayudas';

test.beforeEach(async () => { await reiniciar(); });

/** Next responde 307 o, si ya empezó a enviar, 200 con la orden de redirección (NEXT_REDIRECT) dentro de la respuesta. En ambos casos la pantalla no viaja. */
async function esRedireccionASinPermiso(r: import('@playwright/test').APIResponse, etiqueta: string, marca: string) {
  const cuerpo = await r.text();
  const destino = r.headers()['location'] ?? (cuerpo.match(/NEXT_REDIRECT|sin-permiso\?r=[^;"\\]*;307/) ? cuerpo.match(/sin-permiso\?r=[^;"\\]*/)?.[0] ?? '' : '');
  expect(destino, etiqueta).toContain('sin-permiso');
  expect(cuerpo, etiqueta).not.toContain(marca);
}

test.describe('Estados de miContexto()', () => {
  const casos: { correo: string; estado: string; titulo: RegExp; texto?: RegExp }[] = [
    { correo: 'pausada@servicios.test', estado: 'empresa_pausada', titulo: /Servicios Demo Ltda\. está en pausa/, texto: /No se ha borrado nada/ },
    { correo: 'quitado@cliente.test', estado: 'miembro_quitado', titulo: /Ya no tienes acceso a este portal/, texto: /Tu historial se conserva/ },
    { correo: 'bloqueado@cliente.test', estado: 'miembro_bloqueado', titulo: /Tu acceso está suspendido/ },
    { correo: 'global@cliente.test', estado: 'usuario_bloqueado', titulo: /Tu acceso está suspendido/ },
    { correo: 'sinmembresia@cliente.test', estado: 'sin_membresia', titulo: /Tu cuenta aún no está activada/, texto: /enlace del correo de invitación/ },
    { correo: 'sinperfil@cliente.test', estado: 'sin_perfil', titulo: /Tu cuenta aún no está activada/ },
  ];
  for (const c of casos) {
    test(`${c.estado}: mensaje amable, sin menú ni datos, con salida y contacto`, async ({ page }) => {
      await abrirSesion(page, c.correo);
      await expect(page.locator(`[data-estado-acceso="${c.estado}"]`)).toBeVisible();
      await expect(page.getByRole('heading', { name: c.titulo })).toBeVisible();
      if (c.texto) await expect(page.getByText(c.texto)).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Menú principal' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
      if (c.estado !== 'sin_membresia' && c.estado !== 'sin_perfil') await expect(page.getByRole('link', { name: 'Escribir al Equipo Websourcing' })).toBeVisible();
      // no hay forma de llegar a otras pantallas
      for (const ruta of ['/cliente/equipo', '/cliente/facturacion', '/admin/clientes']) {
        await page.goto(ruta);
        await expect(page.locator(`[data-estado-acceso="${c.estado}"]`)).toBeVisible();
      }
      await page.getByRole('button', { name: 'Cerrar sesión' }).click();
      await expect(page).toHaveURL(/\/entrar/);
    });
  }

  test('ningún mensaje menciona IA ni herramientas internas', async ({ page }) => {
    await abrirSesion(page, 'quitado@cliente.test');
    const texto = (await page.locator('body').innerText()).toLowerCase();
    for (const prohibido of ['inteligencia artificial', 'claude', 'agente', 'modelo de ia', 'openai']) expect(texto).not.toContain(prohibido);
    await expect(page.getByText('Equipo Websourcing').first()).toBeVisible();
  });

  test('una empresa pausada por el super admin corta el acceso en la siguiente pantalla', async ({ page, browser }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    const otra = await browser.newContext({ baseURL: `http://127.0.0.1:${process.env.PW_PUERTO ?? 3100}` });
    const sup = await otra.newPage();
    await entrarSuper(sup);
    await sup.getByRole('row', { name: /Comercial Ejemplo/ }).getByRole('button', { name: 'Pausar' }).click();
    await sup.getByRole('button', { name: 'Sí, pausar' }).click();
    await expect(sup.getByRole('row', { name: /Comercial Ejemplo/ }).getByText('Pausada')).toBeVisible();
    await otra.close();
    await page.goto('/cliente/inicio');
    await expect(page.getByRole('heading', { name: /Comercial Ejemplo S\.A\.S\. está en pausa/ })).toBeVisible();
    expect((await estadoMock()).empresas.find((e: { nombre: string }) => e.nombre.startsWith('Comercial')).estado).toBe('pausada');
  });
});

test.describe('Sin permiso', () => {
  test('equipo no entra a Mi equipo ni a facturación sin "ver dinero"', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByText('Mi equipo')).toHaveCount(0);
    await expect(menu.getByText('Datos de facturación')).toHaveCount(0);
    await expect(menu.getByText('Dinero', { exact: true })).toHaveCount(0);
    for (const ruta of ['/cliente/equipo', '/cliente/facturacion', '/cliente/dinero']) {
      await page.goto(ruta);
      await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
    }
  });

  test('equipo con "ver dinero" ve la facturación pero no puede cambiarla', async ({ page }) => {
    await entrarCliente(page, 'equipo-dinero@cliente.test');
    await page.goto('/cliente/facturacion');
    await expect(page.getByText('Solo lectura')).toBeVisible();
    await expect(page.getByLabel('Razón social')).toHaveValue('Comercial Ejemplo S.A.S.');
    await expect(page.getByLabel('Razón social')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
    await page.goto('/cliente/equipo');
    await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
  });

  test('el cliente no entra a la zona de Websourcing', async ({ page }) => {
    await entrarCliente(page);
    for (const ruta of ['/admin/clientes', '/admin/clientes/11111111-1111-4111-8111-111111111111', '/admin/panel']) {
      await page.goto(ruta);
      await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
      await expect(page.getByText('solo para el equipo de Websourcing')).toBeVisible();
    }
  });

  test('el super admin no entra a pantallas de cliente', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/cliente/equipo');
    await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
    await page.goto('/cliente/facturacion');
    await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
  });

  test('el SERVIDOR corta la ruta: redirige a Sin permiso sin enviar la pantalla', async ({ page }) => {
    const casos: [string, string, string][] = [
      ['admin@cliente.test', '/admin/clientes', 'Crear empresa'],
      ['admin@cliente.test', '/admin/panel', 'Panel'],
      ['equipo@cliente.test', '/cliente/equipo', 'Invitar a alguien'],
      ['equipo@cliente.test', '/cliente/facturacion', 'Razón social'],
    ];
    for (const [correo, ruta, marca] of casos) {
      await page.context().clearCookies();
      await entrarCliente(page, correo);
      const r = await page.request.get(ruta, { maxRedirects: 0 });
      await esRedireccionASinPermiso(r, `${correo} ${ruta}`, marca);
      await page.goto(ruta);
      await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
    }
    await page.context().clearCookies();
    await entrarSuper(page);
    const r = await page.request.get('/cliente/equipo', { maxRedirects: 0 });
    await esRedireccionASinPermiso(r, 'super /cliente/equipo', 'Invitar a alguien');
  });

  test('una ruta que no existe se explica sin romper', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/no-existe');
    await expect(page.getByRole('heading', { name: 'Pantalla no encontrada' })).toBeVisible();
  });
});

test.describe('Pantallas de muestra', () => {
  test('quedan detrás del login y marcadas "Disponible en el próximo sprint"', async ({ page }) => {
    await page.goto('/cliente/dinero');
    await expect(page).toHaveURL(/\/entrar/);
    await entrarCliente(page, 'equipo-dinero@cliente.test');
    for (const ruta of ['/cliente/revisiones', '/cliente/tickets', '/cliente/documentos']) { // /cliente/dinero ya es real (sprint 4)
      await page.goto(ruta);
      await expect(page.getByText('Disponible en el próximo sprint')).toBeVisible();
    }
    // navegar entre pantallas de muestra no pierde la sesión
    await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: /Tickets/ }).click();
    await expect(page).toHaveURL(/\/cliente\/tickets/);
    await expect(page.getByText('Disponible en el próximo sprint')).toBeVisible();
  });

  test('el super admin ve las suyas con el mismo aviso', async ({ page }) => {
    await entrarSuper(page);
    for (const ruta of ['/admin/panel', '/admin/registro']) { // /admin/finanzas ya es real (sprint 4)
      await page.goto(ruta);
      await expect(page.getByText('Disponible en el próximo sprint')).toBeVisible();
    }
  });
});

test.describe('Tema (D-017)', () => {
  test('Clara por defecto, se cambia a Oscura, se guarda por usuario y vuelve al entrar', async ({ page, browser }) => {
    await entrarCliente(page, 'admin@cliente.test');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(async () => JSON.stringify((await estadoMock()).preferencias)).toContain('oscura');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // otra persona sigue en Clara
    const otra = await browser.newContext({ baseURL: `http://127.0.0.1:${process.env.PW_PUERTO ?? 3100}` });
    const p2 = await otra.newPage();
    await entrarCliente(p2, 'equipo@cliente.test');
    await expect(p2.locator('html')).toHaveAttribute('data-theme', 'light');
    await otra.close();
    // cerrar sesión y volver a entrar conserva la preferencia
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/entrar/);
    await entrarCliente(page, 'admin@cliente.test');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Cambiar a tema claro' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
