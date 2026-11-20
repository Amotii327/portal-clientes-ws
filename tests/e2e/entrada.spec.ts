import { expect, test } from '@playwright/test';
import { abrirSesion, CLAVE, CODIGO, entrar, entrarCliente, estadoMock, MOCK, reiniciar } from './ayudas';

test.beforeEach(async () => { await reiniciar(); });

test.describe('Entrar y salir', () => {
  test('sin sesión, las zonas privadas llevan a entrar', async ({ page }) => {
    for (const ruta of ['/admin/clientes', '/cliente/inicio', '/cliente/equipo', '/']) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/entrar/);
    }
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });

  test('contraseña incorrecta: mensaje claro que no revela qué falló', async ({ page }) => {
    await entrar(page, 'admin@cliente.test', 'otra-clave-123');
    await expect(page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' })).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('cuenta frenada por intentos (5 intentos / 15 minutos): aviso del diseño con salida a recuperar', async ({ page }) => {
    await entrar(page, 'frenada@cliente.test');
    await expect(page.getByText('Cuenta frenada por 15 minutos')).toBeVisible();
    await expect(page.getByText('Fallaste la contraseña muchas veces seguidas')).toBeVisible();
    await page.getByRole('link', { name: 'cambiar tu contraseña' }).click();
    await expect(page).toHaveURL(/\/recuperar/);
  });

  test('freno en el servidor: 5 contraseñas malas frenan la cuenta aunque la sexta sea correcta', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await entrar(page, 'admin@cliente.test', 'clave-equivocada-' + i);
    }
    await entrar(page, 'admin@cliente.test'); // clave correcta, pero ya está frenada
    await expect(page.getByText('Cuenta frenada por 15 minutos')).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('campos vacíos: muestra qué falta', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText('Escribe un correo válido.')).toBeVisible();
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible();
  });

  test('admin del cliente entra, ve su empresa y cierra sesión', async ({ page }) => {
    await entrarCliente(page);
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByText('Mi equipo')).toBeVisible();
    await expect(page.getByText('Disponible en el próximo sprint')).toBeVisible();
    await expect(page.getByText('Comercial Ejemplo S.A.S.').first()).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.getByText('Cerraste sesión')).toBeVisible();
    await page.goto('/cliente/inicio');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('con sesión abierta, /entrar lleva al inicio', async ({ page }) => {
    await entrarCliente(page);
    await page.goto('/entrar');
    await expect(page).toHaveURL(/\/cliente\/inicio/);
  });
});

test.describe('Código adicional (2FA)', () => {
  test('super admin con código ya configurado: solo lo escribe', async ({ page }) => {
    await entrar(page, 'super@websourcing.test');
    await expect(page).toHaveURL(/\/verificar/);
    await expect(page.getByRole('heading', { name: 'Código de verificación' })).toBeVisible();
    await page.getByLabel('Código de 6 dígitos').fill('000000');
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    await expect(page.getByText('Ese código no es correcto o ya venció')).toBeVisible();
    await page.getByLabel('Código de 6 dígitos').fill(CODIGO);
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    await expect(page).toHaveURL(/\/admin\/clientes/);
  });

  test('super admin sin sus 2FA: lo configura con QR y entra', async ({ page }) => {
    await entrar(page, 'super-nuevo@websourcing.test');
    await expect(page).toHaveURL(/\/verificar/);
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect(page.getByAltText('Código QR para tu app de verificación')).toBeVisible();
    await expect(page.getByTestId('clave-2fa')).toHaveText('JBSWY3DPEHPK3PXP');
    await page.getByLabel('Código de 6 dígitos').fill('12345');
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    await expect(page.getByText('Escribe los 6 dígitos del código.')).toBeVisible();
    await page.getByLabel('Código de 6 dígitos').fill(CODIGO);
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    await expect(page).toHaveURL(/\/admin\/clientes/);
  });

  test('super admin sin código no puede saltarse la verificación', async ({ page }) => {
    await entrar(page, 'super@websourcing.test');
    await expect(page).toHaveURL(/\/verificar/);
    for (const ruta of ['/admin/clientes', '/cliente/inicio', '/']) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/verificar/);
    }
  });

  test('admin del cliente pide código cuando se enciende la opción (D-014)', async ({ page }) => {
    await reiniciar({ exigir_2fa_admin_cliente: true });
    await entrar(page, 'admin@cliente.test');
    await expect(page).toHaveURL(/\/verificar/);
    // mientras no verifique, ninguna zona privada se abre (el servidor lo decide con miContexto)
    for (const ruta of ['/cliente/inicio', '/cliente/equipo', '/']) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/verificar/);
    }
    await page.getByRole('button', { name: 'Empezar' }).click();
    await page.getByLabel('Código de 6 dígitos').fill(CODIGO);
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    await expect(page).toHaveURL(/\/cliente\/inicio/);
    await page.goto('/cliente/equipo');
    await expect(page.getByRole('heading', { name: 'Mi equipo' })).toBeVisible();
  });

  test('quien no necesita código y abre /verificar vuelve a su inicio', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    await page.goto('/verificar');
    await expect(page).toHaveURL(/\/cliente\/inicio/);
  });
});

