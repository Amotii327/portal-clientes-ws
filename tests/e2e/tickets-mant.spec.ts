import { expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MOCK, abrirSesion, entrarCliente, entrarSuper, reiniciar } from './ayudas';

/**
 * Módulos 5 (Tickets) y 10 (Mantenimiento) con el Supabase simulado (tests/mock-supabase/tickets-mant.mjs).
 * Un grupo por rol: administrador del cliente, equipo (con y sin "ver todos"), empresa sin mantenimiento y super admin.
 */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const estadoTM = async () => (await (await fetch(`${MOCK}/__tm`)).json()) as { tickets: Record<string, unknown>[]; adjuntos: Record<string, unknown>[]; rechazos: { accion: string; codigo: string }[]; planes: Record<string, unknown>[]; historial: Record<string, unknown>[]; horas: Record<string, unknown>[]; garantias: Record<string, unknown>[]; archivos: string[] };

test.beforeEach(async () => { await reiniciar(); });

/** El servidor corta la ruta (redirige a Sin permiso) y la persona ve el aviso. */
async function sinPermiso(page: Page, ruta: string) {
  const r = await page.request.get(ruta, { maxRedirects: 0 });
  const cuerpo = await r.text();
  expect(r.headers()['location'] ?? cuerpo, ruta).toContain('sin-permiso');
  await page.goto(ruta);
  await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' }), ruta).toBeVisible();
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menú principal' });
const abrir = async (page: Page, titulo: string) => {
  await page.getByRole('link', { name: new RegExp(titulo) }).click();
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
};
async function nuevaSesion(browser: Browser, correo: string, zona: 'cliente' | 'super' = 'cliente') {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
  const p = await ctx.newPage();
  if (zona === 'super') await entrarSuper(p); else await entrarCliente(p, correo);
  return { ctx, p };
}

test.describe('Cliente administrador', () => {
  test('lista con semáforo, solo de su empresa, y pestañas', async ({ page }) => {
    await entrarCliente(page);
    await menu(page).getByRole('link', { name: 'Tickets' }).click();
    await expect(page).toHaveURL(/\/cliente\/tickets$/);
    await expect(page.getByRole('heading', { name: 'Tickets', exact: true })).toBeVisible();
    await expect(page.getByTestId('ticket')).toHaveCount(4); // abiertos
    await expect(page.getByText('Ticket de otra empresa')).toHaveCount(0);
    await expect(page.locator('[data-semaforo="verde"]')).toHaveCount(1);
    await expect(page.locator('[data-semaforo="amarillo"]')).toHaveCount(1);
    await expect(page.locator('[data-semaforo="cumplido"]')).toHaveCount(2);
    await expect(page.getByText('Quedan 15 h hábiles')).toBeVisible();
    await page.getByRole('tab', { name: /Resueltos y cerrados/ }).click();
    await expect(page.getByTestId('ticket')).toHaveCount(2);
    await page.getByRole('tab', { name: 'Todos' }).click();
    await expect(page.getByTestId('ticket')).toHaveCount(6);
    await expect(page.getByText('Falta tu decisión')).toHaveCount(0); // eso es solo del super admin
  });

  test('crea un ticket con adjunto de imagen y lo ve en el detalle', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/tickets/nuevo');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Crear ticket' }).click(); // validación
    await expect(page.getByText('Escribe un título corto.')).toBeVisible();
    await page.getByText('Pregunta', { exact: true }).click();
    await page.getByLabel('Título').fill('No puedo ver el informe');
    await page.getByLabel('Detalle').fill('Al abrir el informe de ventas aparece una pantalla en blanco.');
    await page.getByLabel('Prioridad').selectOption('alta');
    await page.setInputFiles('#t-adj', [{ name: 'pantallazo-nuevo.png', mimeType: 'image/png', buffer: PNG }]);
    await expect(page.getByRole('list', { name: 'Archivos elegidos' }).getByText('pantallazo-nuevo.png')).toBeVisible();
    await page.getByRole('button', { name: 'Crear ticket' }).click();
    await expect(page).toHaveURL(/\/cliente\/tickets\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'No puedo ver el informe' })).toBeVisible();
    await expect(page.getByTestId('adjunto').getByText('pantallazo-nuevo.png')).toBeVisible();
    await expect(page.getByTestId('adjunto').locator('img')).toBeVisible();
    const e = await estadoTM();
    expect(e.tickets.some((t) => t.titulo === 'No puedo ver el informe' && t.prioridad_propuesta === 'alta' && t.tipo === 'pregunta')).toBe(true);
    expect(e.archivos.some((a) => a.endsWith('pantallazo-nuevo.png'))).toBe(true);
  });

  test('rechaza archivos que no son imagen, video o audio y los de más de 50 MB', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/tickets/nuevo');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#t-adj', [{ name: 'clave.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') }]);
    await expect(page.getByText('"clave.txt" no se puede adjuntar: solo imágenes, videos y audios.')).toBeVisible();
    const grande = path.join(os.tmpdir(), 'grande-prueba.mp4');
    fs.writeFileSync(grande, ''); fs.truncateSync(grande, 51 * 1024 * 1024); // archivo disperso de 51 MB
    await page.setInputFiles('#t-adj', grande);
    await expect(page.getByText(/"grande-prueba.mp4" pesa 51,0 MB. El máximo es 50 MB por archivo./)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Archivos elegidos' })).toHaveCount(0);
  });

  test('un ticket de acceso avisa que no se escriban claves', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/tickets/nuevo');
    await page.waitForLoadState('networkidle');
    await page.getByText('Acceso', { exact: true }).click();
    await expect(page.getByText('No escribas claves aquí.')).toBeVisible();
  });

  test('detalle: ve la firma por área, no ve notas internas y responde con un adjunto', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/tickets');
    await abrir(page, 'No llega el correo de confirmación');
    await expect(page.getByText('Equipo Websourcing · Desarrollo')).toBeVisible();
    await expect(page.getByText('Nota interna')).toHaveCount(0);
    await expect(page.getByText('parece un problema del proveedor')).toHaveCount(0);
    await expect(page.getByTestId('adjunto')).toHaveCount(1);
    await page.getByLabel('Escribe tu respuesta').fill('Ya probé de nuevo y sigue igual.');
    await page.setInputFiles('#tk-adj', [{ name: 'video-error.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(1000) }]);
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Ya probé de nuevo y sigue igual.')).toBeVisible();
    await expect(page.getByTestId('adjunto')).toHaveCount(2);
  });

  test('solicitud de cambio con cobro: ve el valor y la acepta', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/tickets');
    await page.getByRole('tab', { name: 'Todos' }).click();
    await abrir(page, 'Nuevo módulo de cupones');
    await expect(page.getByTestId('cobro').getByText('$ 450.000 COP')).toBeVisible();
    await expect(page.getByText('Falta la aceptación del administrador de tu empresa')).toBeVisible();
    await page.getByRole('button', { name: 'Acepto el cobro' }).click();
    await expect(page.getByText(/Aceptado el/)).toBeVisible();
    await expect(page.getByTestId('cobro').getByRole('button', { name: 'Acepto el cobro' })).toHaveCount(0);
    expect((await estadoTM()).tickets.find((t) => t.titulo === 'Nuevo módulo de cupones')).toMatchObject({ estado: 'en_progreso' });
  });

  test('solicitud de cambio con cobro: puede no aceptarlo y el ticket se cierra', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/tickets');
    await page.getByRole('tab', { name: 'Todos' }).click();
    await abrir(page, 'Nuevo módulo de cupones');
    await page.getByRole('button', { name: 'No acepto' }).click();
    await page.getByRole('button', { name: 'Sí, no acepto' }).click();
    await expect(page.getByText('Este ticket está cerrado.')).toBeVisible();
    expect((await estadoTM()).tickets.find((t) => t.titulo === 'Nuevo módulo de cupones')).toMatchObject({ estado: 'cerrado', cierre_motivo: 'cobro_rechazado' });
  });

  test('resuelto: lo confirma, se cierra y califica de 1 a 5', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/tickets');
    await page.getByRole('tab', { name: /Resueltos y cerrados/ }).click();
    await abrir(page, 'El botón de pago se queda cargando');
    await expect(page.getByText('Corregimos el tiempo de espera del botón de pago.')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmo que quedó resuelto' }).click();
    await expect(page.getByText('¿Cómo te atendimos?')).toBeVisible();
    await page.getByRole('radio', { name: '4 de 5' }).click();
    await page.getByLabel('Comentario (opcional)').fill('Rápidos y claros.');
    await page.getByRole('button', { name: 'Enviar calificación' }).click();
    await expect(page.getByText('Gracias por calificar la atención')).toBeVisible();
    expect((await estadoTM()).tickets.find((t) => t.titulo === 'El botón de pago se queda cargando')).toMatchObject({ estado: 'cerrado', calificacion: 4 });
  });

  test('Mi mantenimiento: plan, horas usadas, aviso del 80 % y horas por decidir', async ({ page }) => {
    await entrarCliente(page);
    await menu(page).getByRole('link', { name: 'Mi plan de mantenimiento' }).click();
    await expect(page).toHaveURL(/\/cliente\/mantenimiento$/, { timeout: 30_000 });
    await expect(page.getByText('Plan Estándar')).toBeVisible();
    await expect(page.getByTestId('bolsa')).toContainText('6,5 h');
    await expect(page.getByTestId('bolsa')).toContainText('de 8 h');
    await expect(page.getByText('Ya usaste el 80 % de tus horas de este mes')).toBeVisible();
    await expect(page.getByText('$ 600.000 COP')).toBeVisible();
    await expect(page.getByText('Lunes a viernes · 08:00 a 18:00')).toBeVisible();
    await expect(page.getByRole('cell', { name: '1 hora hábil' })).toBeVisible(); // tiempos del plan (reemplazan los generales)
    await expect(page.getByRole('cell', { name: '4 horas hábiles' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '1 día hábil' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Siguiente planeación' })).toBeVisible(); // baja: sin cambio, queda el general
  });

  test('el cliente nunca ve las horas pendientes de revisión', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/mantenimiento');
    await page.waitForLoadState('networkidle');
    const filas = page.getByRole('row');
    await expect(filas.filter({ hasText: 'Descontada de la bolsa' })).toHaveCount(1);
    await expect(page.getByText('En revisión')).toHaveCount(0);
  });
});

