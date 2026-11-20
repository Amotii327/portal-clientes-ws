import { expect, test } from '@playwright/test';
import { entrarCliente, entrarSuper, reiniciar } from './ayudas';
import { ID, PNG, archivoGrande, darPermisos, estadoRD, iniciarVerComo, menu, sinIA } from './ayudas-revdocs';

test.beforeEach(async () => { await reiniciar(undefined, 'revdocs'); });
const PDF = { name: 'nuevo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prueba') };

test.describe('Documentos · cliente', () => {
  test('el admin ve todos los de su empresa, con la visibilidad de cada uno', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/documentos');
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
    for (const t of ['Contrato de desarrollo', 'Arquitectura del portal', 'Manual del administrador', 'Acta de la demo del Sprint 1']) await expect(page.getByText(t, { exact: true })).toBeVisible();
    await expect(page.getByText('Contrato Servicios Demo')).toHaveCount(0);
    await expect(page.locator(`[data-documento="00000000-0000-4000-8000-000000000032"]`).getByText('Solo administración')).toBeVisible();
    await expect(page.locator(`[data-documento="00000000-0000-4000-8000-000000000033"]`).getByText('Personas elegidas')).toBeVisible();
    await expect(menu(page).getByRole('link', { name: /Documentos/ })).toHaveAttribute('aria-current', 'page');
    await sinIA(page);
  });

  test('el equipo solo ve lo compartido con todo el equipo; con "personas" ve lo suyo', async ({ page, browser }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    await page.goto('/cliente/documentos');
    await expect(page.getByText('Contrato de desarrollo', { exact: true })).toBeVisible();
    await expect(page.getByText('Acta de la demo del Sprint 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Arquitectura del portal')).toHaveCount(0);
    await expect(page.getByText('Manual del administrador')).toHaveCount(0);
    await expect(page.getByText('Solo administración')).toHaveCount(0);
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const p2 = await ctx.newPage();
    await entrarCliente(p2, 'equipo-dinero@cliente.test');
    await p2.goto('/cliente/documentos');
    await expect(p2.getByText('Manual del administrador', { exact: true })).toBeVisible();
    await expect(p2.getByText('Arquitectura del portal')).toHaveCount(0);
    await ctx.close();
  });

  test('categorías filtran, versiones se listan y cada una se descarga con enlace que vence', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/documentos');
    await page.getByRole('button', { name: 'Manual', exact: true }).click();
    await expect(page.getByText('Manual del administrador', { exact: true })).toBeVisible();
    await expect(page.getByText('Contrato de desarrollo')).toHaveCount(0);
    await page.getByRole('button', { name: 'Contrato', exact: true }).click();
    await expect(page.getByText(/v2 ·/)).toBeVisible();
    await page.getByRole('button', { name: /Versiones \(2\)/ }).click();
    await expect(page.getByText('Se actualizó la cláusula de entregas')).toBeVisible();
    const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar versión 1 de Contrato de desarrollo' }).click()]);
    expect(d1.suggestedFilename()).toBe('contrato-v1.pdf');
    const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar Contrato de desarrollo', exact: true }).click()]);
    expect(d2.suggestedFilename()).toBe('contrato-v2.pdf');
    await expect(page.getByText('vencen a los 10 minutos')).toBeVisible();
  });

  test('sin documentos muestra el estado vacío (empresa sin nada visible para el equipo sin permisos)', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    await page.goto('/cliente/documentos');
    await page.getByRole('button', { name: 'Manual', exact: true }).click();
    await expect(page.getByText('No hay documentos en esta categoría.')).toBeVisible();
  });

  test('"ver como": ve exactamente lo de la persona y no hay nada para subir', async ({ page }) => {
    await entrarSuper(page);
    await iniciarVerComo('equipo');
    await page.goto('/cliente/documentos');
    await expect(page.getByText('Modo "ver como": solo lectura')).toBeVisible();
    await expect(page.getByText('Contrato de desarrollo', { exact: true })).toBeVisible();
    await expect(page.getByText('Arquitectura del portal')).toHaveCount(0);
    await page.goto('/cliente/archivos');
    await expect(page.getByLabel('Archivo', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Subir archivo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Borrar/ })).toHaveCount(0);
  });
});