test.describe('Recuperar y cambiar contraseña', () => {
  test('pide el correo y responde igual exista o no', async ({ page }) => {
    for (const correo of ['admin@cliente.test', 'nadie@nada.test']) {
      await page.goto('/recuperar');
      await page.getByLabel('Correo').fill(correo);
      await page.getByRole('button', { name: 'Enviar enlace' }).click();
      await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    }
  });

  test('valida el correo', async ({ page }) => {
    await page.goto('/recuperar');
    await page.getByLabel('Correo').fill('esto-no-es-un-correo');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByText('Escribe un correo válido.')).toBeVisible();
  });

  test('sin enlace ni sesión: explica y ofrece pedir otro', async ({ page }) => {
    await page.goto('/cambiar-clave');
    await expect(page.getByRole('heading', { name: 'Este enlace no sirve' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeVisible();
  });

  test('cambia la contraseña con las validaciones del caso', async ({ page }) => {
    await entrarCliente(page, 'equipo@cliente.test');
    await page.getByRole('link', { name: 'Cambiar contraseña' }).first().click();
    await expect(page).toHaveURL(/\/cambiar-clave/);
    await page.getByLabel('Contraseña nueva').fill('corta');
    await page.getByLabel('Repite la contraseña').fill('otra');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('Mínimo 10 caracteres.', { exact: true })).toBeVisible();
    await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
    await page.getByLabel('Contraseña nueva').fill('password123');
    await page.getByLabel('Repite la contraseña').fill('password123');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('muy fácil de adivinar')).toBeVisible();
    await page.getByLabel('Contraseña nueva').fill('UnaFraseLargaYUnica2026');
    await page.getByLabel('Repite la contraseña').fill('UnaFraseLargaYUnica2026');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByRole('heading', { name: 'Contraseña cambiada' })).toBeVisible();
    // con la contraseña nueva se puede entrar
    await page.context().clearCookies();
    await entrar(page, 'equipo@cliente.test', 'UnaFraseLargaYUnica2026');
    await expect(page).toHaveURL(/\/cliente\/inicio/);
  });
});

