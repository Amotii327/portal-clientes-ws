import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { entrarCliente, entrarSuper, estadoMock, MOCK, reiniciar } from './ayudas';

/**
 * Módulo 4 (Dinero), pantallas reales con Supabase simulado. Datos de partida (tests/mock-supabase/dinero.mjs):
 * proyecto "Plataforma de pedidos" (COP 20.000.000, abonado 6.000.000, saldo 14.000.000; una cuota vencida de 5.000.000,
 * una por vencer, una pendiente y el anticipo pagado), "Tienda móvil de ventas" (USD 5.000) y "Sitio web corporativo" (sin contrato).
 */
const BASE = `http://127.0.0.1:${process.env.PW_PUERTO ?? 3100}`;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test.beforeEach(async () => { await reiniciar(); });

const dinero = async () => (await fetch(`${MOCK}/__dinero`)).json();
const saldo = (page: Page) => page.getByTestId('valor-saldo');
const filaCuota = (page: Page, concepto: string) => page.getByTestId('plan-tabla').getByTestId('cuota').filter({ hasText: concepto });
const irADinero = async (page: Page) => {
  await page.goto('/cliente/dinero');
  await expect(page.getByRole('heading', { name: 'Dinero', exact: true })).toBeVisible();
  await expect(page.getByTestId('tarjetas-contrato')).toBeVisible();
};
const irAFinanzas = async (page: Page, pestana?: string) => {
  await page.goto('/admin/finanzas');
  await expect(page.getByRole('heading', { name: 'Finanzas', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  if (pestana) await page.getByRole('tab', { name: pestana }).click();
};
const elegirProyecto = async (page: Page, nombre: string) => {
  await page.getByLabel('Cliente y proyecto').selectOption({ label: nombre });
};
async function esRedireccionASinPermiso(r: APIResponse, etiqueta: string, marca: string) {
  const cuerpo = await r.text();
  const destino = r.headers()['location'] ?? (cuerpo.match(/sin-permiso\?r=[^;"\\]*/)?.[0] ?? '');
  expect(destino, etiqueta).toContain('sin-permiso');
  expect(cuerpo, etiqueta).not.toContain(marca);
}
async function subirComprobante(page: Page, concepto: string, archivo = { name: 'comprobante.pdf', mimeType: 'application/pdf', buffer: PDF }) {
  await filaCuota(page, concepto).getByRole('button', { name: 'Subir comprobante' }).click();
  const dlg = page.getByRole('dialog', { name: 'Subir comprobante de pago' });
  await dlg.getByLabel('Comprobante (PDF o imagen)').setInputFiles(archivo);
  return dlg;
}

test.describe('Cliente con "ver dinero"', () => {
  test('ve contrato, plan con hito y estado de cada cuota, abonos, saldo y facturas', async ({ page }) => {
    await entrarCliente(page);
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: /^Dinero/ })).toBeVisible();
    await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: /^Dinero/ }).click();
    await expect(page).toHaveURL(/\/cliente\/dinero/);
    await expect(page.getByTestId('tarjetas-contrato')).toBeVisible();
    await expect(page.getByTestId('valor-contrato')).toHaveText(/\$\s?20\.000\.000/);
    await expect(page.getByTestId('valor-abonado')).toHaveText(/\$\s?6\.000\.000/);
    await expect(saldo(page)).toHaveText(/\$\s?14\.000\.000/);
    await expect(page.getByTestId('valor-vencido')).toHaveText(/\$\s?5\.000\.000/);
    await expect(page.getByText('Tienes un pago vencido')).toBeVisible();

    const cuotas = page.getByTestId('plan-tabla').getByTestId('cuota');
    await expect(cuotas).toHaveCount(4);
    await expect(filaCuota(page, 'Anticipo')).toContainText('Pagado');
    await expect(filaCuota(page, 'Anticipo')).toContainText('Hito 1 · Descubrimiento');
    await expect(filaCuota(page, 'sprints 1 y 2')).toContainText('Vencido');
    await expect(filaCuota(page, 'sprints 1 y 2')).toContainText('Hito 3 · Sprints 1 y 2');
    await expect(filaCuota(page, 'sprints 3 y 4')).toContainText('Vence pronto');
    await expect(filaCuota(page, 'Cierre')).toContainText('Pendiente');

    // abonos: el anulado va tachado con su motivo; el vigente aparece normal
    const abonos = page.getByTestId('abono');
    await expect(abonos).toHaveCount(2);
    await expect(page.locator('[data-testid="abono"][data-anulado="si"]')).toContainText('Se registró por error en este proyecto.');
    await expect(page.locator('[data-testid="abono"][data-anulado="no"]')).toContainText('Transferencia');
    // facturas
    await expect(page.getByTestId('factura')).toContainText('Factura FV-0001');
    await expect(page.getByText('Las facturas salen a nombre de Amotii.')).toBeVisible();
  });

  test('muestra cada proyecto en su moneda y no las mezcla', async ({ page }) => {
    await entrarCliente(page);
    await irADinero(page);
    await expect(page.getByTestId('valor-contrato')).toHaveText(/^\$\s?20\.000\.000$/);
    await page.getByLabel('Proyecto').selectOption({ label: 'Tienda móvil de ventas' });
    await expect(page.getByTestId('valor-contrato')).toHaveText(/US\$\s?5\.000,00/);
    await expect(page.getByTestId('valor-abonado')).toHaveText(/US\$\s?1\.500,00/);
    await expect(saldo(page)).toHaveText(/US\$\s?3\.500,00/);
    await expect(page.getByTestId('tarjetas-contrato')).not.toContainText('20.000.000');
  });

  test('un proyecto sin contrato muestra el mensaje de vacío', async ({ page }) => {
    await entrarCliente(page);
    await irADinero(page);
    await page.getByLabel('Proyecto').selectOption({ label: 'Sitio web corporativo' });
    await expect(page.getByRole('heading', { name: 'Aún no hay contrato cargado' })).toBeVisible();
  });

  test('estados de carga y de error, con reintento', async ({ page }) => {
    await entrarCliente(page);
    let falla = true;
    await page.route('**/rest/v1/rpc/dinero_del_proyecto', async (r) => {
      await new Promise((x) => setTimeout(x, 700));
      if (falla) return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) });
      return r.continue();
    });
    await page.goto('/cliente/dinero');
    await expect(page.getByRole('status', { name: 'Cargando' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No pudimos cargar esta pantalla' })).toBeVisible();
    falla = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByTestId('tarjetas-contrato')).toBeVisible();
  });

  test('enlaza a Datos de facturación, que ya existía del sprint 1', async ({ page }) => {
    await entrarCliente(page);
    await irADinero(page);
    await page.getByRole('link', { name: 'Datos de facturación' }).first().click();
    await expect(page).toHaveURL(/\/cliente\/facturacion/);
    await expect(page.getByLabel('NIT')).toHaveValue('900123456-7');
  });

  test('descarga una factura con enlace firmado y queda anotada', async ({ page }) => {
    await entrarCliente(page);
    await irADinero(page);
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar factura FV-0001' }).click()]);
    expect(descarga.suggestedFilename()).toMatch(/\.pdf$/);
    await expect.poll(async () => (await dinero()).descargas.length).toBe(1);
  });

  test('sube un comprobante: la cuota queda en revisión y el saldo NO cambia', async ({ page }) => {
    await entrarCliente(page);
    await irADinero(page);
    const antes = await saldo(page).innerText();
    const dlg = await subirComprobante(page, 'sprints 1 y 2');
    await expect(dlg.getByLabel('Valor pagado')).toHaveValue('5000000');
    await dlg.getByRole('button', { name: 'Enviar comprobante' }).click();
    await expect(page.getByText(/Comprobante enviado/)).toBeVisible();
    await expect(filaCuota(page, 'sprints 1 y 2')).toContainText('En revisión');
    await expect(filaCuota(page, 'sprints 1 y 2').getByRole('button', { name: 'Subir comprobante' })).toHaveCount(0);
    expect(await saldo(page).innerText()).toBe(antes);
    const item = page.getByTestId('comprobante').first();
    await expect(item).toContainText('En revisión');
    const d = await dinero();
    expect(d.comprobantes).toHaveLength(1);
    expect(d.comprobantes[0].archivo_path).toMatch(/^11111111-1111-4111-8111-111111111111\/comprobantes\/[0-9a-f-]{36}\.pdf$/);
    expect(d.abonos.filter((a: { anulado_en: string | null }) => !a.anulado_en)).toHaveLength(2); // el anticipo y el de USD: no nació ningún abono
  });

  test('valida el comprobante antes de enviarlo y el servidor revisa el contenido real del archivo', async ({ page }) => {
    await entrarCliente(page);
    await irADinero(page);
    let dlg = await subirComprobante(page, 'sprints 1 y 2', { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
    await dlg.getByRole('button', { name: 'Enviar comprobante' }).click();
    await expect(dlg.getByText('El archivo debe ser PDF o imagen (PNG, JPG o WEBP).')).toBeVisible();
    await dlg.getByLabel('Valor pagado').fill('4.000.000');
    await dlg.getByRole('button', { name: 'Enviar comprobante' }).click();
    await expect(dlg.getByText(/Escribe el valor que pagaste/)).toBeVisible();
    // un archivo que se hace pasar por PDF: el servidor lo rechaza por su contenido
    await dlg.getByLabel('Comprobante (PDF o imagen)').setInputFiles({ name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('esto no es un pdf') });
    await dlg.getByLabel('Valor pagado').fill('5000000');
    await dlg.getByRole('button', { name: 'Enviar comprobante' }).click();
    await expect(dlg.getByText('El archivo debe ser PDF o imagen (PNG, JPG o WEBP).')).toBeVisible();
    expect((await dinero()).comprobantes).toHaveLength(0);
    // un valor mayor a lo que falta lo rechaza la base, con mensaje claro
    await dlg.getByLabel('Comprobante (PDF o imagen)').setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: PNG });
    await dlg.getByLabel('Valor pagado').fill('9000000');
    await dlg.getByRole('button', { name: 'Enviar comprobante' }).click();
    await expect(dlg.getByText('El valor del pago es mayor que lo que falta por pagar.')).toBeVisible();
  });

  test('si el super admin rechaza el comprobante, el saldo no cambia y el cliente ve el motivo y puede subir otro', async ({ page, browser }) => {
    await entrarCliente(page);
    await irADinero(page);
    const antes = await saldo(page).innerText();
    await (await subirComprobante(page, 'sprints 1 y 2')).getByRole('button', { name: 'Enviar comprobante' }).click();
    await expect(filaCuota(page, 'sprints 1 y 2')).toContainText('En revisión');

    const ctx = await browser.newContext({ baseURL: BASE });
    const sup = await ctx.newPage();
    await entrarSuper(sup);
    await irAFinanzas(sup);
    await expect(sup.getByTestId('comprobante-pendiente')).toHaveCount(1);
    await sup.getByRole('button', { name: 'Rechazar' }).click();
    await sup.getByRole('button', { name: 'Rechazar', exact: true }).last().click(); // sin motivo
    await expect(sup.getByText(/Escribe el motivo/)).toBeVisible();
    await sup.getByLabel('Motivo').fill('El valor del comprobante no coincide con el pago.');
    await sup.getByRole('button', { name: 'Rechazar', exact: true }).last().click();
    await expect(sup.getByTestId('bandeja-vacia')).toBeVisible();
    await ctx.close();

    await page.reload();
    await expect(page.getByTestId('tarjetas-contrato')).toBeVisible();
    expect(await saldo(page).innerText()).toBe(antes);
    await expect(filaCuota(page, 'sprints 1 y 2')).toContainText('Vencido');
    await expect(filaCuota(page, 'sprints 1 y 2').getByTestId('motivo-rechazo')).toContainText('El valor del comprobante no coincide con el pago.');
    await expect(page.locator('[data-testid="comprobante"][data-estado="rechazado"]')).toContainText('Motivo del rechazo: El valor del comprobante no coincide con el pago.');
    await expect(filaCuota(page, 'sprints 1 y 2').getByRole('button', { name: 'Subir comprobante' })).toBeVisible();
    const d = await dinero();
    expect(d.abonos.filter((a: { anulado_en: string | null }) => !a.anulado_en)).toHaveLength(2);
  });

  test('si el super admin confirma, nace el abono y el saldo baja', async ({ page, browser }) => {
    await entrarCliente(page);
    await irADinero(page);
    await (await subirComprobante(page, 'sprints 1 y 2')).getByRole('button', { name: 'Enviar comprobante' }).click();
    await expect(filaCuota(page, 'sprints 1 y 2')).toContainText('En revisión');
    const ctx = await browser.newContext({ baseURL: BASE });
    const sup = await ctx.newPage();
    await entrarSuper(sup);
    await irAFinanzas(sup);
    await expect(sup.getByRole('tab', { name: /Comprobantes/ })).toContainText('1');
    await sup.getByRole('button', { name: 'Confirmar' }).click();
    const dlg = sup.getByRole('dialog', { name: 'Confirmar comprobante' });
    await expect(dlg.getByLabel('Valor recibido')).toHaveValue('5000000');
    await dlg.getByRole('button', { name: 'Confirmar y registrar abono' }).click();
    await expect(sup.getByText(/el saldo ahora es \$\s?9\.000\.000/)).toBeVisible();
    await ctx.close();
    await page.reload();
    await expect(saldo(page)).toHaveText(/\$\s?9\.000\.000/);
    await expect(filaCuota(page, 'sprints 1 y 2')).toContainText('Pagado');
    await expect(page.getByTestId('abono')).toHaveCount(3);
    await expect(page.locator('[data-testid="comprobante"]').first()).toContainText('Confirmado');
  });
});

