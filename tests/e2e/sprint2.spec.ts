import { expect, test, type Page } from '@playwright/test';
import { APP, CLAVE, MOCK, entrarCliente, entrarSuper, estadoMock, reiniciar } from './ayudas';

/**
 * Sprint 2: inicio del cliente, panel, proyectos, 13 hitos, plan de sprints, registro, "ver como el cliente"
 * y la tarjeta interna "Consumo del equipo". Supabase simulado (tests/mock-supabase).
 */
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
test.beforeEach(async () => { await reiniciar(); });

/** El servidor responde con la orden de ir a "Sin permiso" (en desarrollo la barra de direcciones no cambia al navegar por dentro). */
async function redirigeASinPermiso(page: Page, ruta: string) {
  const r = await page.request.get(ruta, { maxRedirects: 0 });
  const cuerpo = await r.text();
  const destino = r.headers()['location'] ?? (cuerpo.match(/sin-permiso\?r=[^;"\\]*/)?.[0] ?? '');
  expect(destino, ruta).toContain('sin-permiso');
  expect(cuerpo, ruta).not.toMatch(/consumo del equipo/i);
}
const irProyecto = async (page: Page, cual: 'p1' | 'p2' | 'p3', sub = '') => {
  const s = await estadoMock();
  await page.goto(`/admin/proyectos/${cual === 'p3' ? B : A}/${s[cual]}${sub}`);
};
const dia = (n: number) => new Date(Date.parse(new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10) + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

test.describe('Inicio del cliente (datos reales)', () => {
  test('avance, línea de tiempo, plan publicado e historial visible', async ({ page }) => {
    await entrarCliente(page);
    await expect(page.getByRole('heading', { name: 'Plataforma Comercial' })).toBeVisible();
    await expect(page.getByTestId('avance-pct')).toHaveText('42.9%'); // 6 de 14 partes (D-013)
    await expect(page.getByTestId('avance-partes')).toHaveText('6/14 partes');
    await expect(page.getByTestId('linea-de-tiempo').getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) })).toHaveCount(12); // el hito 13 está oculto
    await expect(page.getByTestId('hito-13')).toHaveCount(0);
    await expect(page.getByTestId('hito-6')).toContainText('Sprint 2 · en curso');
    await expect(page.getByText('Proyectos y línea de tiempo').first()).toBeVisible(); // sprint actual
    await expect(page.getByTestId('plan-cliente')).toContainText('Revisiones y dinero');
    await expect(page.getByTestId('menu-lateral').getByRole('link', { name: /^Inicio/ })).not.toContainText('Pronto');
  });

  test('aviso de lo que falta del lado del cliente, con el retraso y su motivo', async ({ page }) => {
    await entrarCliente(page);
    await expect(page.getByText('Falta algo de tu lado: hito 8 · Pruebas del cliente')).toBeVisible();
    await expect(page.getByText('Logo en vectores y paleta de colores').first()).toBeVisible();
    await expect(page.getByTestId('hito-8')).toContainText('Esperando al cliente');
    await expect(page.getByTestId('hito-8')).toContainText('Falta el material de marca');
    await expect(page.getByTestId('hito-8')).toContainText('Atrasado');
  });

  test('el historial del cliente solo trae lo visible y se firma como Equipo Websourcing', async ({ page }) => {
    await entrarCliente(page);
    const h = page.getByTestId('historial');
    await expect(h.getByRole('listitem')).toHaveCount(2);
    await expect(h).toContainText('Se creó el proyecto con sus 13 hitos.');
    await expect(h).toContainText('Se publicó el plan de sprints.');
    await expect(h).toContainText('Equipo Websourcing');
    await expect(h).not.toContainText('El proyecto pasó a');
  });

  test('el cliente no ve borradores del plan: el proyecto con plan en propuesta no muestra sprints', async ({ page }) => {
    await entrarCliente(page);
    await page.getByRole('tab', { name: 'Sitio web corporativo' }).click();
    await expect(page.getByRole('heading', { name: 'Sitio web corporativo' })).toBeVisible();
    await expect(page.getByTestId('linea-de-tiempo')).toBeVisible();
    await expect(page.getByTestId('plan-cliente')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('BORRADOR');
    await expect(page.locator('body')).not.toContainText('Idea que aún no se muestra');
    await expect(page.getByTestId('hito-6')).not.toContainText('Sprint 1');
    // el avance no se mueve con borradores: el hito 6 es una sola parte
    await expect(page.getByTestId('avance-partes')).toHaveText('0/12 partes');
  });

  test('pago asociado: lo ve el admin; el equipo sin permiso de dinero no', async ({ page, browser }) => {
    await entrarCliente(page);
    await expect(page.getByTestId('hito-1')).toContainText('Anticipo');
    const ctx = await browser.newContext({ baseURL: APP });
    const p = await ctx.newPage();
    await entrarCliente(p, 'equipo@cliente.test');
    await expect(p.getByTestId('hito-1')).toBeVisible();
    await expect(p.getByTestId('hito-1')).not.toContainText('Anticipo');
    await expect(p.getByTestId('hito-11')).not.toContainText('Saldo final');
    await ctx.close();
  });

  test('sin proyectos: estado vacío amable', async ({ page }) => {
    await fetch(`${MOCK}/__vaciar_proyectos`);
    await entrarCliente(page);
    await expect(page.getByText('Todavía no tienes un proyecto')).toBeVisible();
  });

  test('error de carga: aviso y reintento', async ({ page }) => {
    await entrarCliente(page);
    let falla = true;
    await page.route('**/rest/v1/rpc/inicio_cliente', (r) => (falla ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }) : r.continue()));
    await page.reload();
    await expect(page.getByText('No pudimos cargar esta pantalla')).toBeVisible();
    falla = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('heading', { name: 'Plataforma Comercial' })).toBeVisible();
  });
});

