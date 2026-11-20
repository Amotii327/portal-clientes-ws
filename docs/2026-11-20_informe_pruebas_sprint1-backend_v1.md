# Informe de pruebas · Sprint 1 (parte del servidor) · Portal de clientes Websourcing

**Equipo Websourcing · Calidad** · Fecha: 2026-11-20 · Rama revisada: `claude/project-thread-g48cnm` (commit c168873)
Alcance: migraciones, reglas por empresa, funciones de la base, gancho de registro, cliente Supabase, middleware y documentos del servidor. Las pantallas (Frontend) no se revisaron en este informe.

## Resultado: aprobado con observaciones

No hay problemas bloqueantes. Hay 6 importantes que deben cerrarse (los marcados "antes del cierre del sprint" se corrigen con cambios pequeños) y 10 menores. La separación entre empresas y los permisos por rol aguantaron todos los ataques que probamos.

Analogía: el edificio tiene buenas cerraduras en cada apartamento y nadie pudo entrar al de otro. Lo que falta es ajustar el timbre de la portería (registro, IP, enlaces de invitación) y dejar escrito qué se enciende antes de abrir el edificio al público.

## Pruebas realizadas

| Prueba | Resultado |
|---|---|
| Pruebas automáticas de base de datos (`npm run test:db`) | 311 de 311 pasan, en 9 archivos. Las migraciones también bajan y vuelven a subir sin errores |
| ¿Las pruebas detectan fallas de verdad? (se rompió el sistema a propósito en una copia) | Sí. Se probaron 5 daños (quitar el 2FA del super admin, ignorar empresa pausada, no cerrar sesiones, apagar RLS en `miembros`, dar permiso de `crear_empresa` a visitantes) y cada uno hizo fallar pruebas existentes |
| Separación entre empresas: 20 intentos de escalada nuevos (subir de rol, mover un miembro a otra empresa, editar facturación o perfiles ajenos, volverse super admin, escribir en el registro, leer `token_hash`, invitar a otra empresa) | 20 de 20 rechazados |
| Permisos de ejecución de funciones | Visitante sin sesión solo ejecuta `politica_vigente()`. Todas las funciones `SECURITY DEFINER` tienen `search_path` vacío. Ninguna función auxiliar está en `public`. Sin SQL dinámico. Sin tablas en la publicación de Realtime |
| Super admin sin 2FA | Sin ningún permiso (confirmado) |
| Criterios de aceptación del Módulo 1 | Ver tabla abajo |
| Claves en el repositorio | Ninguna. `.env*` está en `.gitignore`; solo se usan las dos variables públicas |
| Menciones de IA en textos del servidor, docs del sprint y mensajes de error | Ninguna en código, migraciones, mensajes de error ni documentos del sprint. Sí hay en el historial de git (hallazgo I-6) |
| Dependencias (`npm audit --omit=dev`) | 1 alta, 1 moderada, ambas en `postcss` dentro de `next` (hallazgo M-9) |
| Celular y computador, Playwright, correos reales, Supabase real | **No probado** (ver "Qué falta probar") |

### Criterios de aceptación del Módulo 1

| Criterio | Estado |
|---|---|
| Invitado abre el enlace, crea contraseña, queda en su empresa; vence a los 7 días | Cumple en la base (un solo uso, atado al correo, vence a 7 días, correo confirmado). La pantalla es de Frontend |
| Recuperar contraseña sin ayuda | Es configuración de Auth y correos de Resend; no está probado |
| 5 fallos seguidos frenan la cuenta 15 minutos | **No cumple.** Backend lo declara pendiente. Ver I-5 |
| Super admin usa código adicional | Cumple en la base: sin `aal2` no tiene ningún poder |
| Admin invita y quita; permisos por defecto; quitar corta el acceso de inmediato y conserva historial; "ver dinero" aplica en la siguiente consulta | Cumple (probado) |
| Código de verificación por correo para todos (prioridad "importante") | No está en este sprint |

## Problemas

Gravedad según el reglamento: bloqueante frena la entrega; importante se corrige antes de cerrar el sprint o antes de producción (se indica cuál); menor se anota.

### Importantes