test.describe('Equipo del cliente', () => {
  test('sin "ver dinero": no ve el módulo en el menú ni en la ruta, y el servidor no envía la pantalla', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByText('Dinero', { exact: true })).toHaveCount(0);
    const r = await page.request.get('/cliente/dinero', { maxRedirects: 0 });
    await esRedireccionASinPermiso(r, 'equipo sin ver dinero', 'Plan de pagos');
    await page.goto('/cliente/dinero');
    await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
    await expect(page.getByText('Plan de pagos')).toHaveCount(0);
    await expect(page.getByText('$ 20.000.000')).toHaveCount(0);
  });

  test('sin "ver dinero" no puede subir comprobantes ni por la ruta de archivos', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    const pagoId = '66666666-6666-4666-8666-666666666662';
    const r = await page.request.post('/api/dinero/archivo', {
      multipart: { tipo: 'comprobante', pagoId, valor: '5000000', fechaPago: new Date().toISOString().slice(0, 10), archivo: { name: 'c.pdf', mimeType: 'application/pdf', buffer: PDF } },
    });
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect((await dinero()).comprobantes).toHaveLength(0);
  });

  test('con "ver dinero" pero sin "subir archivos": ve todo y no puede subir comprobantes', async ({ page }) => {
    await entrarCliente(page, 'equipo-dinero@cliente.test');
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: /^Dinero/ })).toBeVisible();
    await irADinero(page);
    await expect(saldo(page)).toHaveText(/\$\s?14\.000\.000/);
    await expect(page.getByRole('button', { name: 'Subir comprobante' })).toHaveCount(0);
    await expect(page.getByTestId('plan-tabla').getByText('Sin permiso para subir comprobantes').first()).toBeVisible();
  });

  test('con "ver dinero" y "subir archivos" puede subir comprobantes', async ({ page }) => {
    await fetch(`${MOCK}/__estado`);
    await entrarCliente(page, 'equipo-dinero@cliente.test');
    // el permiso "subir archivos" se le da desde Mi equipo en la app real; aquí se usa el simulado directamente
    await fetch(`${MOCK}/__permiso`, { method: 'POST', body: JSON.stringify({ correo: 'equipo-dinero@cliente.test', subir_archivos: true }) });
    await irADinero(page);
    await (await subirComprobante(page, 'sprints 1 y 2')).getByRole('button', { name: 'Enviar comprobante' }).click();
    await expect(filaCuota(page, 'sprints 1 y 2')).toContainText('En revisión');
  });
});