test.describe('Equipo del cliente', () => {
  test('sin "ver todos": solo ve sus tickets y no se cuela por la dirección', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    await page.goto('/cliente/tickets');
    await page.getByRole('tab', { name: 'Todos' }).click();
    await expect(page.getByTestId('ticket')).toHaveCount(1);
    await expect(page.getByText('Pregunta sobre el reporte de ventas')).toBeVisible();
    await expect(page.getByText('Estas son las solicitudes que creaste tú.')).toBeVisible();
    const e = await estadoTM();
    const ajeno = e.tickets.find((t) => t.titulo === 'No llega el correo de confirmación')!;
    await page.goto(`/cliente/tickets/${ajeno.id}`);
    await expect(page.getByText('Este ticket no existe o no es de tu empresa.')).toBeVisible();
    await expect(page.getByText('No llega el correo de confirmación')).toHaveCount(0);
  });

  test('no ve Mi mantenimiento en el menú y la dirección lo lleva a "Sin permiso"', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    await expect(menu(page).getByRole('link', { name: 'Tickets' })).toBeVisible();
    await expect(menu(page).getByText('Mi plan de mantenimiento')).toHaveCount(0);
    await sinPermiso(page, '/cliente/mantenimiento');
  });

  test('con "ver todos": ve todos los de la empresa, pero no acepta cobros', async ({ page }) => {
    await entrarCliente(page, 'equipo-todos@cliente.test');
    await page.goto('/cliente/tickets');
    await page.getByRole('tab', { name: 'Todos' }).click();
    await expect(page.getByTestId('ticket')).toHaveCount(6);
    await expect(page.getByText('Todas las solicitudes de tu empresa.')).toBeVisible();
    await abrir(page, 'Nuevo módulo de cupones');
    await expect(page.getByText('Solo lo acepta el administrador')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acepto el cobro' })).toHaveCount(0);
    await expect(page.getByTestId('cobro').getByText('Valor oculto')).toBeVisible(); // no tiene permiso de dinero
  });

  test('el equipo puede confirmar un ticket resuelto que creó él mismo', async ({ page }) => {
    await entrarCliente(page, 'equipo-dinero@cliente.test');
    await page.goto('/cliente/tickets');
    await page.getByRole('tab', { name: /Resueltos y cerrados/ }).click();
    await abrir(page, 'El botón de pago se queda cargando');
    await expect(page.getByRole('button', { name: 'Confirmo que quedó resuelto' })).toBeVisible(); // es suyo
  });
});