| # | Problema | Cómo reproducirlo | Corrección | Cuándo |
|---|---|---|---|---|
| I-1 | **La IP de la aceptación de la política la elige el usuario.** `aceptar_invitacion` recibe `p_ip` y la guarda de preferencia sobre la del proxy. La IP es la evidencia de la Ley 1581 | Como invitado con cabecera `x-forwarded-for: 203.0.113.7`, llamar `aceptar_invitacion(token, 'v1', 'Nombre', null, '8.8.8.8')`. Queda guardada 8.8.8.8 (confirmado) | Quitar el parámetro `p_ip` y usar solo `private.ip_cliente()`. Actualizar `database.types.ts` y `lib/portal/acciones.ts` | Antes del cierre del sprint |
| I-2 | **`ip_cliente()` toma el primer valor de `X-Forwarded-For`, que lo escribe quien hace la petición.** El registro de actividad también la usa | Con cabecera `6.6.6.6, 203.0.113.7`, el registro guarda 6.6.6.6 (confirmado). Además, el navegador llama a Supabase directo (no pasa por el proxy del VPS), así que la "cabecera de confianza del VPS" de la arquitectura no existe para esas llamadas | Decidir y documentar qué salto de la cadena es de confianza (el que añade el proxy de Supabase, contando desde la derecha) y verificarlo con una prueba contra el proyecto real. Mientras tanto, tratar la IP como dato de apoyo, no como prueba única | Antes del cierre del sprint (decisión); prueba real antes de producción |
| I-3 | **El gancho de registro deja registrarse a cualquiera si no existe ningún super admin.** Si la tabla queda vacía (error, restauración, entorno nuevo) el portal queda abierto | Vaciar `super_admins` y llamar al gancho con `cualquiera@evil.test`: devuelve `{}` (permitido). Confirmado | Quitar esa excepción. Para el primer super admin: crearlo a mano en la base y dejar `enable_signup = false` hasta entonces, o permitir solo un correo fijo guardado en `configuracion`. Agregar a `salida-a-produccion.md` "primer super admin creado y registro cerrado" | Antes del primer despliegue |
| I-4 | **El token de invitación sale en claro a quien llama la función**, y `invitar_miembro` la puede llamar el admin del cliente desde el navegador. Hoy la protección es solo una instrucción en la nota de Backend | `invitar_miembro` devuelve `token` al llamador (probado en las pruebas existentes) | El token es de 256 bits, atado al correo y el correo debe estar confirmado, así que el riesgo es acotado (un admin malicioso podría ocupar la cuenta de un invitado). Condiciones: (1) Frontend solo llama estas dos funciones desde acciones del servidor y QA lo verifica en su revisión (el token no aparece en el código del navegador, en logs ni en respuestas); (2) cuando exista Resend, evaluar enviar el correo desde la base o desde un módulo del servidor para que el token no vuelva a ningún cliente | Verificación en la revisión de Frontend; decisión en sprint 2 |
| I-5 | **Falta el bloqueo a los 5 intentos fallidos / 15 minutos** (criterio aprobado del Módulo 1). Auth solo trae límite por IP | Declarado por Backend en la nota, sección 4 | El dueño decide: (A) gancho `password_verification_attempt` de Supabase (requiere plan Pro, ya presupuestado) o (B) control en el servidor de Next.js. Recomendación: A. Hasta decidir, el criterio queda abierto en el acta | Decisión del dueño antes de la demo; implementación antes de producción |
| I-6 | **Los mensajes de commit y el autor del historial dicen "Claude" y traen líneas de coautoría con nombre de modelo y enlace de sesión** (24 de 28 commits). El reglamento (sección 3) prohíbe mencionar IA en mensajes de commits públicos y en lo que ve el cliente. Además `README.md` y `.claude/` nombran modelos | `git log --format='%an%n%B'` | Decisión del dueño: antes de dar acceso al repositorio al cliente (entrega de código) reescribir el historial o entregar una copia limpia sin `.claude/` ni nombres de modelos. No afecta la seguridad | Antes de la entrega al cliente |
| I-7 | **Se puede averiguar qué correos existen en el portal.** (a) `invitar_miembro` responde `correo_no_invitable` si el correo es super admin o miembro de otra empresa, y deja invitar si no existe. Un admin de la empresa A puede probar cualquier correo. (b) El gancho de registro responde 403 sin invitación y deja pasar con invitación: cualquiera sin sesión puede probar correos invitados | (a) Como admin A: invitar `admin.b@empresa-b.test` y `dueno@websourcing.test` dan `correo_no_invitable`; `no-existe@x.test` se invita. (b) Gancho con y sin invitación responde distinto. Ambos confirmados | (a) Para el admin del cliente, no revelar: aceptar la invitación y que el rechazo ocurra al activarla (ya existen `ya_es_miembro` e `invitacion_invalida`); la revelación solo para super admin. (b) Es propio del diseño "registro solo por invitación"; mitigar con límite de intentos por IP y captcha de Auth (ya previstos) y anotarlo como riesgo aceptado | Antes de producción |

### Menores