test.describe('Super admin: panel y proyectos', () => {
  test('panel general con datos reales y "—" en lo que llega después', async ({ page }) => {
    await entrarSuper(page);
    await page.getByRole('link', { name: 'Panel general' }).first().click();
    await expect(page).toHaveURL(/\/admin\/panel/);
    await expect(page.getByRole('heading', { name: 'Panel general' })).toBeVisible();
    await expect(page.getByText('Pagos vencidos').locator('..').locator('..')).toContainText('—');
    await expect(page.getByText('Tickets abiertos').locator('..').locator('..')).toContainText('—');
    const a = page.getByTestId('atencion');
    await expect(a.getByTestId('atencion-hito')).toContainText('hito 8');
    await expect(a.getByTestId('atencion-hito')).toContainText('espera al cliente');
    await expect(a.getByTestId('atencion-plan').first()).toContainText('Sitio web corporativo');
    await expect(a.getByTestId('atencion-demo')).toContainText('Plataforma Comercial');
    await expect(page.getByRole('row', { name: /Plataforma Comercial/ })).toContainText('42.9%');
    await page.getByRole('link', { name: 'Plataforma Comercial' }).first().click();
    await expect(page).toHaveURL(/\/admin\/proyectos\//, { timeout: 40_000 }); // la primera vez Next compila la pantalla
    await expect(page.getByRole('heading', { name: 'Plataforma Comercial' })).toBeVisible();
  });

  test('lista de proyectos con filtro y creación (nace con 13 hitos)', async ({ page }) => {
    await entrarSuper(page);
    await page.getByTestId('menu-lateral').getByRole('link', { name: 'Proyectos' }).click();
    await expect(page.getByTestId('fila-proyecto')).toHaveCount(3);
    await page.getByLabel('Filtrar por empresa').selectOption({ label: 'Servicios Demo Ltda.' });
    await expect(page.getByTestId('fila-proyecto')).toHaveCount(1);
    await page.getByLabel('Filtrar por empresa').selectOption('todas');
    await page.getByRole('button', { name: 'Nuevo proyecto' }).first().click();
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    await expect(page.getByText('Elige la empresa.')).toBeVisible();
    await expect(page.getByText('Escribe el nombre del proyecto (mínimo 2 letras).')).toBeVisible();
    await page.getByLabel('Empresa', { exact: true }).selectOption({ label: 'Comercial Ejemplo S.A.S.' });
    await page.getByLabel('Nombre del proyecto').fill('Tienda en línea');
    await page.getByLabel('Fecha de inicio').fill('2026-12-10');
    await page.getByLabel('Fin planeado').fill('2026-12-01');
    await expect(page.getByText('La fecha final no puede ser anterior a la inicial.')).toBeVisible();
    await page.getByLabel('Fin planeado').fill('2027-02-01');
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    await expect(page.getByRole('heading', { name: 'Tienda en línea' })).toBeVisible();
    await expect(page.getByTestId('linea-de-tiempo').locator('[data-testid^="hito-"]')).toHaveCount(13);
    await expect(page.getByTestId('hito-13')).toContainText('oculto al cliente');
    const s = await estadoMock();
    expect(s.proyectos.filter((p: { nombre: string }) => p.nombre === 'Tienda en línea')).toHaveLength(1);
  });

  test('crear proyecto desde el detalle de la empresa; empresa pausada no deja', async ({ page }) => {
    await entrarSuper(page);
    await page.goto(`/admin/clientes/${A}`);
    await expect(page.getByTestId('fila-proyecto-empresa')).toHaveCount(2);
    await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
    await expect(page.getByLabel('Empresa', { exact: true })).toBeDisabled();
    await page.getByLabel('Nombre del proyecto').fill('App móvil');
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    await expect(page.getByRole('heading', { name: 'App móvil' })).toBeVisible();
    await page.goto(`/admin/clientes/${B}`);
    await expect(page.getByRole('button', { name: 'Nuevo proyecto' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ver como el cliente' })).toBeDisabled();
  });

  test('un cambio de fecha ya fijada pide motivo y lado; "qué falta" si es del cliente', async ({ page }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p1');
    await expect(page.getByTestId('linea-de-tiempo').locator('[data-testid^="hito-"]')).toHaveCount(13);
    await page.getByRole('button', { name: 'Editar hito 7' }).click();
    await page.getByLabel('Fecha planeada').fill(dia(50));
    await expect(page.getByTestId('bloque-retraso')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar hito' }).click();
    await expect(page.getByText('El motivo es obligatorio (mínimo 5 caracteres).')).toBeVisible();
    await page.getByLabel('Motivo del cambio').fill('Esperamos el servidor del cliente');
    await page.getByLabel('¿De quién es el cambio?').selectOption('cliente');
    await page.getByRole('button', { name: 'Guardar hito' }).click();
    await expect(page.getByText('Cuéntale al cliente qué falta de su lado.')).toBeVisible();
    await page.getByLabel('¿Qué falta de su lado?').fill('Accesos al servidor');
    await page.getByRole('button', { name: 'Guardar hito' }).click();
    await expect(page.getByTestId('hito-7')).toContainText('Esperando al cliente');
    await expect(page.getByTestId('hito-7')).toContainText('Accesos al servidor');
    const s = await estadoMock();
    const r = s.retrasos.at(-1);
    expect(r).toMatchObject({ fecha_nueva: dia(50), lado: 'cliente', motivo: 'Esperamos el servidor del cliente', que_falta: 'Accesos al servidor' });
    // el cliente lo ve: nueva fecha, motivo y qué falta
    await page.context().clearCookies();
    await entrarCliente(page);
    await expect(page.getByText('Falta algo de tu lado: hito 7 · Pruebas finales')).toBeVisible();
    await expect(page.getByTestId('hito-7')).toContainText('Esperamos el servidor del cliente');
  });

  test('la primera vez que se fija una fecha no pide motivo; el hito 6 es derivado; el pago asociado se cambia', async ({ page }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p1');
    await page.getByRole('button', { name: 'Editar hito 9' }).click();
    await page.getByLabel('Fecha planeada').fill(dia(45));
    await expect(page.getByTestId('bloque-retraso')).toHaveCount(0);
    await page.getByLabel('Pago asociado').selectOption('Segundo pago');
    await page.getByRole('button', { name: 'Guardar hito' }).click();
    await expect(page.getByTestId('hito-9')).toContainText('Segundo pago');
    const s = await estadoMock();
    expect(s.retrasos).toHaveLength(1); // solo el de ejemplo
    await page.getByRole('button', { name: 'Editar hito 6' }).click();
    await expect(page.getByLabel('Estado')).toBeDisabled();
    await expect(page.getByText('El estado de este hito se calcula solo a partir de los sprints.')).toBeVisible();
  });

  test('editar el proyecto; uno cerrado rechaza cambios de hitos y el servidor anota el rechazo', async ({ page }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p1');
    await page.getByRole('button', { name: 'Editar proyecto' }).click();
    await page.getByLabel('Estado').selectOption('terminado');
    await page.getByRole('button', { name: 'Guardar proyecto' }).click();
    await expect(page.getByText('Proyecto terminado')).toBeVisible();
    await page.getByRole('button', { name: 'Editar hito 9' }).click();
    await page.getByLabel('Nombre').fill('Capacitación inicial');
    await page.getByRole('button', { name: 'Guardar hito' }).click();
    await expect(page.getByText('Este proyecto está terminado o cancelado. Reábrelo para poder cambiarlo.')).toBeVisible();
    await expect.poll(async () => (await estadoMock()).rechazos).toEqual([{ accion: 'editar_hito', codigo: 'proyecto_cerrado', user_id: expect.any(String) }]);
  });

  test('el historial del super admin trae también lo interno y dice qué ve el cliente', async ({ page }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p1');
    const h = page.getByTestId('historial');
    await expect(h.getByRole('listitem')).toHaveCount(3);
    await expect(h.getByText('Interno')).toHaveCount(1);
    await expect(h.getByText('Lo ve el cliente')).toHaveCount(2);
  });

  test('registro de actividad real: lo hecho queda anotado y se puede buscar', async ({ page }) => {
    await entrarSuper(page);
    await page.goto(`/admin/clientes/${A}`);
    await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
    await page.getByLabel('Nombre del proyecto').fill('Proyecto para el registro');
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    await expect(page.getByRole('heading', { name: 'Proyecto para el registro' })).toBeVisible();
    await page.getByTestId('menu-lateral').getByRole('link', { name: 'Registro de actividad' }).click();
    await expect(page.getByRole('heading', { name: 'Registro de actividad' })).toBeVisible();
    await expect(page.getByTestId('fila-registro').first()).toContainText('Creó un proyecto');
    await expect(page.getByTestId('fila-registro').first()).toContainText('Super Admin Prueba');
    await expect(page.getByTestId('fila-registro').first()).toContainText('203.0.113.7');
    await page.getByLabel('Buscar en el registro').fill('zzz');
    await expect(page.getByText('Nada coincide con tu búsqueda.')).toBeVisible();
    await page.getByLabel('Buscar en el registro').fill('proyecto');
    await expect(page.getByTestId('fila-registro').first()).toContainText('Creó un proyecto');
  });
});

test.describe('Super admin: plan de sprints', () => {
  test('propuesta: avisa cruces, agrega, reordena, quita sin motivo y publica al cliente', async ({ page, browser }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p2', '/plan');
    await expect(page.getByTestId('estado-plan')).toContainText('Propuesta');
    await expect(page.getByTestId('aviso-cruce')).toContainText('Los sprints 1 y 2 se cruzan');
    await page.getByRole('button', { name: 'Agregar sprint' }).click();
    await page.getByLabel('Nombre').fill('Sprint de cierre');
    await page.getByLabel('Qué incluye').fill('Manual\nCapacitación');
    await page.getByRole('button', { name: 'Agregar sprint', exact: true }).click();
    await expect(page.getByTestId('sprint')).toHaveCount(3);
    await expect(page.getByTestId('sprint').nth(2)).toContainText('Sprint de cierre');
    await page.getByRole('button', { name: 'Subir el sprint 3' }).click();
    await expect(page.getByTestId('sprint').nth(1)).toContainText('Sprint de cierre');
    await page.getByTestId('sprint').nth(0).getByRole('button', { name: 'Quitar' }).click();
    await page.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(page.getByTestId('sprint')).toHaveCount(2);
    expect((await estadoMock()).cambios).toHaveLength(0); // propuesta: sin motivo y sin rastro para el cliente
    // el cliente aún no ve nada
    const ctx = await browser.newContext({ baseURL: APP });
    const c = await ctx.newPage();
    await entrarCliente(c);
    await c.getByRole('tab', { name: 'Sitio web corporativo' }).click();
    await expect(c.getByTestId('plan-cliente')).toHaveCount(0);
    // publicar
    await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
    await page.getByRole('button', { name: 'Sí, publicar' }).click();
    await expect(page.getByTestId('estado-plan')).toContainText('Plan publicado');
    await c.reload();
    await c.getByRole('tab', { name: 'Sitio web corporativo' }).click();
    await expect(c.getByTestId('plan-cliente')).toContainText('Sprint de cierre');
    await expect(c.getByTestId('plan-cliente')).toContainText('Manual · Capacitación');
    await ctx.close();
  });

  test('plan vacío no se puede publicar', async ({ page }) => {
    await entrarSuper(page);
    await page.goto(`/admin/clientes/${A}`);
    await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
    await page.getByLabel('Nombre del proyecto').fill('Sin plan');
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    await page.getByRole('link', { name: 'Plan de sprints' }).click();
    await expect(page.getByText('Todavía no hay sprints. Agrega el primero.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprobar y publicar' })).toBeDisabled();
  });

  test('plan publicado: cada cambio pide motivo, el cliente ve el motivo y los siguientes se corren', async ({ page }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p1', '/plan');
    await expect(page.getByTestId('estado-plan')).toContainText('Plan publicado');
    // un sprint iniciado no se quita ni se mueve
    await expect(page.getByTestId('sprint').nth(0).getByRole('button', { name: 'Quitar' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Bajar el sprint 2' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Subir el sprint 3' })).toBeDisabled(); // el de arriba ya empezó
    const antes = (await estadoMock()).sprints.filter((s: { proyecto_id: string }) => s.proyecto_id !== undefined);
    const s3antes = antes.find((s: { nombre: string }) => s.nombre === 'Revisiones y dinero');
    await page.getByTestId('sprint').nth(1).getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Fin', { exact: true }).fill(dia(11));
    await page.getByLabel('Correr los siguientes').check();
    await page.getByRole('button', { name: 'Guardar sprint' }).click();
    await expect(page.getByText('El plan ya está publicado: escribe el motivo del cambio (mínimo 5 caracteres).')).toBeVisible();
    await page.getByLabel('Motivo del cambio').fill('El cliente pidió más tiempo');
    await page.getByRole('button', { name: 'Guardar sprint' }).click();
    await expect(page.getByTestId('cambios-plan')).toContainText('El cliente pidió más tiempo');
    const s = await estadoMock();
    const s3 = s.sprints.find((x: { nombre: string }) => x.nombre === 'Revisiones y dinero');
    expect(s3.fecha_inicio).toBe(dia(13)); // corrido 3 días (el fin se movió de dia 8 a dia 11)
    expect(s3.fecha_inicio).not.toBe(s3antes.fecha_inicio);
    // agregar con plan publicado también pide motivo
    await page.getByRole('button', { name: 'Agregar sprint' }).click();
    await page.getByLabel('Nombre').fill('Extra');
    await page.getByRole('button', { name: 'Agregar sprint', exact: true }).click();
    await expect(page.getByText('El plan ya está publicado: escribe el motivo del cambio (mínimo 5 caracteres).')).toBeVisible();
    await page.getByLabel('Motivo del cambio').fill('Nuevo alcance acordado');
    await page.getByRole('button', { name: 'Agregar sprint', exact: true }).click();
    await expect(page.getByTestId('sprint')).toHaveCount(4);
    // reordenar el 3 y el 4 pide motivo
    await page.getByRole('button', { name: 'Subir el sprint 4' }).click();
    await page.getByRole('button', { name: 'Guardar el orden' }).click();
    await expect(page.getByText('Escribe el motivo (mínimo 5 caracteres).')).toBeVisible();
    await page.getByLabel('Motivo').fill('Prioridad distinta');
    await page.getByRole('button', { name: 'Guardar el orden' }).click();
    await expect(page.getByTestId('sprint').nth(2)).toContainText('Extra');
    // cambiar solo el estado no pide motivo
    await page.getByTestId('sprint').nth(1).getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Estado').selectOption('en_revision');
    await page.getByRole('button', { name: 'Guardar sprint' }).click();
    await expect(page.getByTestId('sprint').nth(1)).toContainText('En revisión');
    // el cliente ve los cambios con su motivo
    await page.context().clearCookies();
    await entrarCliente(page);
    await expect(page.getByTestId('plan-cliente')).toContainText('El cliente pidió más tiempo');
    await expect(page.getByTestId('plan-cliente')).toContainText('Nuevo alcance acordado');
    await expect(page.getByTestId('hito-6')).toContainText('Sprint 2 · en revisión');
  });
});

test.describe('Consumo del equipo (interno)', () => {
  test('el super admin ve la tarjeta, anota consumo y recibe el aviso del 80 %', async ({ page }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p1');
    const t = page.getByTestId('consumo-equipo');
    await expect(t).toContainText('Consumo del equipo');
    await expect(t).toContainText('Interno');
    await expect(t).not.toContainText(/IA|Claude|modelo/);
    await expect(page.getByTestId('consumo-real')).toHaveText('70 %');
    await expect(page.getByTestId('consumo-del-tope')).toHaveText('35 %');
    await expect(page.getByTestId('aviso-consumo-80')).toHaveCount(0);
    await t.getByLabel('Real del sprint 2').fill('100');
    await t.getByRole('button', { name: 'Guardar el sprint 2' }).click();
    await expect(page.getByTestId('consumo-real')).toHaveText('170 %');
    await expect(page.getByTestId('aviso-consumo-80')).toBeVisible(); // 170 de 200 = 85 %
    await t.getByLabel('Tope del proyecto (% de una semana)').fill('400');
    await t.getByRole('button', { name: 'Guardar proyecto' }).click();
    await expect(page.getByTestId('aviso-consumo-80')).toHaveCount(0);
    await t.getByLabel('Real del sprint 2').fill('-5');
    await t.getByRole('button', { name: 'Guardar el sprint 2' }).click();
    await expect(t.getByRole('alert')).toContainText('Escribe números entre 0 y 10.000.');
  });

  test('nunca llega al cliente: ni en pantalla ni en la base', async ({ page, request }) => {
    await entrarCliente(page);
    for (const ruta of ['/cliente/inicio', '/cliente/equipo']) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText(/consumo del equipo/i);
    }
    // el cliente intenta entrar a la pantalla de proyecto: sin permiso y sin tarjeta
    const s = await estadoMock();
    await redirigeASinPermiso(page, `/admin/proyectos/${A}/${s.p1}`);
    // y la base no le responde: función con error, tablas sin filas
    const r = await request.post(`${MOCK}/auth/v1/token?grant_type=password`, { data: { email: 'admin@cliente.test', password: CLAVE } });
    const token = (await r.json()).access_token;
    const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const f = await request.post(`${MOCK}/rest/v1/rpc/consumo_equipo`, { headers: h, data: { p_proyecto_id: s.p1 } });
    expect((await f.json()).message).toBe('no_autorizado');
    for (const t of ['consumo_equipo_proyecto', 'consumo_equipo_sprint']) {
      expect(await (await request.get(`${MOCK}/rest/v1/${t}?select=*`, { headers: h })).json()).toEqual([]);
    }
    for (const fn of ['fijar_consumo_proyecto', 'anotar_consumo_sprint']) {
      const w = await request.post(`${MOCK}/rest/v1/rpc/${fn}`, { headers: h, data: { p_proyecto_id: s.p1, p_sprint_id: s.sprints[0].id, p_tope_pct: 1 } });
      expect((await w.json()).message).toBe('no_autorizado');
    }
    // y ninguna fila de consumo aparece en el historial que ve el cliente
    const hist = await (await request.get(`${MOCK}/rest/v1/historial_proyecto?select=*`, { headers: h })).json();
    expect(JSON.stringify(hist)).not.toMatch(/consumo/);
  });
});

test.describe('"Ver como el cliente" (D-020)', () => {
  test('desde el detalle de la empresa: franja visible, solo lectura, sin tarjeta interna y Salir', async ({ page }) => {
    await entrarSuper(page);
    await page.goto(`/admin/clientes/${A}`);
    await page.getByRole('button', { name: 'Ver como el cliente' }).click();
    await page.getByRole('button', { name: 'Empezar a mirar' }).click();
    await expect(page).toHaveURL(/\/cliente\/inicio/);
    const franja = page.getByTestId('franja-ver-como');
    await expect(franja).toContainText('Estás viendo como el cliente');
    await expect(franja).toContainText('Comercial Ejemplo S.A.S.');
    await expect(franja).toContainText('solo lectura');
    await expect(page.getByRole('heading', { name: 'Plataforma Comercial' })).toBeVisible();
    await expect(page.getByTestId('avance-pct')).toHaveText('42.9%');
    await expect(page.locator('body')).not.toContainText(/consumo del equipo/i);
    await expect(page.getByTestId('hito-13')).toHaveCount(0);
    await expect(page.getByTestId('hito-1')).toContainText('Anticipo'); // rol administrador
    expect(Object.keys((await estadoMock()).verComo)).toHaveLength(1);
    // la zona de Websourcing no está disponible mientras dura
    await redirigeASinPermiso(page, '/admin/panel');
    // solo lectura: invitar a alguien se rechaza con un mensaje claro
    await page.goto('/cliente/equipo');
    await expect(page.getByTestId('franja-ver-como')).toBeVisible();
    await page.getByRole('button', { name: 'Invitar a alguien' }).click();
    await page.getByLabel('Correo').fill('nuevo@cliente.test');
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Estás viendo como el cliente: aquí solo se puede mirar.')).toBeVisible();
    expect((await estadoMock()).invitaciones.some((i: { correo: string }) => i.correo === 'nuevo@cliente.test')).toBe(false);
    await page.keyboard.press('Escape');
    // el tema no se guarda en ver como y no rompe nada
    await page.getByRole('button', { name: /Cambiar a tema/ }).first().click();
    expect(Object.keys((await estadoMock()).preferencias)).toHaveLength(0);
    // salir
    await page.getByTestId('franja-ver-como').getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/admin\/clientes/);
    await expect(page.getByTestId('franja-ver-como')).toHaveCount(0);
    const s = await estadoMock();
    expect(Object.keys(s.verComo)).toHaveLength(0);
    expect(s.registro.map((r: { accion: string }) => r.accion)).toEqual(expect.arrayContaining(['ver_como_iniciado', 'ver_como_terminado']));
    await page.goto('/admin/proyectos');
    await expect(page.getByRole('heading', { name: 'Proyectos' })).toBeVisible();
  });

  test('desde el detalle del proyecto, como equipo sin dinero ni aprobar', async ({ page }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p1');
    await page.getByRole('button', { name: 'Ver como el cliente' }).click();
    await page.getByLabel('Mirar como').selectOption('equipo');
    await page.getByRole('button', { name: 'Empezar a mirar' }).click();
    await expect(page).toHaveURL(/\/cliente\/inicio/);
    await expect(page.getByTestId('franja-ver-como')).toBeVisible();
    await expect(page.getByTestId('hito-1')).toBeVisible();
    await expect(page.getByTestId('hito-1')).not.toContainText('Anticipo');
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByText('Mi equipo')).toHaveCount(0);
    await expect(menu.getByText('Dinero', { exact: true })).toHaveCount(0);
    await redirigeASinPermiso(page, '/cliente/equipo');
  });

  test('en el detalle de proyecto del super admin no hay franja', async ({ page }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p1');
    await expect(page.getByTestId('franja-ver-como')).toHaveCount(0);
    await expect(page.getByTestId('consumo-equipo')).toBeVisible();
  });
});

test.describe('Menú lateral y guardia', () => {
  test('el menú lateral llega hasta abajo en páginas largas (1440 px)', async ({ page }) => {
    await entrarSuper(page);
    await irProyecto(page, 'p1');
    await expect(page.getByTestId('hito-13')).toBeVisible();
    const r = await page.evaluate(() => ({ alto: document.documentElement.scrollHeight, menu: document.querySelector('[data-testid="menu-lateral"]')!.getBoundingClientRect().height, ventana: window.innerHeight }));
    expect(r.alto).toBeGreaterThan(r.ventana); // la página es larga
    expect(r.menu).toBeGreaterThanOrEqual(r.alto - 1);
  });

  test('un cliente que pide /admin/proyectos o /admin/panel recibe "Sin permiso" desde el servidor', async ({ page }) => {
    await entrarCliente(page);
    const s = await estadoMock();
    for (const ruta of ['/admin/panel', '/admin/proyectos', '/admin/registro', `/admin/proyectos/${A}/${s.p1}`, `/admin/proyectos/${A}/${s.p1}/plan`]) {
      await redirigeASinPermiso(page, ruta);
    }
  });

  test('el super admin no entra a /cliente/inicio fuera de "ver como"', async ({ page }) => {
    await entrarSuper(page);
    await redirigeASinPermiso(page, '/cliente/inicio');
  });

  test('las pantallas ajenas siguen en "Pronto"', async ({ page }) => {
    await entrarCliente(page);
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByRole('link', { name: /Revisiones/ })).toContainText('Pronto');
    await expect(menu.getByRole('link', { name: /Tickets/ })).toContainText('Pronto');
    await expect(menu.getByRole('link', { name: /Documentos/ })).toContainText('Pronto');
    await expect(menu.getByRole('link', { name: /Inicio/ })).not.toContainText('Pronto');
  });
});
