# Informe de pruebas · Sprint 1 (parte del servidor) · Re-verificación · Portal de clientes Websourcing

**Equipo Websourcing · Calidad** · Fecha: 2026-11-20 · Rama: `claude/project-thread-g48cnm` · Commit revisado: `ee91d97` (migración `20261123000700_correcciones_calidad.sql`)
Alcance: solo lo corregido del informe v1 (`docs/2026-11-20_informe_pruebas_sprint1-backend_v1.md`) y las regresiones que la migración pudiera haber introducido. Las pantallas del Frontend (archivos sin commit en el árbol) no se tocaron ni se revisaron.

## Veredicto: pasa con condiciones

Todo lo que se pidió corregir quedó corregido en la base y probado. No encontré regresiones. Quedan condiciones que no se pueden cerrar en este entorno (necesitan el Supabase real o el plan Pro) y que ya están en la lista de salida a producción.

Analogía: cambiaron las cerraduras y el timbre que habíamos marcado, y las llaves nuevas funcionan. Lo que falta es conectar el timbre nuevo a la red eléctrica del edificio (encender el gancho de intentos, confirmar de dónde llega la IP). Eso solo se prueba con el edificio real.

## Pruebas realizadas

| Prueba | Resultado |
|---|---|
| `npm run test:db` | **373 de 373 pasan** (10 archivos). Las migraciones bajan y suben sin errores, incluida la nueva |
| Pruebas nuevas (`10_correcciones_calidad.test.sql`, 62) | Pasan. Cada hallazgo tiene prueba propia |
| ¿Las pruebas nuevas detectan el daño? Se rompió a propósito en una copia: IP otra vez desde el primer valor; gancho abierto si no hay super admin; perfiles de quien se fue otra vez visibles | Los 3 daños hicieron fallar la prueba correspondiente (I-2, I-3, M-5). Restaurado, vuelve a pasar |
| Reversibilidad de la migración sola | Se aplicó solo el rollback de `000700`: vuelve `aceptar_invitacion` con 5 parámetros, desaparecen `intentos_acceso`, `revocar_invitacion`, el validador y las filas `red` e `intentos_acceso`. Se reaplicó la migración sin errores |
| Auditoría de permisos de funciones (consulta directa al catálogo) | Las 29 funciones `SECURITY DEFINER` de `public` y `private` tienen `search_path` vacío (incluidas las nuevas `revocar_invitaciones_de`, `gancho_intento_de_acceso` y `revocar_invitacion`; `validar_configuracion` no es definer, no la ejecuta ningún rol y también tiene `search_path` vacío). `anon` solo ejecuta `mi_contexto()` y `politica_vigente()`. Ninguna función ejecutable por `PUBLIC`. `service_role` no ejecuta ninguna. `gancho_intento_de_acceso` solo la ejecuta `supabase_auth_admin` |
| Tablas de `public` | 11 de 11 con RLS activa. `anon` sin ningún permiso de tabla. `intentos_acceso` sin políticas y sin permisos para `anon`, `authenticated` y `service_role` (invisible desde la API, como `super_admins`) |
| `empresa_id` inmutable | Los disparadores `*_empresa_fija` siguen en `miembros`, `invitaciones`, `datos_facturacion` y `registro_actividad`; la tabla nueva no tiene `empresa_id`. Las pruebas 02 y 05 siguen pasando |
| Uso de `p_ip` en el código del Frontend o en tipos | Ninguno. `database.types.ts` y `lib/portal/acciones.ts` ya están alineados con la función nueva |

## Estado de cada hallazgo