| # | Problema | Cómo reproducirlo | Corrección |
|---|---|---|---|
| M-1 | **`invitar_miembro` con rol nulo se salta la comprobación de rol** y termina en un error técnico de la tabla que incluye la fila completa (con el hash de un token que nunca se entregó). No hay escalada (la tabla exige rol), pero el mensaje técnico sale por la API | Como admin A: `invitar_miembro(A, 'otro@x.test', null)` da `23502 ... Failing row contains (...)` (confirmado) | `if p_rol is distinct from 'equipo'` y `if p_rol is null or p_rol not in (...)`. `mensajeDeError` ya oculta el texto, pero la API lo devuelve igual |
| M-2 | **`mi_contexto()` no la puede llamar un visitante**, así que el estado `sin_sesion` que promete la nota nunca llega: Frontend recibirá un error de permiso | Como `anon`: `select mi_contexto()` da 42501 (confirmado) | Conceder `execute` a `anon` (la función ya responde `sin_sesion` sin revelar nada) o corregir la nota para que Frontend trate ese error como `sin_sesion` |
| M-3 | **Una invitación pendiente sigue vigente si quien la creó es quitado o bloqueado** | Admin A invita, el super admin lo quita: la invitación sigue válida (confirmado) | Al quitar o bloquear a un admin, revocar sus invitaciones pendientes |
| M-4 | **No existe una función para revocar una invitación** (solo se reemplaza invitando otra vez). El registro tiene el evento `invitacion_revocada` pero nada lo dispara salvo el reemplazo | Revisión de código | Agregar `revocar_invitacion(id)` con las mismas reglas que quitar miembro |
| M-5 | **El admin de una empresa sigue leyendo el perfil (nombre, correo, celular) de quien ya pasó a otra empresa**, porque "tuvo fila" en la suya | Usuario quitado de A y activo en B: el admin de A lo sigue leyendo (confirmado). La matriz lo declara así | Limitar a quienes están activos en su empresa, o a quienes fueron quitados y no tienen membresía activa en otra |
| M-6 | **`configuracion` acepta cualquier valor.** Un valor mal escrito en `seguridad` rompe el acceso de todos los clientes (error de conversión); y un `null` apaga el 2FA del admin del cliente sin avisar | Como super admin: `valor = {"exigir_2fa_admin_cliente": "si"}`: todo miembro recibe error 22P02. Con `null`, el 2FA queda apagado (ambos confirmados) | Trigger que valide la forma de cada clave. Que la ausencia o el `null` de `exigir_2fa_admin_cliente` cuente como `true`, y que `salida-a-produccion.md` incluya "2FA del admin del cliente encendido" con una prueba que lo compruebe |
| M-7 | **No se anotan los intentos rechazados** (por ejemplo un admin que intenta quitar a otro admin). Las funciones fallan y la transacción deshace todo, incluido el rastro. La arquitectura pide "entradas y fallos" | Revisión de código | Para sprint 2, registrar los rechazos de las funciones sensibles en una tabla o canal que no se deshaga, y los inicios de sesión desde Auth |
| M-8 | **Rendimiento de las reglas a futuro.** Cada fila evalúa varias consultas (`miembro_activo` se llama dos veces por fila en `es_admin_cliente`). Con datos de ejemplo no se nota | Revisión de código | Envolver en `(select ...)` las llamadas por fila y guardar el miembro activo una vez por consulta; medir al llegar al sprint 3 |
| M-9 | **`postcss` dentro de `next` 15.5.29 con avisos de seguridad** (alta y moderada). Es de compilación, sin CSS de terceros, riesgo práctico bajo | `npm audit --omit=dev` | Subir `next` a una versión sin el aviso cuando Frontend pueda (puede ser cambio mayor) y revisarlo en la auditoría de producción |
| M-10 | **Detalles de orden.** `supabase/.temp/cli-latest` está en el repositorio (debería ignorarse). `config.toml` dice PostgreSQL 17 y las pruebas locales corren en 16. `logo_path` acepta cualquier texto de hasta 300 caracteres (lo usa solo el super admin; validar el formato cuando llegue Storage). Sin límite de invitaciones por hora (hará falta al conectar Resend) | Revisión | Agregar `supabase/.temp/` a `.gitignore`; alinear versiones; validar `logo_path`; limitar invitaciones por empresa |

## Qué falta probar (no se pudo en este entorno)

1. **Contra Supabase real:** el gancho `before_user_created` (Backend ya avisó que no se probó con Auth real), que el rol `postgres` pueda borrar de `auth.sessions` y leer `auth.users`, qué cabeceras de IP llegan realmente a la base, y que un token de acceso viejo no abra nada tras quitar a alguien. Se necesita un proyecto de prueba de Supabase o `supabase start` con Docker. Es condición para el informe de seguridad antes de producción.
2. **Playwright y pantallas** (activar cuenta, "Mi equipo", estados bloqueado/pausado): llegan con la revisión de Frontend.
3. **Correos** (invitación, recuperación): llegan con la cuenta de Resend.
4. **Archivos y Storage:** no existen aún (sprint 3).
5. El resto de la lista `listas-de-chequeo/cierre-de-sprint.md` (demo, acta, gasto de IA, aprobación del dueño) no es de esta revisión.

## Cómo reproducir

Las pruebas de demostración quedaron fuera del repositorio, en `/tmp/claude-0/-home-user/fdcc695c-b830-5a5c-9507-b6535dccc24e/scratchpad/qa/` (`demo1.test.sql` confirma I-1, I-2, I-3, I-7, M-1, M-2, M-3, M-5 y M-6; `demo2.test.sql` son los 20 intentos de escalada). Se corren con `pg_prove` sobre el mismo PostgreSQL temporal que usa `npm run test:db`. Para que queden en el proyecto, Backend puede agregar cada caso como prueba que **falla hoy y pasa con la corrección**, sin tocar las pruebas existentes.

## Decisión

Aprobado con observaciones. Backend corrige I-1, I-2 (decisión), M-1 y M-2 antes del cierre del sprint; el dueño decide I-5 e I-6; I-3, I-7 y M-6 quedan como condiciones de salida a producción. Calidad vuelve a revisar solo lo corregido.
