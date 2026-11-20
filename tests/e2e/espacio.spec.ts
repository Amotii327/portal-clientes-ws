import { expect, test } from '@playwright/test';
import { entrarCliente, entrarSuper, MOCK, reiniciar } from './ayudas';

/**
 * Solicitud de cambio 5 (ahorro de espacio), pantallas reales con Supabase simulado (tests/mock-supabase/espacio.mjs).
 * Datos de partida: Comercial Ejemplo usa 380 MB de 1 GB; Servicios Demo 24 MB; hay 4 archivos archivados o por archivar.
 */
const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const MB = 1024 * 1024;
test.beforeEach(async () => { await reiniciar(); });
const fijar = (datos: Record<string, unknown>) => fetch(`${MOCK}/__espacio`, { method: 'POST', body: JSON.stringify({ empresa_id: EMPRESA_A, ...datos }) });
const estado = async () => (await (await fetch(`${MOCK}/__espacio`)).json()) as { cupos: Record<string, number>; archivados: { nombre_original: string; estado: string }[] };

test.describe('Espacio · super admin', () => {
  test('ve el uso de cada empresa, cambia el cupo, vuelve al cupo por defecto y valida los límites', async ({ page }) => {
    await entrarSuper(page);
    await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Espacio de clientes' }).click();
    await expect(page).toHaveURL(/\/admin\/espacio/);
    await expect(page.getByRole('heading', { name: 'Espacio de los clientes', level: 1 })).toBeVisible();
    const fila = page.getByTestId('fila-espacio').filter({ hasText: 'Comercial Ejemplo' });
    await expect(fila).toContainText('380 MB');
    await expect(fila).toContainText('1,0 GB');
    await expect(fila).toContainText('37 %');
    // cambiar el cupo a 2 GB
    await fila.getByRole('button', { name: /Cambiar el cupo de Comercial Ejemplo/ }).click();
    await page.getByLabel('Cupo', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Guardar cupo' }).click();
    await expect(page.getByTestId('fila-espacio').filter({ hasText: 'Comercial Ejemplo' })).toContainText('2,0 GB');
    await expect(page.getByTestId('fila-espacio').filter({ hasText: 'Comercial Ejemplo' })).toContainText('19 %');
    expect((await estado()).cupos[EMPRESA_A]).toBe(2 * 1024 * MB);
    // un cupo demasiado chico se rechaza con un mensaje claro
    await page.getByRole('button', { name: /Cambiar el cupo de Comercial Ejemplo/ }).click();
    await page.getByLabel('Unidad').selectOption('MB');
    await page.getByLabel('Cupo', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Guardar cupo' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'entre 10 MB y 1.024 GB' })).toBeVisible();
    // volver al cupo por defecto
    await page.getByRole('button', { name: 'Volver al cupo por defecto' }).click();
    await expect(page.getByTestId('fila-espacio').filter({ hasText: 'Comercial Ejemplo' })).toContainText('37 %');
    expect((await estado()).cupos[EMPRESA_A]).toBeUndefined();
  });

  test('lista los archivos archivados o por archivar y permite pedir uno de vuelta', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/espacio');
    const filas = page.getByTestId('fila-archivado');
    await expect(filas).toHaveCount(4);
    await expect(filas.filter({ hasText: 'manual-anterior.pdf' })).toContainText('Por archivar');
    await expect(filas.filter({ hasText: 'planos-bodega-v1.pdf' })).toContainText('ya no ocupa espacio');
    await expect(filas.filter({ hasText: 'manual-anterior.pdf' }).getByRole('button')).toHaveCount(0); // aún no está archivado: nada que pedir
    await filas.filter({ hasText: 'video-demo-sprint-1.mp4' }).getByRole('button', { name: /Pedir de vuelta/ }).click();
    await expect(filas.filter({ hasText: 'video-demo-sprint-1.mp4' })).toContainText('Recuperación pedida');
    expect((await estado()).archivados.find((a) => a.nombre_original === 'video-demo-sprint-1.mp4')?.estado).toBe('recuperacion_pedida');
  });

  test('un cliente no entra a la pantalla de espacio de Websourcing', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/admin/espacio');
    await expect(page).toHaveURL(/\/sin-permiso/);
  });
});

test.describe('Espacio · cliente', () => {
  test('el administrador ve su barra de espacio sin aviso por debajo del 80 %', async ({ page }) => {
    await entrarCliente(page);
    const barra = page.getByTestId('espacio-cliente');
    await expect(barra).toBeVisible();
    await expect(barra).toHaveAttribute('data-estado', 'ok');
    await expect(page.getByTestId('espacio-texto')).toContainText('380 MB de 1,0 GB · 37 %');
    await expect(page.getByTestId('espacio-aviso')).toHaveCount(0);
    await expect(page.getByTestId('espacio-lleno')).toHaveCount(0);
  });

  test('al 80 % avisa, y al 100 % explica con claridad que no se puede subir más', async ({ page }) => {
    await fijar({ usado_bytes: 860 * MB }); // 84 %
    await entrarCliente(page);
    await expect(page.getByTestId('espacio-cliente')).toHaveAttribute('data-estado', 'aviso');
    await expect(page.getByTestId('espacio-aviso')).toContainText('Ya usaste el 80 % de tu espacio');
    await expect(page.getByTestId('espacio-aviso')).toContainText('pídenos ampliar el cupo');
    await fijar({ usado_bytes: 1024 * MB }); // 100 %
    await page.goto('/cliente/archivos');
    await expect(page.getByTestId('espacio-cliente')).toHaveAttribute('data-estado', 'lleno');
    await expect(page.getByTestId('espacio-lleno')).toContainText('Tu espacio está lleno');
    await expect(page.getByTestId('espacio-lleno')).toContainText('No puedes subir archivos nuevos');
    // intentar subir un archivo con el espacio lleno da el mismo mensaje claro, sin guardar nada
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'catalogo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') });
    await page.getByRole('button', { name: 'Subir archivo' }).click();
    await expect(page.getByText('El espacio de tu empresa está lleno.')).toBeVisible();
    await expect(page.locator('li[data-archivo]', { hasText: 'catalogo.pdf' })).toHaveCount(0);
  });

  test('quien no es administrador no ve la barra de espacio', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('espacio-cliente')).toHaveCount(0);
  });
});