test.describe('Archivos de la empresa · cliente', () => {
  test('admin: ve lo que subió su empresa, sube un archivo y lo borra mientras esté "nuevo"', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/archivos');
    await expect(page.getByText('logo-comercial.png')).toBeVisible();
    await expect(page.getByText('No escribas claves aquí.')).toBeVisible();
    await expect(page.getByText(/no guarda claves/)).toBeVisible();
    // lo recibido queda fijo; lo del equipo no es suyo
    const textos = page.locator(`[data-archivo="${ID.archivoTextos}"]`);
    await expect(textos.getByText('Recibido por Websourcing')).toBeVisible();
    await expect(textos.getByRole('button', { name: /Borrar/ })).toHaveCount(0);
    await expect(textos.getByText('Fijo')).toBeVisible();
    await expect(page.locator(`[data-archivo="${ID.archivoFotos}"]`).getByRole('button', { name: /Borrar/ })).toHaveCount(0);
    // subir
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'catalogo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') });
    await page.getByLabel('Nota (opcional)').fill('Catálogo 2027');
    await page.getByRole('button', { name: 'Subir archivo' }).click();
    const fila = page.locator('li[data-archivo]', { hasText: 'catalogo.pdf' });
    await expect(fila).toContainText('Admina Prueba');
    await expect(fila).toContainText('Catálogo 2027');
    await expect(fila.getByText('Nuevo', { exact: true })).toBeVisible();
    expect((await estadoRD()).registro.some((x: { accion: string }) => x.accion === 'archivo_cliente_subido')).toBe(true);
    // descargar
    const [d] = await Promise.all([page.waitForEvent('download'), fila.getByRole('button', { name: 'Descargar catalogo.pdf' }).click()]);
    expect(d.suggestedFilename()).toBe('catalogo.pdf');
    // borrar con confirmación
    await fila.getByRole('button', { name: 'Borrar catalogo.pdf' }).click();
    await page.getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(page.getByText('catalogo.pdf')).toHaveCount(0);
    const rd = await estadoRD();
    expect(rd.archivos.find((a: { nombre_original: string }) => a.nombre_original === 'catalogo.pdf').borrado_en).toBeTruthy();
    expect(rd.storage.some((k: string) => k.includes('archivos-empresa') && k.endsWith('.pdf') && rd.archivos.find((a: { nombre_original: string; storage_path: string }) => a.nombre_original === 'catalogo.pdf' && k.endsWith(a.storage_path)))).toBe(false);
  });

  test('valida el tipo y el tamaño antes de subir', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/cliente/archivos');
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
    await expect(page.getByText('Ese tipo de archivo no está permitido.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Subir archivo' })).toBeDisabled();
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'icono.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(page.getByText('Ese tipo de archivo no está permitido.')).toBeVisible();
    await page.getByLabel('Archivo', { exact: true }).setInputFiles(archivoGrande(52_428_801));
    await expect(page.getByText('El archivo es muy pesado: el máximo es 50 MB.')).toBeVisible();
    expect((await estadoRD()).reservas).toHaveLength(0);
  });

  test('si Websourcing lo marca "recibido" mientras la persona lo mira, borrar responde que quedó fijo', async ({ page, browser }) => {
    await entrarCliente(page);
    await page.goto('/cliente/archivos');
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const sup = await ctx.newPage();
    await entrarSuper(sup);
    await sup.goto('/admin/archivos');
    await sup.getByRole('button', { name: 'Marcar logo-comercial.png como recibido' }).click();
    await expect(sup.locator(`[data-archivo="${ID.archivoLogo}"]`).getByText('Recibido', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Borrar logo-comercial.png' }).click();
    await page.getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(page.getByText('Websourcing ya recibió este archivo y quedó fijo: no se puede borrar.')).toBeVisible();
    await ctx.close();
  });

  test('equipo sin "subir archivos": ve la lista pero no sube; con el permiso sí', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    await page.goto('/cliente/archivos');
    await expect(page.getByText('No tienes permiso para subir archivos')).toBeVisible();
    await expect(page.getByLabel('Archivo', { exact: true })).toHaveCount(0);
    await expect(page.getByText('logo-comercial.png')).toBeVisible();
    await darPermisos('equipo@cliente.test', { subir_archivos: true });
    await page.goto('/cliente/archivos');
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Subir archivo' }).click();
    const fila = page.locator('li[data-archivo]', { hasText: 'foto.png' });
    await expect(fila).toContainText('Equipo Uno');
    // puede borrar lo suyo (la foto del seed también es suya y sigue "nuevo")
    await expect(page.locator(`[data-archivo="${ID.archivoFotos}"]`).getByRole('button', { name: /Borrar/ })).toBeVisible();
    await expect(page.locator(`[data-archivo="${ID.archivoLogo}"]`).getByRole('button', { name: /Borrar/ })).toHaveCount(0);
  });

  test('la base decide: sin el permiso, subir responde un error entendible', async ({ page }) => {
    await darPermisos('equipo@cliente.test', { subir_archivos: true });
    await entrarCliente(page, 'equipo@cliente.test');
    await page.goto('/cliente/archivos');
    await darPermisos('equipo@cliente.test', { subir_archivos: false });
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Subir archivo' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No pudimos subir el archivo' })).toBeVisible();
    expect((await estadoRD()).archivos.some((a: { nombre_original: string }) => a.nombre_original === 'foto.png')).toBe(false);
  });
});