| # | Estado | Evidencia |
|---|---|---|
| I-1 IP elegida por el usuario | **Cerrado** | `aceptar_invitacion` ya no tiene `p_ip` (llamarla con 5 argumentos da 42883). La IP guardada es la de `private.ip_cliente()`. Prueba: con cabecera `6.6.6.6, 203.0.113.7` queda `203.0.113.7`. Tipos y acciones actualizados |
| I-2 IP desde el primer valor de `X-Forwarded-For` | **Cerrado con condiciones** | Ahora se cuenta desde la derecha y el salto de confianza es configurable (`configuracion('red')`, validado entre 1 y 5). Probado: último salto, un solo valor, basura, sin cabecera, 2 saltos, valor fuera de rango rechazado. **Condición:** verificar contra el proyecto real de Supabase qué valores llegan en `X-Forwarded-For` (si hay Cloudflare delante, el último salto podría ser un servidor de ellos y no el cliente; para eso existe el parámetro). Hasta entonces la IP es dato de apoyo, no prueba única. Ya está en `salida-a-produccion.md` |
| I-3 Registro abierto sin super admin | **Cerrado** | El gancho solo deja pasar correos con invitación vigente; ya no hay excepción. Probado con la tabla `super_admins` vacía: `registro_solo_por_invitacion`. Se agregó a la lista de salida el primer super admin a mano. **Observación:** el README propone apagar el gancho "un momento" para crear al primer super admin; mientras esté apagado el registro queda abierto. Recomendación: hacerlo con el registro público desactivado en Auth o creando el usuario por el panel (que no pasa por el gancho). No bloquea |
| I-5 Bloqueo a 5 intentos / 15 minutos | **Cerrado con condiciones** | La lógica funciona y está probada: 4 fallos continúan, el 5.º frena, durante el freno ni la clave correcta entra, dura 15 min, otra cuenta no se afecta, queda en el registro, un acierto reinicia, y los fallos de hace más de 15 min no cuentan como seguidos. Solo Auth puede llamarla. **Condición:** el gancho está **apagado** en `config.toml` y exige plan Pro. Hoy el criterio del Módulo 1 sigue sin cumplirse en el sistema real hasta que se encienda y se pruebe con una cuenta de prueba (ya está en la lista de salida). **Riesgo conocido, aceptable:** quien conozca un correo puede frenar esa cuenta 15 minutos a propósito (es el costo de este tipo de freno). Es más delicado para el super admin; lo cubre el 2FA y el aviso en el registro de actividad |
| I-7 Averiguar qué correos existen | **Cerrado (a) / riesgo aceptado (b)** | (a) El admin del cliente ya no recibe `correo_no_invitable`: invitar a un super admin o a alguien de otra empresa se acepta y el rechazo ocurre al activar (`ya_es_miembro`, `invitacion_invalida`; un super admin nunca entra como miembro). Solo el super admin ve el detalle. Se sigue diciendo `correo_ya_es_miembro` para su propio equipo, que ya ve en su lista. (b) El gancho de registro sigue respondiendo distinto con y sin invitación. Es inherente a "registro solo por invitación"; mitigación (límites de Auth y captcha) anotada como riesgo aceptado en la lista de salida |
| M-1 Rol nulo | **Cerrado** | Admin del cliente con rol nulo: `no_autorizado`. Super admin con rol nulo o desconocido: `datos_invalidos`. Ya no sale error técnico con la fila |
| M-2 `mi_contexto()` para visitantes | **Cerrado** | `anon` recibe `sin_sesion`; sigue sin poder usar las demás funciones (probado con `crear_empresa`). Nota de Frontend actualizada |
| M-3 Invitaciones de quien sale | **Cerrado** | Al quitar, bloquear miembro o bloquear usuario se revocan las pendientes de esa persona; las ya usadas no se tocan. 4 pruebas |
| M-4 Revocar invitación | **Cerrado** | `revocar_invitacion(id)`: admin de otra empresa y equipo no pueden; el admin del cliente solo las de rol `equipo` de su empresa; el super admin cualquiera; revocar dos veces da `invitacion_no_pendiente`; inexistente da el mismo `no_autorizado` (no revela); queda el evento en el registro. Permisos de ejecución correctos |
| M-5 Perfil de quien pasó a otra empresa | **Cerrado** | El admin de A deja de leerlo si está activo en B; B sí; si no está activo en ninguna otra, A conserva el historial |
| M-6 Validación de `configuracion` | **Cerrado** | Disparador valida la forma de cada clave (texto, `null`, lista, hora mala: todos rechazados con 23514). Ausente, vacío o sin fila de `seguridad` cuenta como 2FA **exigido** (probado con sesión sin 2FA: no entra). La lista de salida incluye "2FA del admin del cliente encendido". Observación menor: una clave desconocida se acepta sin validar (no afecta nada hoy) |
| M-10 Detalles de orden | **Cerrado con condiciones** | Hecho: `supabase/.temp/` quedó en `.gitignore` y el archivo salió del repositorio. **Sin cambios:** `config.toml` sigue en PostgreSQL 17 y las pruebas locales corren en 16; `logo_path` sigue aceptando cualquier texto de hasta 300 caracteres; no hay límite de invitaciones por hora. Los tres son de bajo riesgo hoy; el límite de invitaciones debe resolverse al conectar Resend y `logo_path` al llegar Storage (sprint 3) |

No estaban en esta revisión y siguen como en el informe v1: I-4 (token en claro: condición de revisión del Frontend), I-6 (historial con menciones de IA: decisión del dueño antes de entregar el código), M-7, M-8 y M-9.

## Regresiones buscadas

| Qué se buscó | Resultado |
|---|---|
| RLS: tabla nueva sin protección | `intentos_acceso` con RLS, sin políticas y sin permisos. Sin regresión |
| `SECURITY DEFINER` con `search_path` vacío | Todas las funciones nuevas y reemplazadas lo conservan |
| Permisos a `anon` / `authenticated` | Solo se agregó `mi_contexto()` a `anon` (intencional, no revela nada) y `revocar_invitacion` a `authenticated` (con validación interna). Las funciones reemplazadas con `create or replace` conservaron sus permisos; la que se recreó (`aceptar_invitacion`) se volvió a restringir a `authenticated` |
| `empresa_id` inmutable | Los disparadores siguen presentes; las revocaciones nuevas solo actualizan `revocada_en` |
| Efectos nuevos de revocar al quitar o bloquear | Solo tocan invitaciones sin usar ni revocar de esa persona (en bloqueo global, de todas sus empresas) |
| Nuevas filtraciones de información | Los mensajes de error son los mismos para "no existe" y "no es tuyo" en `revocar_invitacion`; `invitar_miembro` ya no distingue casos al admin del cliente |
| Reversibilidad | Rollback de la migración sola y completo verificados |

## Qué sigue sin probarse (por entorno)

1. Contra Supabase real: cabeceras de IP que llegan, gancho `before_user_created` y gancho `password_verification_attempt` con Auth de verdad (el formato de entrada y salida está implementado según la documentación, pero no se ejecutó con Auth).
2. Playwright y pantallas (revisión del Frontend, en curso aparte).
3. Correos y Storage (sprints siguientes).

## Condiciones para cerrar el sprint y para producción

1. Plan Pro y gancho de intentos encendidos y probados con una cuenta de prueba (antes de producción; el criterio de 5 intentos queda anotado como pendiente en el acta de la demo).
2. Verificar la IP contra el proyecto real y ajustar `configuracion('red')` (antes de producción).
3. Crear al primer super admin sin dejar el registro abierto (mejorar el texto del README).
4. I-4 en la revisión del Frontend, I-6 antes de entregar el código.

Decisión de Calidad: el backend del sprint 1 **pasa con condiciones**. Puede ir a la demo del punto de control 4.