test.describe('Activar invitación', () => {
  test('sin token o con la dirección incompleta: enlace no válido', async ({ page }) => {
    await page.goto('/activar');
    await expect(page.getByRole('heading', { name: 'Este enlace no es válido' })).toBeVisible();
  });

  test('recorrido completo: crear contraseña, confirmar correo, aceptar política y entrar', async ({ page }) => {
    await page.goto('/activar?token=tok-valido-123');
    await expect(page.getByRole('heading', { name: 'Activa tu cuenta' })).toBeVisible();
    // validaciones
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Escribe un correo válido.')).toBeVisible();
    await page.getByLabel('Correo').fill('invitado@cliente.test');
    await page.getByLabel('Crea tu contraseña').fill('corta');
    await page.getByLabel('Repite tu contraseña').fill('distinta');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Mínimo 10 caracteres.')).toBeVisible();
    await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
    await page.getByLabel('Crea tu contraseña').fill(CLAVE);
    await page.getByLabel('Repite tu contraseña').fill(CLAVE);
    await page.getByRole('button', { name: 'Continuar' }).click();
    // aún sin confirmar el correo
    await expect(page.getByRole('heading', { name: 'Confirma tu correo' })).toBeVisible();
    await page.getByRole('button', { name: 'Ya confirmé mi correo' }).click();
    await expect(page.getByText('Falta confirmar tu correo')).toBeVisible();
    await fetch(`${MOCK}/__confirmar?correo=invitado@cliente.test`);
    await page.getByRole('button', { name: 'Ya confirmé mi correo' }).click();
    await expect(page.getByRole('heading', { name: 'Cuéntanos quién eres' })).toBeVisible();
    // política y datos
    await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
    await expect(page.getByText('Escribe tu nombre.')).toBeVisible();
    await expect(page.getByText('Debes aceptar la política de datos para continuar.')).toBeVisible();
    await page.getByText('Leer la política de tratamiento de datos').click();
    await expect(page.getByText('versión 2026-11-v1')).toBeVisible();
    await page.getByLabel('Nombre completo').fill('Persona Invitada');
    await page.getByLabel('Celular (opcional)').fill('300 123 4567');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
    await expect(page).toHaveURL(/\/cliente\/inicio/);
    await expect(page.getByText('Comercial Ejemplo S.A.S.').first()).toBeVisible();
    const e = await estadoMock();
    expect(e.invitaciones.find((i: { correo: string }) => i.correo === 'invitado@cliente.test').usada_en).toBeTruthy();
  });

  test('cuenta frenada también se avisa al activar (modo entrar)', async ({ page }) => {
    await page.goto('/activar?token=tok-valido-123');
    await page.getByRole('button', { name: 'Ya tengo una cuenta: entrar' }).click();
    await page.getByLabel('Correo').fill('frenada@cliente.test');
    await page.getByLabel('Tu contraseña').fill(CLAVE);
    await page.getByRole('button', { name: 'Entrar y continuar' }).click();
    await expect(page.getByText('Cuenta frenada por 15 minutos')).toBeVisible();
    await expect(page.getByText('Espera 15 minutos')).toBeVisible();
  });

  test('un correo que ya tiene cuenta no se revela: mensaje neutro', async ({ page }) => {
    await page.goto('/activar?token=tok-confirmado-777');
    await page.getByLabel('Correo').fill('existente@cliente.test');
    await page.getByLabel('Crea tu contraseña').fill(CLAVE);
    await page.getByLabel('Repite tu contraseña').fill(CLAVE);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('No pudimos crear la cuenta con esos datos')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('ya tiene una cuenta');
    await expect(page.getByRole('heading', { name: 'Activa tu cuenta' })).toBeVisible(); // no cambia de pantalla
    await expect(page.getByRole('link', { name: 'Recuperar contraseña' })).toBeVisible();
  });

  test('un correo sin invitación no puede registrarse', async ({ page }) => {
    await page.goto('/activar?token=tok-valido-123');
    await page.getByLabel('Correo').fill('intruso@otro.test');
    await page.getByLabel('Crea tu contraseña').fill(CLAVE);
    await page.getByLabel('Repite tu contraseña').fill(CLAVE);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('necesitas una invitación de tu empresa')).toBeVisible();
  });

  test('invitación vencida: mensaje amable al aceptar', async ({ page }) => {
    await page.goto('/activar?token=tok-vencido-999');
    await page.getByLabel('Correo').fill('vencido@cliente.test');
    await page.getByLabel('Crea tu contraseña').fill(CLAVE);
    await page.getByLabel('Repite tu contraseña').fill(CLAVE);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await fetch(`${MOCK}/__confirmar?correo=vencido@cliente.test`);
    await page.getByRole('button', { name: 'Ya confirmé mi correo' }).click();
    await page.getByLabel('Nombre completo').fill('Persona Vencida');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
    await expect(page.getByText('Este enlace de invitación no es válido o ya venció')).toBeVisible();
    await expect(page).toHaveURL(/\/activar/);
  });

  test('con sesión abierta de otro correo: no activa y deja cambiar de cuenta', async ({ page }) => {
    await abrirSesion(page, 'existente@cliente.test');
    await page.goto('/activar?token=tok-otro-555');
    await expect(page.getByRole('heading', { name: 'Cuéntanos quién eres' })).toBeVisible();
    await page.getByLabel('Nombre completo').fill('Existente');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
    await expect(page.getByText('Este enlace de invitación no es válido o ya venció')).toBeVisible();
    await page.getByRole('button', { name: '¿No eres tú?' }).click();
    await expect(page.getByRole('heading', { name: 'Activa tu cuenta' })).toBeVisible();
  });

  test('cuenta existente con sesión: entra directo al último paso y queda dentro', async ({ page }) => {
    await abrirSesion(page, 'existente@cliente.test');
    await page.goto('/activar?token=tok-confirmado-777');
    await page.getByLabel('Nombre completo').fill('Persona Existente');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
    await expect(page).toHaveURL(/\/cliente\/inicio/);
  });

  test('la página de activar pide no enviar Referer ni guardar caché', async ({ page }) => {
    const r = await page.goto('/activar?token=tok-valido-123');
    expect(r?.headers()['referrer-policy']).toBe('no-referrer');
    expect(r?.headers()['cache-control']).toContain('no-store');
  });
});