test.describe('Documentos y archivos · super admin', () => {
  test('sube un documento compartido con una persona, publica una versión nueva y revoca el acceso', async ({ page, browser }) => {
    await entrarSuper(page);
    await page.goto('/admin/documentos');
    await page.getByLabel('Empresa').selectOption({ label: 'Comercial Ejemplo S.A.S.' });
    await page.getByRole('button', { name: 'Subir documento' }).click();
    await page.getByLabel('Archivo', { exact: true }).setInputFiles(PDF);
    await page.getByLabel('Título').fill('Manual de operación');
    await page.getByLabel('Categoría').selectOption('manual');
    await page.getByLabel('Quién lo ve').selectOption('personas');
    await page.getByRole('button', { name: 'Publicar documento' }).click();
    await expect(page.getByText('Elige al menos una persona, o cambia la visibilidad.')).toBeVisible();
    await page.getByLabel('Equipo Uno').check();
    await page.getByRole('button', { name: 'Publicar documento' }).click();
    const doc = page.locator('li[data-documento]', { hasText: 'Manual de operación' });
    await expect(doc).toContainText('Personas elegidas');
    await expect(doc).toContainText('v1');
    await expect(doc.getByRole('list', { name: /Personas con acceso/ })).toContainText('Equipo Uno');

    const cli = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const pc = await cli.newPage();
    await entrarCliente(pc, 'equipo@cliente.test');
    await pc.goto('/cliente/documentos');
    await expect(pc.getByText('Manual de operación')).toBeVisible();
    // versión nueva: la anterior se conserva
    await doc.getByRole('button', { name: 'Versión nueva' }).click();
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'manual-v2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 dos') });
    await page.getByLabel('Qué cambió').fill('Se agregó el capítulo 3');
    await page.getByRole('button', { name: 'Publicar versión' }).click();
    await expect(doc).toContainText('v2');
    await doc.getByRole('button', { name: /Versiones \(2\)/ }).click();
    await expect(doc).toContainText('Se agregó el capítulo 3');
    await pc.reload();
    await expect(pc.locator('li[data-documento]', { hasText: 'Manual de operación' }).getByText(/v2 ·/)).toBeVisible();
    // revocar
    await doc.getByRole('button', { name: /Revocar acceso de Equipo Uno/ }).click();
    await expect(doc.getByText('Nadie, salvo el administrador.')).toBeVisible();
    await pc.reload();
    await expect(pc.getByText('Manual de operación')).toHaveCount(0);
    // y el enlace ya no se puede pedir
    const rd = await estadoRD();
    expect(rd.docPermisos.filter((p: { documento_id: string; revocado_en: string | null }) => p.documento_id === rd.documentos.find((d: { titulo: string }) => d.titulo === 'Manual de operación').id && !p.revocado_en)).toHaveLength(0);
    await cli.close();
  });

  test('cambiar la visibilidad a "solo administración" lo esconde del equipo', async ({ page, browser }) => {
    await entrarSuper(page);
    await page.goto('/admin/documentos');
    await page.getByLabel('Empresa').selectOption({ label: 'Comercial Ejemplo S.A.S.' });
    const doc = page.locator('li[data-documento]', { hasText: 'Contrato de desarrollo' });
    await doc.getByRole('button', { name: 'Quién lo ve' }).click();
    await page.getByLabel('Visibilidad').selectOption('solo_admin');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(doc).toContainText('Solo administración');
    const cli = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const pc = await cli.newPage();
    await entrarCliente(pc, 'equipo@cliente.test');
    await pc.goto('/cliente/documentos');
    await expect(pc.getByText('Contrato de desarrollo')).toHaveCount(0);
    await cli.close();
  });

  test('rechaza tipos no permitidos al subir documentos', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/documentos');
    await page.getByRole('button', { name: 'Subir documento' }).click();
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'hoja.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
    await expect(page.getByText('Ese tipo de archivo no está permitido.')).toBeVisible();
  });

  test('archivos de cada empresa: se ven, se marcan "recibido" y los borrados dejan rastro', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/archivos');
    await expect(page.getByText('2 archivos nuevos por marcar como recibidos.')).toBeVisible();
    await expect(page.getByText('logo-comercial.png')).toBeVisible();
    await expect(page.getByText('fotos-productos.zip')).toBeVisible();
    await page.getByRole('button', { name: 'Marcar fotos-productos.zip como recibido' }).click();
    await expect(page.locator(`[data-archivo="${ID.archivoFotos}"]`).getByText('Recibido', { exact: true })).toBeVisible();
    await expect(page.getByText('1 archivo nuevo por marcar como recibido.')).toBeVisible();
    await expect(page.locator(`[data-archivo="${ID.archivoFotos}"]`).getByRole('button', { name: /Marcar/ })).toHaveCount(0);
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar logo-comercial.png' }).click()]);
    expect(d.suggestedFilename()).toBe('logo-comercial.png');
    // el cliente borra uno y el super admin ve el rastro
    const ctxCli = await page.context().browser()!.newContext({ baseURL: test.info().project.use.baseURL });
    const pc = await ctxCli.newPage();
    await entrarCliente(pc);
    await pc.goto('/cliente/archivos');
    await pc.getByRole('button', { name: 'Borrar logo-comercial.png' }).click();
    await pc.getByRole('button', { name: 'Sí, borrar' }).click();
    await ctxCli.close();
    await page.reload();
    await expect(page.locator(`[data-archivo="${ID.archivoLogo}"]`).getByText('Borrado por el cliente')).toBeVisible();
  });

  test('otra empresa: no se mezclan los archivos ni los documentos', async ({ page }) => {
    await entrarSuper(page);
    await page.goto('/admin/documentos');
    await page.getByLabel('Empresa').selectOption({ label: 'Servicios Demo Ltda. (en pausa)' });
    await expect(page.getByText('Contrato Servicios Demo')).toBeVisible();
    await expect(page.getByText('Contrato de desarrollo')).toHaveCount(0);
    await page.goto('/admin/archivos');
    await page.getByLabel('Empresa').selectOption({ label: 'Servicios Demo Ltda. (en pausa)' });
    await expect(page.getByText('Esta empresa aún no ha subido archivos')).toBeVisible();
    await expect(menu(page).getByRole('link', { name: /Documentos de clientes/ })).toBeVisible();
    await sinIA(page);
  });
});