test.describe('Empresa sin mantenimiento', () => {
  test('no ve el módulo, ni por menú ni por dirección, y solo ve lo suyo', async ({ page }) => {
    await entrarCliente(page, 'admin@otra.test');
    await expect(menu(page).getByRole('link', { name: 'Tickets' })).toBeVisible();
    await expect(menu(page).getByText('Mi plan de mantenimiento')).toHaveCount(0);
    await sinPermiso(page, '/cliente/mantenimiento');
    await page.goto('/cliente/tickets');
    await expect(page.getByTestId('ticket')).toHaveCount(1);
    await expect(page.getByText('Ticket de otra empresa')).toBeVisible();
    await expect(page.getByText('No llega el correo de confirmación')).toHaveCount(0);
  });

  test('un error sin garantía ni plan queda "fuera de plan" y el cliente lo entiende', async ({ page }) => {
    await entrarCliente(page, 'admin@otra.test');
    await page.goto('/cliente/tickets/nuevo');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Título').fill('Error al guardar pedidos');
    await page.getByLabel('Detalle').fill('Cuando guardo un pedido sale un mensaje de error.');
    await page.getByRole('button', { name: 'Crear ticket' }).click();
    await expect(page.getByText('Este ticket está fuera de plan')).toBeVisible();
    await expect(page.getByText(/tu empresa no tiene un plan de mantenimiento activo/)).toBeVisible();
  });
});