test.describe('Super admin', () => {
  test('Finanzas ya no dice "Pronto", y un cliente o un super no entran a la zona del otro', async ({ page }) => {
    await entrarSuper(page);
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByRole('link', { name: /^Finanzas/ })).not.toContainText('Pronto');
    await menu.getByRole('link', { name: /^Finanzas/ }).click();
    await expect(page).toHaveURL(/\/admin\/finanzas/);
    await expect(page.getByTestId('bandeja-vacia')).toBeVisible();
    const r = await page.request.get('/cliente/dinero', { maxRedirects: 0 });
    await esRedireccionASinPermiso(r, 'super en zona cliente', 'Plan de pagos');
  });

  test('un cliente no entra a /admin/finanzas', async ({ page }) => {
    await entrarCliente(page);
    const r = await page.request.get('/admin/finanzas', { maxRedirects: 0 });
    await esRedireccionASinPermiso(r, 'cliente en finanzas', 'Comprobantes por confirmar');
  });

  test('crea un contrato, arma el plan, registra un abono y lo anula con motivo (el saldo se recalcula)', async ({ page }) => {
    await entrarSuper(page);
    await irAFinanzas(page, 'Contratos y pagos');
    await elegirProyecto(page, 'Sitio web corporativo');
    await expect(page.getByRole('heading', { name: 'Este proyecto aún no tiene contrato' })).toBeVisible();
    await page.getByRole('button', { name: 'Crear contrato' }).click();
    let dlg = page.getByRole('dialog', { name: 'Crear contrato' });
    await dlg.getByRole('button', { name: 'Crear contrato' }).click();
    await expect(dlg.getByText(/Escribe el valor del contrato/)).toBeVisible();
    await dlg.getByLabel('Valor del contrato').fill('3000000');
    await dlg.getByLabel('Anticipo acordado (opcional)').fill('4000000');
    await dlg.getByRole('button', { name: 'Crear contrato' }).click();
    await expect(dlg.getByText('El anticipo no puede ser mayor que el valor del contrato.')).toBeVisible();
    await dlg.getByLabel('Anticipo acordado (opcional)').fill('1000000');
    await dlg.getByRole('button', { name: 'Crear contrato' }).click();
    await expect(page.getByTestId('valor-contrato')).toHaveText(/\$\s?3\.000\.000/);
    await expect(saldo(page)).toHaveText(/\$\s?3\.000\.000/);

    await page.getByRole('button', { name: 'Agregar cuota' }).click();
    dlg = page.getByRole('dialog', { name: 'Agregar cuota' });
    await dlg.getByLabel('Concepto').fill('Anticipo del sitio');
    await dlg.getByLabel('Valor', { exact: true }).fill('1000000');
    await dlg.getByLabel('Vence el').fill(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
    await dlg.getByRole('button', { name: 'Agregar cuota' }).click();
    await expect(filaCuota(page, 'Anticipo del sitio')).toContainText('Pendiente');

    await page.getByRole('button', { name: 'Registrar abono' }).click();
    dlg = page.getByRole('dialog', { name: 'Registrar abono' });
    await dlg.getByLabel('Aplicar a').selectOption({ index: 1 });
    await dlg.getByLabel('Valor', { exact: true }).fill('1000000');
    await dlg.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(saldo(page)).toHaveText(/\$\s?2\.000\.000/);
    await expect(filaCuota(page, 'Anticipo del sitio')).toContainText('Pagado');

    await page.getByRole('button', { name: 'Anular', exact: true }).click();
    dlg = page.getByRole('dialog', { name: 'Anular abono' });
    await dlg.getByLabel('Motivo').fill('no');
    await dlg.getByRole('button', { name: 'Anular abono' }).click();
    await expect(dlg.getByText(/Escribe el motivo/)).toBeVisible();
    await dlg.getByLabel('Motivo').fill('Se registró por error en este proyecto.');
    await dlg.getByRole('button', { name: 'Anular abono' }).click();
    await expect(saldo(page)).toHaveText(/\$\s?3\.000\.000/);
    await expect(page.locator('[data-testid="abono"][data-anulado="si"]')).toContainText('Se registró por error en este proyecto.');
    await expect(filaCuota(page, 'Anticipo del sitio')).toContainText('Pendiente');
  });

  test('plan atado a hitos: edita una cuota para atarla a un hito; reglas de la base con mensaje claro', async ({ page }) => {
    await entrarSuper(page);
    await irAFinanzas(page, 'Contratos y pagos');
    await expect(page.getByTestId('valor-contrato')).toHaveText(/\$\s?20\.000\.000/);
    await filaCuota(page, 'Cierre').getByRole('button', { name: /Editar cuota/ }).click();
    let dlg = page.getByRole('dialog', { name: 'Editar cuota' });
    await expect(dlg.getByLabel('Hito asociado').locator('option')).toHaveCount(5); // sin hito + 4
    await dlg.getByLabel('Hito asociado').selectOption({ label: 'Hito 4 · Entrega final' });
    await dlg.getByRole('button', { name: 'Guardar cuota' }).click();
    await expect(filaCuota(page, 'Cierre')).toContainText('Hito 4 · Entrega final');
    // las cuotas ya suman todo el contrato
    await page.getByRole('button', { name: 'Agregar cuota' }).click();
    dlg = page.getByRole('dialog', { name: 'Agregar cuota' });
    await dlg.getByLabel('Concepto').fill('Extra');
    await dlg.getByLabel('Valor', { exact: true }).fill('100000');
    await dlg.getByLabel('Vence el').fill('2030-01-01');
    await dlg.getByRole('button', { name: 'Agregar cuota' }).click();
    await expect(dlg.getByText('Las cuotas no pueden sumar más que el valor del contrato.')).toBeVisible();
    await dlg.getByRole('button', { name: 'Cancelar' }).click();
    // una cuota con abonos no se quita
    await filaCuota(page, 'Anticipo').getByRole('button', { name: /Quitar cuota/ }).click();
    dlg = page.getByRole('dialog', { name: 'Quitar cuota' });
    await dlg.getByRole('button', { name: 'Quitar cuota' }).click();
    await expect(dlg.getByText(/ya tiene abonos, comprobantes o facturas/)).toBeVisible();
  });

  test('edita el contrato: la moneda se bloquea cuando hay cuotas o abonos', async ({ page }) => {
    await entrarSuper(page);
    await irAFinanzas(page, 'Contratos y pagos');
    await page.getByRole('button', { name: 'Editar contrato' }).click();
    const dlg = page.getByRole('dialog', { name: 'Editar contrato' });
    await expect(dlg.getByLabel('Moneda')).toBeDisabled();
    await dlg.getByLabel('Valor del contrato').fill('10000000');
    await dlg.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(dlg.getByText('El valor del contrato no puede ser menor que lo ya programado o abonado.')).toBeVisible();
    await dlg.getByLabel('Valor del contrato').fill('21000000');
    await dlg.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByTestId('valor-contrato')).toHaveText(/\$\s?21\.000\.000/);
  });

  test('sube una factura PDF, no acepta número repetido ni archivos disfrazados, y la anula con motivo (el cliente lo lee)', async ({ page, browser }) => {
    await entrarSuper(page);
    await irAFinanzas(page, 'Contratos y pagos');
    await page.getByRole('button', { name: 'Subir factura' }).click();
    let dlg = page.getByRole('dialog', { name: 'Subir factura' });
    await dlg.getByRole('button', { name: 'Subir factura' }).click();
    await expect(dlg.getByText('Escribe el número de la factura.')).toBeVisible();
    await dlg.getByLabel('Número de factura').fill('FV-0002');
    await dlg.getByLabel('Valor', { exact: true }).fill('5000000');
    await dlg.getByLabel('Archivo PDF').setInputFiles({ name: 'falsa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('no soy un pdf') });
    await dlg.getByRole('button', { name: 'Subir factura' }).click();
    await expect(dlg.getByText('El archivo debe ser un PDF.')).toBeVisible();
    await dlg.getByLabel('Archivo PDF').setInputFiles({ name: 'FV-0002.pdf', mimeType: 'application/pdf', buffer: PDF });
    await dlg.getByRole('button', { name: 'Subir factura' }).click();
    await expect(page.getByTestId('factura').filter({ hasText: 'FV-0002' })).toBeVisible();
    const d = await dinero();
    expect(d.facturas.find((f: { numero: string }) => f.numero === 'FV-0002').archivo_path).toMatch(/^11111111-1111-4111-8111-111111111111\/facturas\/[0-9a-f-]{36}\.pdf$/);
    // número repetido
    await page.getByRole('button', { name: 'Subir factura' }).click();
    dlg = page.getByRole('dialog', { name: 'Subir factura' });
    await dlg.getByLabel('Número de factura').fill('FV-0002');
    await dlg.getByLabel('Valor', { exact: true }).fill('1000000');
    await dlg.getByLabel('Archivo PDF').setInputFiles({ name: 'otra.pdf', mimeType: 'application/pdf', buffer: PDF });
    await dlg.getByRole('button', { name: 'Subir factura' }).click();
    await expect(dlg.getByText('Ya existe una factura con ese número.')).toBeVisible();
    await dlg.getByRole('button', { name: 'Cancelar' }).click();
    // anular
    await page.getByTestId('factura').filter({ hasText: 'FV-0002' }).getByRole('button', { name: 'Anular' }).click();
    dlg = page.getByRole('dialog', { name: 'Anular factura' });
    await dlg.getByLabel('Motivo').fill('Valor mal digitado, se emitirá de nuevo.');
    await dlg.getByRole('button', { name: 'Anular factura' }).click();
    await expect(page.getByTestId('factura').filter({ hasText: 'FV-0002' })).toContainText('Anulada: Valor mal digitado, se emitirá de nuevo.');
    // el cliente la ve anulada, con el motivo y sin descarga
    const ctx = await browser.newContext({ baseURL: BASE });
    const cli = await ctx.newPage();
    await entrarCliente(cli);
    await irADinero(cli);
    const f = cli.getByTestId('factura').filter({ hasText: 'FV-0002' });
    await expect(f).toContainText('Anulada: Valor mal digitado, se emitirá de nuevo.');
    await expect(f.getByRole('button')).toHaveCount(0);
    await ctx.close();
  });

  test('ingresos por mes y por cliente, una sección por moneda sin mezclarlas', async ({ page }) => {
    await entrarSuper(page);
    await irAFinanzas(page, 'Ingresos');
    const cop = page.locator('[data-moneda="COP"]');
    const usd = page.locator('[data-moneda="USD"]');
    await expect(cop).toBeVisible();
    await expect(usd).toBeVisible();
    await expect(cop.getByTestId('ingreso-mes')).toHaveCount(1);
    await expect(cop.getByTestId('ingreso-mes')).toContainText(/\$\s?6\.000\.000/);
    await expect(cop.getByTestId('ingreso-cliente')).toContainText('Comercial Ejemplo S.A.S.');
    await expect(usd.getByTestId('ingreso-mes')).toContainText(/US\$\s?1\.500,00/);
    await expect(cop).not.toContainText('US$');
    await expect(usd).not.toContainText('6.000.000');
    // el abono anulado (1.000.000) no cuenta
    await expect(cop).not.toContainText('7.000.000');
  });

  test('un super admin no puede confirmar con valor mayor al saldo, y la bandeja se queda como estaba', async ({ page, browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const cli = await ctx.newPage();
    await entrarCliente(cli);
    await irADinero(cli);
    await (await subirComprobante(cli, 'sprints 1 y 2')).getByRole('button', { name: 'Enviar comprobante' }).click();
    await expect(filaCuota(cli, 'sprints 1 y 2')).toContainText('En revisión');
    await ctx.close();
    await entrarSuper(page);
    await irAFinanzas(page);
    await page.getByRole('button', { name: 'Confirmar' }).click();
    const dlg = page.getByRole('dialog', { name: 'Confirmar comprobante' });
    await dlg.getByLabel('Valor recibido').fill('99000000');
    await dlg.getByRole('button', { name: 'Confirmar y registrar abono' }).click();
    await expect(dlg.getByText('El abono es mayor que el saldo del contrato.')).toBeVisible();
    await dlg.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('comprobante-pendiente')).toHaveCount(1);
  });
});

test('ningún texto del módulo menciona IA ni personas inventadas', async ({ page }) => {
  await entrarCliente(page);
  await irADinero(page);
  const texto = (await page.locator('body').innerText()).toLowerCase();
  for (const prohibido of ['inteligencia artificial', 'claude', 'agente', 'modelo de ia', 'openai', 'chatgpt']) expect(texto).not.toContain(prohibido);
});

test('el estado de la base no cambia solo por mirar: leer no escribe', async ({ page }) => {
  await entrarCliente(page);
  const antes = await dinero();
  await irADinero(page);
  const despues = await dinero();
  expect(despues.abonos).toEqual(antes.abonos);
  expect(despues.comprobantes).toEqual(antes.comprobantes);
  expect((await estadoMock()).bitacora).toBeGreaterThan(0);
});