test.describe('Guardia de servidor en las rutas nuevas', () => {
  const adminRutas = ['/admin/aprobaciones', '/admin/documentos', '/admin/archivos', `/admin/revisiones/${ID.revDiseno}`];
  const clienteRutas = ['/cliente/revisiones', `/cliente/revisiones/${ID.revDiseno}`, '/cliente/documentos', '/cliente/archivos'];

  test('sin sesión todas mandan a entrar', async ({ page }) => {
    for (const r of [...adminRutas, ...clienteRutas]) {
      await page.goto(r);
      await expect(page).toHaveURL(/\/entrar/);
    }
  });

  test('el cliente no entra a las de Websourcing: el servidor redirige sin enviar la pantalla', async ({ page }) => {
    await entrarCliente(page);
    for (const r of adminRutas) {
      const resp = await page.request.get(r, { maxRedirects: 0 });
      const cuerpo = await resp.text();
      expect(resp.headers()['location'] ?? cuerpo, r).toContain('sin-permiso');
      expect(cuerpo, r).not.toContain('Nueva revisión');
      await page.goto(r);
      await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
    }
  });

  test('el super admin no entra a las pantallas del cliente', async ({ page }) => {
    await entrarSuper(page);
    for (const r of clienteRutas) {
      await page.goto(r);
      await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
    }
  });
});