test.describe('Super admin', () => {
  test('bandeja: todas las empresas, semáforo y filtros', async ({ page }) => {
    await entrarSuper(page);
    await menu(page).getByRole('link', { name: 'Tickets de todos' }).click();
    await expect(page).toHaveURL(/\/admin\/tickets$/);
    await expect(page.getByTestId('ticket')).toHaveCount(5); // abiertos de las dos empresas
    await expect(page.getByTestId('ticket').first()).toContainText('Ticket de otra empresa'); // el amarillo más urgente va primero
    await page.getByLabel('Cliente').selectOption({ label: 'Tercera Empresa S.A.S.' });
    await expect(page.getByTestId('ticket')).toHaveCount(1);
    await page.getByLabel('Cliente').selectOption('todas');
    await page.getByLabel('Semáforo').selectOption('verde');
    await expect(page.getByTestId('ticket')).toHaveCount(1);
    await expect(page.getByText('Pregunta sobre el reporte de ventas')).toBeVisible();
    await page.getByLabel('Semáforo').selectOption('todos');
    await page.getByLabel('Prioridad').selectOption('urgente');
    await expect(page.getByTestId('ticket')).toHaveCount(1);
    await page.getByLabel('Prioridad').selectOption('todas');
    await page.getByRole('tab', { name: /Por decidir/ }).click();
    await expect(page.getByTestId('ticket')).toHaveCount(1);
    await expect(page.getByText('Falta tu decisión')).toBeVisible();
  });

  test('clasifica, responde firmando por área y deja una nota interna que el cliente no ve', async ({ page, browser }) => {
    await entrarSuper(page);
    await page.goto('/admin/tickets');
    await abrir(page, 'Pregunta sobre el reporte de ventas');
    await page.getByLabel('Prioridad confirmada').selectOption('alta');
    await page.getByRole('button', { name: 'Confirmar clasificación' }).click();
    await expect(page.getByText('Clasificación guardada.')).toBeVisible();
    await page.getByLabel('Responde el área').selectOption('Calidad');
    await page.getByLabel('Firmará: Equipo Websourcing · Calidad').fill('El reporte se genera por mes. Te enviamos el paso a paso.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByTestId('mensaje').filter({ hasText: 'Equipo Websourcing · Calidad' })).toBeVisible();
    await page.getByLabel('Nota interna (el cliente no la ve)').first().check();
    await page.getByLabel('Firmará: Nota interna').fill('Cliente con poco manejo de reportes.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Cliente con poco manejo de reportes.')).toBeVisible();
    await expect(page.getByText('solo lo ve Websourcing')).toBeVisible();
    const { ctx, p } = await nuevaSesion(browser, 'equipo@cliente.test');
    await p.goto('/cliente/tickets');
    await abrir(p, 'Pregunta sobre el reporte de ventas');
    await expect(p.getByText('Equipo Websourcing · Calidad')).toBeVisible();
    await expect(p.getByText('Cliente con poco manejo de reportes.')).toHaveCount(0);
    await ctx.close();
  });

  test('cambia el estado: resuelto exige escribir qué se hizo', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/tickets');
    await abrir(page, 'No llega el correo de confirmación');
    await page.locator('#g-estado').selectOption('resuelto');
    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await expect(page.getByText('Para marcarlo como resuelto escribe cómo se resolvió.')).toBeVisible();
    await page.getByLabel('Qué se hizo (lo ve el cliente)').fill('Cambiamos de proveedor de correo.');
    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await expect(page.getByText('Resolución enviada al cliente')).toBeVisible();
  });

  test('solicitud de cambio: no se trabaja sin decisión; cobrar, y el admin del cliente lo acepta', async ({ page, browser }) => {
    await entrarSuper(page);
    await page.goto('/admin/tickets');
    await abrir(page, 'Agregar exportación a Excel');
    await page.locator('#g-estado').selectOption('en_progreso');
    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await expect(page.getByText('Este ticket necesita primero la decisión del dueño (regalar, cobrar o rechazar).')).toBeVisible();
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await expect(page.getByText('Para cobrar indica el valor y la moneda.')).toBeVisible();
    await page.getByLabel('Valor a cobrar').fill('300000');
    await page.getByLabel('Motivo (se guarda)').fill('Incluye dos pantallas');
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await expect(page.getByTestId('decision').getByText(/cobrar \$ 300\.000 COP/)).toBeVisible();
    const e = await estadoTM();
    expect(e.rechazos.some((r) => r.accion === 'decidir_ticket' && r.codigo === 'valor_cobro_requerido')).toBe(true); // el intento rechazado queda anotado
    const { ctx, p } = await nuevaSesion(browser, 'admin@cliente.test');
    await p.goto('/cliente/tickets');
    await p.getByRole('tab', { name: 'Todos' }).click();
    await abrir(p, 'Agregar exportación a Excel');
    await expect(p.getByTestId('cobro').getByText('$ 300.000 COP')).toBeVisible();
    await p.getByRole('button', { name: 'Acepto el cobro' }).click();
    await expect(p.getByText(/Aceptado el/)).toBeVisible();
    await ctx.close();
  });

  test('rechazar una solicitud pide motivo y cierra el ticket', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/tickets');
    await abrir(page, 'Agregar exportación a Excel');
    await page.getByRole('button', { name: 'Rechazar', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, rechazar' }).click();
    await expect(page.getByText('Escribe el motivo (mínimo 3 caracteres).')).toBeVisible();
    await page.getByLabel('Motivo (obligatorio)').fill('Está fuera del alcance del proyecto');
    await page.getByRole('button', { name: 'Sí, rechazar' }).click();
    await expect(page.getByText('Este ticket está cerrado.').first()).toBeVisible();
  });

  test('marca un error como solicitud de cambio', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/tickets');
    await abrir(page, 'Pregunta sobre el reporte de ventas');
    await page.getByRole('button', { name: 'Marcar como solicitud de cambio' }).click();
    await page.getByRole('button', { name: 'Sí, marcar' }).click();
    await expect(page.getByTestId('decision')).toBeVisible();
    expect((await estadoTM()).tickets.find((t) => t.titulo === 'Pregunta sobre el reporte de ventas')).toMatchObject({ tipo: 'solicitud_cambio', tipo_original: 'pregunta' });
  });

  test('anota horas y las revisa: al aprobar se descuentan de la bolsa', async ({ page, browser }) => {
    await entrarSuper(page);
    await page.goto('/admin/tickets');
    await abrir(page, 'No llega el correo de confirmación');
    await page.getByLabel('Horas', { exact: true }).fill('0,5');
    await page.getByRole('button', { name: 'Anotar horas' }).click();
    await expect(page.getByRole('list', { name: 'Horas de este ticket' }).getByText('Por revisar')).toBeVisible();
    await page.goto('/admin/mantenimiento');
    await page.getByTestId('empresa-mant').filter({ hasText: 'Comercial Ejemplo' }).getByRole('link', { name: 'Configurar' }).click();
    await expect(page.getByTestId('hora-pendiente')).toHaveCount(2);
    await expect(page.getByTestId('bolsa-admin')).toContainText('6,5 h de 8 h');
    await page.getByTestId('hora-pendiente').filter({ hasText: 'T-0001' }).getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByText('Horas aprobadas y descontadas de la bolsa.')).toBeVisible();
    await expect(page.getByTestId('bolsa-admin')).toContainText('7 h de 8 h');
    await page.getByTestId('hora-pendiente').getByRole('button', { name: 'Rechazar' }).click();
    await page.getByRole('button', { name: 'Sí, rechazar' }).click();
    await expect(page.getByText('Escribe el motivo (mínimo 3 caracteres).')).toBeVisible();
    await page.getByLabel('Motivo', { exact: true }).fill('No corresponde al plan');
    await page.getByRole('button', { name: 'Sí, rechazar' }).click();
    await expect(page.getByTestId('hora-pendiente')).toHaveCount(0);
    const { ctx, p } = await nuevaSesion(browser, 'admin@cliente.test');
    await p.goto('/cliente/mantenimiento');
    await expect(p.getByTestId('bolsa')).toContainText('7 h');
    await ctx.close();
  });

  test('activa el mantenimiento de una empresa, lo configura con historial y lo apaga', async ({ page, browser }) => {
    await entrarSuper(page);
    await menu(page).getByRole('link', { name: 'Mantenimiento' }).click();
    const tarjeta = page.getByTestId('empresa-mant').filter({ hasText: 'Tercera Empresa' });
    await expect(tarjeta.getByText('Apagado', { exact: true })).toBeVisible();
    await tarjeta.getByRole('button', { name: 'Activar' }).click();
    await page.getByRole('button', { name: 'Activar', exact: true }).click();
    await expect(page.getByText('Indica la cuota mensual.')).toBeVisible();
    await page.getByLabel('Plan base').selectOption('premium');
    await page.getByLabel('Cuota mensual').fill('900000');
    await page.getByRole('button', { name: 'Activar', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/mantenimiento\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByTestId('formulario-plan')).toBeVisible();
    await expect(page.getByLabel('Horas al mes')).toHaveValue('16'); // punto de partida del plan base
    await expect(page.getByLabel('Cuota mensual')).toHaveValue('900000');
    // el cliente de esa empresa ya ve el módulo
    const { ctx, p } = await nuevaSesion(browser, 'admin@otra.test');
    await expect(menu(p).getByRole('link', { name: 'Mi plan de mantenimiento' })).toBeVisible();
    // configurar: sin motivo no deja; con cambios queda en el historial
    await page.getByLabel('Horas al mes').fill('12');
    await page.getByRole('combobox', { name: 'Tipo de plazo Urgente' }).selectOption('horas');
    await page.getByLabel('Cantidad Urgente').fill('1,5');
    await page.getByLabel('Valor de la hora extra').fill('100000');
    await page.getByLabel('Sábado').check();
    await page.getByRole('button', { name: /Guardar plan/ }).click();
    await expect(page.getByText('El motivo es obligatorio (mínimo 3 caracteres).')).toBeVisible();
    await page.getByLabel('Aplica').selectOption('hoy');
    await page.getByLabel('Motivo del cambio').fill('Acuerdo en la reunión');
    await page.getByRole('button', { name: /Guardar plan/ }).click();
    await expect(page.getByText(/Plan guardado\. 4 cambio\(s\)/)).toBeVisible();
    const fila = page.getByTestId('historial').filter({ hasText: 'Cambio de parámetros' });
    await expect(fila).toContainText('Horas al mes: 16 → 12');
    await expect(fila).toContainText('Acuerdo en la reunión');
    await p.goto('/cliente/mantenimiento');
    await expect(p.getByText('Plan Premium')).toBeVisible();
    await expect(p.getByText('Lunes a sábado · 08:00 a 18:00')).toBeVisible();
    await expect(p.getByRole('cell', { name: '1,5 horas hábiles' })).toBeVisible();
    // apagar
    await page.getByRole('button', { name: 'Apagar mantenimiento' }).click();
    await page.getByRole('button', { name: 'Sí, apagar' }).click();
    await expect(page.getByText('Escribe el motivo (mínimo 3 caracteres).')).toBeVisible();
    await page.getByLabel('Motivo', { exact: true }).fill('El cliente no renovó');
    await page.getByRole('button', { name: 'Sí, apagar' }).click();
    await expect(page.getByText('El mantenimiento está apagado')).toBeVisible();
    await sinPermiso(p, '/cliente/mantenimiento');
    await ctx.close();
  });

  test('registra la garantía de una empresa', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/mantenimiento');
    await page.getByTestId('empresa-mant').filter({ hasText: 'Tercera Empresa' }).getByRole('link', { name: 'Configurar' }).click();
    await expect(page.getByText('Sin garantía registrada.').first()).toBeVisible();
    await page.getByRole('button', { name: 'Registrar garantía' }).click();
    await expect(page.getByText('Indica una fecha de vencimiento posterior al inicio.')).toBeVisible();
    await page.getByLabel('Vence').fill('2099-12-31');
    await page.getByLabel('Nota (opcional)').fill('30 días desde la entrega');
    await page.getByRole('button', { name: 'Registrar garantía' }).click();
    await expect(page.getByTestId('garantia')).toContainText('Vigente');
    expect((await estadoTM()).garantias.filter((g) => g.vence_en === '2099-12-31')).toHaveLength(1);
  });

  test('plan a la medida: pide las horas incluidas al activar', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/mantenimiento');
    await page.getByTestId('empresa-mant').filter({ hasText: 'Tercera Empresa' }).getByRole('button', { name: 'Activar' }).click();
    await page.getByLabel('Plan base').selectOption('personalizado');
    await page.getByLabel('Cuota mensual').fill('500000');
    await page.getByRole('button', { name: 'Activar', exact: true }).click();
    await expect(page.getByText('Indica las horas incluidas al mes.')).toBeVisible();
    await page.getByLabel('Horas incluidas al mes').fill('5');
    await page.getByRole('button', { name: 'Activar', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/mantenimiento\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByLabel('Horas al mes')).toHaveValue('5');
  });

  test('horas de una solicitud de cambio: se anotan, quedan "sin descuento" y no tocan la bolsa', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/tickets');
    await abrir(page, 'Agregar exportación a Excel');
    await page.getByLabel('Horas', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Anotar horas' }).click();
    await expect(page.getByRole('list', { name: 'Horas de este ticket' }).getByText('Sin descuento')).toBeVisible();
    await page.goto('/admin/mantenimiento');
    await page.getByTestId('empresa-mant').filter({ hasText: 'Comercial Ejemplo' }).getByRole('link', { name: 'Configurar' }).click();
    await page.getByTestId('hora-pendiente').filter({ hasText: 'T-0003' }).getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByTestId('bolsa-admin')).toContainText('6,5 h de 8 h');
  });
});

