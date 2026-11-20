# Nota de Desarrollo (backend) para Desarrollo (frontend) · Sprint 1

**Equipo Websourcing · Desarrollo** · v1 · 2026-11-23. Uso interno.

Qué quedó listo en el servidor y qué debe usar cada pantalla. Las reglas de quién ve qué están en `docs/matriz-permisos.md`; las pantallas **no** repiten esas reglas: preguntan a la base y la base responde.

## 1. Archivos para usar

| Archivo | Para qué |
|---|---|
| `lib/supabase/client.ts` → `crearClienteNavegador()` | Componentes `'use client'` |
| `lib/supabase/server.ts` → `await crearClienteServidor()` | Server Components, rutas y acciones del servidor |
| `lib/supabase/middleware.ts` + `middleware.ts` | Renueva la sesión en cada petición. `RUTAS_PRIVADAS` está vacío: **Frontend lo llena** con las rutas que exigen sesión (`RUTA_ENTRAR = '/entrar'`, cámbiela si la pantalla se llama distinto) |
| `lib/supabase/database.types.ts` | Tipos de tablas y funciones (hechos a mano; se regeneran con `supabase gen types` cuando exista el proyecto) |
| `lib/portal/acciones.ts` | Una función por cada acción del sprint (`crearEmpresa`, `invitarMiembro`, `aceptarInvitacion`, `quitarMiembro`, `bloquearMiembro`, `pausarEmpresa`, `reactivarEmpresa`, `bloquearUsuario`, `miContexto`, `politicaVigente`) |
| `lib/portal/errores.ts` | `mensajeDeError(error)` y `codigoDeError(error)`: traducen los códigos de la base a mensajes para la persona |
| `.env.example` | Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`. Se copian a `.env.local` |

**Importante, compilación:** el middleware no funciona con la exportación estática del prototipo. Para la app real use `npm run build:servidor` y `npm start` (ponen `NEXT_OUTPUT=server`). `npm run build` sigue exportando el prototipo aprobado, sin cambios. Cuando las pantallas reales reemplacen al prototipo, el valor por defecto de `next.config.mjs` debe invertirse.

## 2. Qué pantalla usa qué

**Al cargar cualquier pantalla privada** llame `miContexto()`. Devuelve `estado` y, según el caso, `empresa`, `rol`, `permisos`, `tema`, `aal`:

| `estado` | Qué mostrar |
|---|---|
| `sin_sesion` | Pantalla de entrar |
| `sin_perfil` / `sin_membresia` | "Tu cuenta aún no está activada": llevar a activar con el enlace de la invitación |
| `super_admin_requiere_2fa` | Pedir el código del celular (ver 2FA abajo) |
| `requiere_2fa` | Igual, pero para el admin del cliente (solo cuando se encienda `seguridad.exigir_2fa_admin_cliente`, antes de producción) |
| `super_admin` | Zona del super admin |
| `activo` | Zona del cliente. `rol` y `permisos` dicen qué menús mostrar (la base igual no entrega lo que no corresponde) |
| `empresa_pausada` | Mensaje amable de empresa pausada (`empresa.nombre` viene para el texto). El usuario ya no puede leer nada más |
| `miembro_quitado` / `miembro_bloqueado` / `usuario_bloqueado` | Mensaje de acceso suspendido, con el contacto de Websourcing |

Un usuario quitado, bloqueado o de empresa pausada pierde el acceso **en la siguiente consulta** y sus sesiones se cierran; la pantalla debe tratar "sesión cerrada" como `sin_sesion`.

**Activar cuenta (historia 1 del módulo 1)**
1. El enlace del correo lleva el token: `/activar?token=...`. Mostrar el texto de la política con `politicaVigente()` (sirve sin sesión).
2. `supabase.auth.signUp({ email, password, options: { emailRedirectTo: <misma URL /activar?token=...> } })`. Solo se puede registrar el correo que tiene una invitación vigente (gancho de Auth). Contraseña mínima de 10 caracteres.
3. Con el correo ya confirmado y la sesión abierta: `aceptarInvitacion(cliente, { p_token, p_version_politica, p_nombre, p_celular })`. La versión sale de `politicaVigente()`; la persona debe marcar "acepto" antes. Errores esperados: `invitacion_invalida`, `correo_sin_confirmar`, `politica_version_invalida`, `ya_es_miembro`, `usuario_bloqueado`, `empresa_no_disponible`.
4. Después `miContexto()` y a la pantalla de inicio.

**Zona super admin**
- Crear cliente: `crearEmpresa(...)`. Devuelve `empresa_id` y el `token` del primer admin.
- Pausar / reactivar: `pausarEmpresa(id, motivo)` / `reactivarEmpresa(id)`. Lista de empresas: `from('empresas').select('*')`.
- Bloqueo global: `bloquearUsuario(user_id)`.
- Registro: `from('registro_actividad').select('*').order('id', {ascending: false})` (solo el super admin; el cliente no lo lee).

**Zona del cliente, "Mi equipo" (solo admin del cliente)**
- Lista: `from('miembros').select('id, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos, bloqueado, quitado_en, perfiles(nombre, correo)')`. Incluye quitados (historial); filtre `quitado_en is null` para los activos.
- Invitaciones pendientes: `from('invitaciones').select('id, correo, rol, vence_en, usada_en, revocada_en')`. **No use `select('*')`**: `token_hash` no se puede leer y fallaría.
- Invitar: `invitarMiembro(...)`. Quitar/bloquear: `quitarMiembro(id)`, `bloquearMiembro(id, true|false)`.
- Cambiar permisos: `from('miembros').update({ ver_dinero: true }).eq('id', id)` (solo esas 4 columnas; el rol no se cambia).
- Facturación: `from('datos_facturacion').update({ razon_social, nit, correo_facturas })`.

**Tema (D-017)**: `from('preferencias_usuario').upsert({ user_id, tema })`. Si no hay fila, es `clara`. `miContexto().tema` ya lo trae.

**Código adicional (2FA)** con la API estándar de Supabase: `auth.mfa.enroll({ factorType: 'totp' })`, `auth.mfa.challengeAndVerify(...)`. Al terminar, el token pasa a `aal2` y `miContexto().aal` lo confirma. El super admin sin `aal2` no tiene ningún permiso (la base lo exige).

## 3. Reglas que no se pueden saltar

- **El token de invitación** que devuelven `crearEmpresa` e `invitarMiembro` solo se maneja en el servidor (ruta o acción): se manda por correo y **nunca** se devuelve al navegador ni se escribe en logs. El envío del correo queda para cuando exista la cuenta de Resend (plan de sprints, 30 nov); mientras tanto, el servidor puede mostrar el enlace al super admin en el entorno de pruebas.
- **No** usar la llave de sistema (service role) en ninguna pantalla ni ruta.
- Mostrar los textos de error con `mensajeDeError`, nunca el mensaje técnico. Todo texto del usuario se muestra escapado.
- En ningún texto visible aparece IA, agentes, modelos ni herramientas.

## 4. Lo que falta y no está en el sprint 1 (para que nadie lo dé por hecho)

- **Bloqueo a los 5 intentos fallidos / 15 minutos.** Supabase Auth solo trae límite de peticiones por IP. Hay que decidir: gancho `password_verification_attempt` (requiere plan Pro) o control en el servidor. No está implementado.
- Recuperar contraseña y plantillas de correo con el dominio de Websourcing: son de Auth + Resend (configuración, no código nuestro).
- Pantallas, formularios y el envío real de correos.
