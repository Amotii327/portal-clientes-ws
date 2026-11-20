import { expect, test } from '@playwright/test';
import { entrarCliente, entrarSuper, reiniciar } from './ayudas';
import { ID, PNG, darPermisos, estadoRD, iniciarVerComo, menu, sinIA } from './ayudas-revdocs';

test.beforeEach(async () => { await reiniciar(); });

test.describe('Revisiones · cliente', () => {
  test('lista: pendientes arriba, respondidas abajo, sin borradores ni datos de otra empresa', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/revisiones');
    await expect(page.getByRole('heading', { name: 'Revisiones', level: 1 })).toBeVisible();
    await expect(page.getByText('Tienes 1 revisión por aprobar')).toBeVisible();
    const pend = page.getByRole('region', { name: 'Esperan tu respuesta' });
    await expect(pend.getByText('Diseño y prototipo del portal')).toBeVisible();
    await expect(pend.getByText('Esperando tu aprobación')).toBeVisible();
    const resp = page.getByRole('region', { name: 'Respondidas' });
    await expect(resp.getByText('Sprint 1: Pedidos y catálogo')).toBeVisible();
    await expect(resp.getByText('Aprobada')).toBeVisible();
    await expect(resp.getByText('Sprint 3: Informes')).toBeVisible();
    await expect(resp.getByText('Cambios pedidos')).toBeVisible();
    // el borrador y lo de otra empresa no llegan
    await expect(page.getByText('Sprint 2: Pagos y facturas')).toHaveCount(0);
    await expect(page.getByText('Sprint 1: Reservas')).toHaveCount(0);
    await sinIA(page);
  });

  test('el menú ya no marca Revisiones ni Documentos como "Pronto"', async ({ page }) => {
    await entrarCliente(page);
    await expect(menu(page).getByRole('link', { name: /Revisiones/ })).not.toContainText('Pronto');
    await expect(menu(page).getByRole('link', { name: /Documentos/ })).not.toContainText('Pronto');
  });

  test('detalle con versiones, respuestas, captura y acta descargable; sin evidencia (IP, navegador)', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/revisiones');
    await page.getByRole('link', { name: /Sprint 1: Pedidos y catálogo/ }).click();
    await expect(page).toHaveURL(new RegExp(`/cliente/revisiones/${ID.revSprint1}`));
    await expect(page.getByText('Versión 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Versión 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
    await expect(page.getByText(/Cambios pedidos por Admina Prueba/)).toBeVisible();
    await expect(page.getByText(/Aprobada por Admina Prueba/)).toBeVisible();
    await expect(page.getByText('El botón de nuevo pedido debe verse más grande.')).toBeVisible();
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar captura' }).click()]);
    expect(d.suggestedFilename()).toBeTruthy();
    // no hay botones de respuesta: ya está aprobada
    await expect(page.getByRole('button', { name: 'Apruebo' })).toHaveCount(0);
    const t = await page.locator('body').innerText();
    expect(t).not.toContain('190.24.10.5');
    expect(t).not.toContain('Evidencia');
    expect(t).not.toContain('Mozilla');
  });

  test('diseño: links https, acta con descarga y "Apruebo" con confirmación que dice que no se deshace', async ({ page }) => {
    await entrarCliente(page);
    await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
    await expect(page.getByRole('link', { name: 'Abrir link de prueba' })).toHaveAttribute('href', 'https://prototipo.ejemplo.test/portal');
    await expect(page.getByRole('link', { name: 'Abrir link de prueba' })).toHaveAttribute('rel', /noopener/);
    await expect(page.getByRole('link', { name: 'Ver video' })).toHaveAttribute('href', 'https://video.ejemplo.test/recorrido');
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar acta' }).click()]);
    expect(d.suggestedFilename()).toBe('acta-demo-1.pdf');
    await page.getByRole('button', { name: 'Apruebo', exact: true }).click();
    await expect(page.getByText('Esta respuesta no se puede deshacer')).toBeVisible();
    await expect(page.getByText(/no hay botón para deshacerla/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
    await expect(page.getByText(/Aprobada por Admina Prueba/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apruebo', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /deshacer|Reabrir/ })).toHaveCount(0);
    const rd = await estadoRD();
    const a = rd.aprobaciones.find((x: { revision_id: string }) => x.revision_id === ID.revDiseno);
    expect(a.decision).toBe('apruebo'); expect(a.version).toBe(1); expect(a._ua).toContain('Mozilla'); expect(a._ip).toBeTruthy();
  });

  test('"Pido cambios": el comentario es obligatorio, la captura es opcional y se sube', async ({ page }) => {
    await entrarCliente(page);
    await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
    await page.getByRole('button', { name: 'Pido cambios' }).click();
    await expect(page.getByText('Esta respuesta no se puede deshacer')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar cambios' }).click();
    await expect(page.getByText('Cuéntanos qué hay que cambiar (mínimo 5 caracteres).')).toBeVisible();
    await page.getByLabel('Qué hay que cambiar').fill('Hola');
    await page.getByRole('button', { name: 'Enviar cambios' }).click();
    await expect(page.getByText('Cuéntanos qué hay que cambiar (mínimo 5 caracteres).')).toBeVisible();
    // captura no permitida
    await page.getByLabel('Captura de pantalla (opcional)').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await expect(page.getByText('La captura debe ser una imagen PNG, JPG o WEBP.')).toBeVisible();
    await page.getByLabel('Captura de pantalla (opcional)').setInputFiles({ name: 'pantalla.png', mimeType: 'image/png', buffer: PNG });
    await page.getByLabel('Qué hay que cambiar').fill('El menú debe quedar a la izquierda.');
    await page.getByRole('button', { name: 'Enviar cambios' }).click();
    await expect(page.getByText(/Cambios pedidos por Admina Prueba/)).toBeVisible();
    await expect(page.getByText('El menú debe quedar a la izquierda.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descargar captura' })).toBeVisible();
    const rd = await estadoRD();
    const a = rd.aprobaciones.find((x: { revision_id: string }) => x.revision_id === ID.revDiseno);
    expect(a.decision).toBe('pido_cambios'); expect(a.captura_path).toMatch(/\/capturas\//);
  });

  test('"Pido cambios" sin captura también funciona', async ({ page }) => {
    await entrarCliente(page);
    await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
    await page.getByRole('button', { name: 'Pido cambios' }).click();
    await page.getByLabel('Qué hay que cambiar').fill('Faltan los totales por semana.');
    await page.getByRole('button', { name: 'Enviar cambios' }).click();
    await expect(page.getByText(/Cambios pedidos por Admina Prueba/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descargar captura' })).toHaveCount(0);
  });

  test('sin el permiso "aprobar" solo mira; con el permiso ve los botones', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
    await expect(page.getByText(/No tienes permiso para aprobar/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apruebo', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pido cambios' })).toHaveCount(0);
    await page.goto('/cliente/revisiones');
    await expect(page.getByText(/no aprobarla/)).toBeVisible();
    await darPermisos('equipo@cliente.test', { aprobar: true });
    await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
    await expect(page.getByRole('button', { name: 'Apruebo', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pido cambios' })).toBeVisible();
  });

  test('la base decide: si le quitaron el permiso mientras miraba, recibe el mensaje y nada queda guardado', async ({ page }) => {
    await darPermisos('equipo@cliente.test', { aprobar: true });
    await entrarCliente(page, 'equipo@cliente.test');
    await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
    await page.getByRole('button', { name: 'Apruebo', exact: true }).click();
    await darPermisos('equipo@cliente.test', { aprobar: false });
    await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
    await expect(page.getByText('Tu administrador no te ha dado permiso para aprobar. Pídeselo.')).toBeVisible();
    expect((await estadoRD()).aprobaciones.some((x: { revision_id: string }) => x.revision_id === ID.revDiseno)).toBe(false);
  });

  test('si ya la respondieron en otra pestaña, avisa y no duplica', async ({ page, context }) => {
    await entrarCliente(page);
    await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
    const otra = await context.newPage();
    await otra.goto(`/cliente/revisiones/${ID.revDiseno}`);
    await otra.getByRole('button', { name: 'Apruebo', exact: true }).click();
    await otra.getByRole('button', { name: 'Confirmar aprobación' }).click();
    await expect(otra.getByText(/Aprobada por Admina Prueba/)).toBeVisible();
    await page.getByRole('button', { name: 'Pido cambios' }).click();
    await page.getByLabel('Qué hay que cambiar').fill('Esto llega tarde.');
    await page.getByRole('button', { name: 'Enviar cambios' }).click();
    await expect(page.getByText('Esta revisión ya no espera una respuesta.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recargar la página' })).toBeVisible();
    expect((await estadoRD()).aprobaciones.filter((x: { revision_id: string }) => x.revision_id === ID.revDiseno)).toHaveLength(1);
  });

  test('una revisión de otra empresa o un borrador responde "no encontramos", sin revelar nada', async ({ page }) => {
    await entrarCliente(page);
    for (const id of [ID.revB, ID.revBorrador, '99999999-9999-4999-8999-999999999999']) {
      await page.goto(`/cliente/revisiones/${id}`);
      await expect(page.getByText('No encontramos esa revisión')).toBeVisible();
      await expect(page.getByText('Reservas')).toHaveCount(0);
      await expect(page.getByText('Borrador interno')).toHaveCount(0);
    }
  });

  test('"ver como": se ve igual pero no se aprueba ni se pide cambios', async ({ page }) => {
    await entrarSuper(page);
    await iniciarVerComo('admin_cliente');
    await page.goto(`/cliente/revisiones/${ID.revDiseno}`);
    await expect(page.getByRole('heading', { name: 'Diseño y prototipo del portal' })).toBeVisible();
    await expect(page.getByText('Modo "ver como": solo lectura').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apruebo', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pido cambios' })).toHaveCount(0);
    await page.goto('/cliente/revisiones');
    await expect(page.getByText('Diseño y prototipo del portal')).toBeVisible();
    await expect(page.getByText('Sprint 2: Pagos y facturas')).toHaveCount(0); // el borrador no se ve
  });
});

test.describe('Revisiones · super admin', () => {
  test('bandeja con sus 4 listas y filtro por cliente', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/aprobaciones');
    const lista = (n: string) => page.locator(`[data-lista="${n}"]`);
    await expect(lista('esperando_a_websourcing').getByText('Sprint 2: Pagos y facturas')).toBeVisible();
    await expect(lista('cambios_pedidos').getByText('Sprint 3: Informes')).toBeVisible();
    await expect(lista('aprobado').getByText('Sprint 1: Pedidos y catálogo')).toBeVisible();
    await expect(lista('esperando_al_cliente').getByText('Diseño y prototipo del portal')).toBeVisible();
    await expect(lista('esperando_al_cliente').getByText('Sprint 1: Reservas')).toBeVisible();
    await page.getByLabel('Filtrar por cliente').selectOption({ label: 'Servicios Demo Ltda.' });
    await expect(lista('esperando_al_cliente').getByText('Sprint 1: Reservas')).toBeVisible();
    await expect(page.getByText('Diseño y prototipo del portal')).toHaveCount(0);
    await expect(menu(page).getByRole('link', { name: /Bandeja de aprobaciones/ })).not.toContainText('Pronto');
    await sinIA(page);
  });

  test('crear una revisión de sprint, editarla, publicarla y que el cliente la vea', async ({ page, browser }) => {
    await entrarSuper(page);
    await page.goto('/admin/aprobaciones');
    await page.getByRole('button', { name: 'Nueva revisión' }).click();
    await page.getByLabel('Sprint', { exact: true }).selectOption({ label: 'Sprint 4: Cierre' });
    await page.getByLabel('Título').fill('Sprint 4: Cierre del proyecto');
    await page.getByLabel('Link de prueba').fill('http://inseguro.test');
    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(page.getByText('El enlace debe empezar por https:// y no tener espacios.')).toBeVisible();
    await page.getByLabel('Link de prueba').fill('https://prueba.ejemplo.test/sprint-4');
    await page.getByLabel('Acta').selectOption({ label: 'Acta de la demo del Sprint 1' });
    await page.getByLabel('Resumen para el cliente').fill('Cierre y ajustes finales.');
    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(page.getByRole('heading', { name: 'Sprint 4: Cierre del proyecto', level: 1 })).toBeVisible();
    await expect(page.getByText('Borrador de la versión 1')).toBeVisible();
    // el cliente aún no la ve
    const cli = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const pc = await cli.newPage();
    await entrarCliente(pc);
    await pc.goto('/cliente/revisiones');
    await expect(pc.getByText('Sprint 4: Cierre del proyecto')).toHaveCount(0);
    // editar y publicar
    await page.getByLabel('Resumen para el cliente').fill('Cierre, ajustes finales y manuales.');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await page.getByRole('button', { name: 'Publicar al cliente' }).click();
    await page.getByRole('button', { name: 'Sí, publicar' }).click();
    await expect(page.getByText('Publicada: esperando la respuesta del cliente.')).toBeVisible();
    await pc.reload();
    await expect(pc.getByRole('region', { name: 'Esperan tu respuesta' }).getByText('Sprint 4: Cierre del proyecto')).toBeVisible();
    await pc.getByRole('link', { name: /Sprint 4: Cierre del proyecto/ }).click();
    await expect(pc.getByText('Cierre, ajustes finales y manuales.')).toBeVisible();
    await cli.close();
  });

  test('publicar sin link ni video lo rechaza con un mensaje claro', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/aprobaciones');
    await page.getByRole('button', { name: 'Nueva revisión' }).click();
    await page.getByLabel('Sprint', { exact: true }).selectOption({ label: 'Sprint 4: Cierre' });
    await page.getByLabel('Título').fill('Sprint 4 sin link');
    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await page.getByRole('button', { name: 'Publicar al cliente' }).click();
    await page.getByRole('button', { name: 'Sí, publicar' }).click();
    await expect(page.getByText('Agrega el link de prueba o el video antes de publicar.')).toBeVisible();
  });

  test('un diseño solo se crea una vez por proyecto', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/aprobaciones');
    await page.getByRole('button', { name: 'Nueva revisión' }).click();
    await page.getByLabel('Qué se revisa').selectOption('diseno');
    await page.getByLabel('Título').fill('Otro diseño');
    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(page.getByText('Ese diseño o sprint ya tiene su revisión')).toBeVisible();
  });

  test('evidencia de cada aprobación: quién, cuándo, IP y navegador (solo Websourcing)', async ({ page }) => {
    await entrarSuper(page);
    await page.goto(`/admin/revisiones/${ID.revSprint1}`);
    const ev = page.locator('[data-version="2"] [data-evidencia]');
    await expect(ev).toContainText('Evidencia · solo Websourcing');
    await expect(ev).toContainText('Admina Prueba');
    await expect(ev).toContainText('190.24.10.5');
    await expect(ev).toContainText('Chrome/126.0');
    await expect(page.locator('[data-version="1"] [data-evidencia]')).toContainText('190.24.10.5');
    await page.goto(`/admin/revisiones/${ID.revCambios}`);
    await expect(page.locator('[data-evidencia]')).toContainText('No registrado');
    await expect(page.getByText('Tú no apruebas por el cliente')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apruebo', exact: true })).toHaveCount(0);
  });

  test('reabrir exige motivo y el cliente lo ve; luego se prepara y publica una versión nueva', async ({ page, browser }) => {
    await entrarSuper(page);
    await page.goto(`/admin/revisiones/${ID.revSprint1}`);
    await page.getByRole('button', { name: 'Reabrir', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reabrir', exact: true }).last()).toBeDisabled();
    await page.getByLabel('Motivo').fill('Falla el filtro por fecha');
    await page.getByRole('dialog').getByRole('button', { name: 'Reabrir' }).click();
    await expect(page.getByText('Reabierta: por rehacer')).toBeVisible();
    const cli = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const pc = await cli.newPage();
    await entrarCliente(pc);
    await pc.goto(`/cliente/revisiones/${ID.revSprint1}`);
    await expect(pc.getByText('Websourcing reabrió esta revisión')).toBeVisible();
    await expect(pc.getByText(/Falla el filtro por fecha/)).toBeVisible();
    await expect(pc.getByRole('button', { name: 'Apruebo', exact: true })).toHaveCount(0);
    // nueva versión
    await page.getByRole('button', { name: 'Preparar versión nueva' }).click();
    await expect(page.getByText('Borrador de la versión 3')).toBeVisible();
    await page.getByRole('button', { name: 'Publicar al cliente' }).click();
    await page.getByRole('button', { name: 'Sí, publicar' }).click();
    await expect(page.getByText('Publicada: esperando la respuesta del cliente.')).toBeVisible();
    await pc.reload();
    await expect(pc.getByText('Versión 3', { exact: true })).toBeVisible();
    await expect(pc.getByRole('button', { name: 'Apruebo', exact: true })).toBeVisible();
    await cli.close();
  });

  test('cambios pedidos: se prepara la versión 2 y el cliente puede aprobarla', async ({ page, browser }) => {
    await entrarSuper(page);
    await page.goto(`/admin/revisiones/${ID.revCambios}`);
    await expect(page.getByText(/Faltan los totales por mes/)).toBeVisible();
    await page.getByRole('button', { name: 'Preparar versión nueva' }).click();
    await page.getByLabel('Resumen para el cliente').fill('Se agregaron los totales por mes.');
    await page.getByRole('button', { name: 'Publicar al cliente' }).click();
    await page.getByRole('button', { name: 'Sí, publicar' }).click();
    await expect(page.getByText('Publicada: esperando la respuesta del cliente.')).toBeVisible();
    const cli = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const pc = await cli.newPage();
    await entrarCliente(pc);
    await pc.goto(`/cliente/revisiones/${ID.revCambios}`);
    await pc.getByRole('button', { name: 'Apruebo', exact: true }).click();
    await pc.getByRole('button', { name: 'Confirmar aprobación' }).click();
    await expect(pc.getByText(/Aprobada por Admina Prueba/)).toBeVisible();
    await cli.close();
  });
});