test.describe('Guardia de servidor en las rutas nuevas', () => {
  test('un cliente no entra a las pantallas del super admin', async ({ page }) => {
    await entrarCliente(page);
    for (const ruta of ['/admin/tickets', '/admin/mantenimiento', '/admin/tickets/11111111-1111-4111-8111-111111111111', '/admin/mantenimiento/11111111-1111-4111-8111-111111111111']) {
      await sinPermiso(page, ruta);
    }
  });
  test('el super admin no entra a las pantallas del cliente y un id raro no llega a la base', async ({ page }) => {
    await entrarSuper(page);
    for (const ruta of ['/cliente/tickets', '/cliente/tickets/nuevo', '/cliente/mantenimiento']) {
      await sinPermiso(page, ruta);
    }
    await sinPermiso(page, '/admin/tickets/no-es-un-id');
  });
  test('sin sesión no se ve nada', async ({ page }) => {
    await page.goto('/cliente/tickets');
    await expect(page).toHaveURL(/\/entrar/);
    await page.goto('/admin/mantenimiento');
    await expect(page).toHaveURL(/\/entrar/);
  });
  test('la pausada no llega a los tickets', async ({ page }) => {
    await abrirSesion(page, 'pausada@servicios.test');
    await page.goto('/cliente/tickets');
    await expect(page.locator('[data-estado-acceso="empresa_pausada"]')).toBeVisible();
  });
});
