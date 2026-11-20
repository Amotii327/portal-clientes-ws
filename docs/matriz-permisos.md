# Matriz de permisos · Portal de clientes Websourcing

**Equipo Websourcing · Desarrollo** · Se amplía en cada sprint. Última actualización: sprint 2 (2026-11-27).
Fuente de las reglas RLS (`supabase/migrations/20261123000400_rls_y_permisos.sql`) y de las pruebas (`supabase/tests/database/`). Si una regla cambia, se cambia primero aquí.

## Cómo leerla

Como las llaves de un edificio: cada fila es una puerta (tabla) y cada columna es quién tiene llave y qué puede hacer con ella.

- **Super admin**: el dueño. Solo cuenta si la sesión tiene el código adicional (2FA, `aal2`). Sin él, **no tiene ningún permiso**. Mientras tiene abierta una sesión "ver como" tampoco actúa como super admin (ve como el cliente y no escribe).
- **Admin cliente**: `miembros.rol = admin_cliente`, de **su** empresa.
- **Equipo**: `miembros.rol = equipo`, de su empresa; algunas puertas dependen de sus permisos (`aprobar`, `ver_dinero`, `ver_todos_tickets`, `subir_archivos`).
- **Sin acceso**: usuario quitado, bloqueado (como miembro o a nivel de perfil), de una empresa pausada, sin perfil, o visitante sin sesión. **Ninguna tabla, ninguna función** (salvo `politica_vigente()` y `mi_contexto()`, que solo hablan del propio usuario).
- Leer / Crear / Editar / Borrar: **Sí**, **No**, o la condición. "RPC" significa que solo se hace con la función indicada, que valida quién llama.
- **Borrar: nadie**, en ninguna tabla (nada se borra desde la aplicación; quitar y pausar son marcas). Única excepción: la función `quitar_sprint` / `cargar_plan_sprints` elimina sprints que aún no empezaron (el rastro queda en el registro y, con el plan aprobado, en los cambios del plan).
- Los permisos y el estado se leen **de la base en cada consulta**, no del token: quitar, bloquear o pausar corta el acceso en la siguiente consulta.
- Con la opción `seguridad.exigir_2fa_admin_cliente = true` (se enciende antes de producción, D-014), el admin del cliente sin 2FA queda como "sin acceso".

## Tablas del sprint 1

| Tabla | Rol | Leer | Crear | Editar | Borrar |
|---|---|---|---|---|---|
| `empresas` | Super admin | Todas | RPC `crear_empresa` | Solo `nombre` y `logo_path`. El estado, solo con RPC `pausar_empresa` / `reactivar_empresa` | No |
| | Admin cliente | Solo la suya | No | No | No |
| | Equipo | Solo la suya | No | No | No |
| `datos_facturacion` | Super admin | Todas | RPC `crear_empresa` | Sí (`razon_social`, `nit`, `correo_facturas`) | No |
| | Admin cliente | La suya | No | La suya (mismas 3 columnas) | No |
| | Equipo | La suya, **solo con `ver_dinero`** | No | No | No |
| `perfiles` | Super admin | Todos | No (se crea al aceptar la invitación, RPC `aceptar_invitacion`) | No (solo bloqueo global con RPC `bloquear_usuario`) | No |
| | Admin cliente | El suyo y los de quienes están activos en su empresa (o salieron y no están activos en otra, para conservar el historial) | No | Solo el suyo: `nombre`, `celular` | No |
| | Equipo | Solo el suyo | No | Solo el suyo: `nombre`, `celular` | No |
| `super_admins` | Todos | **No** (sin acceso desde la API) | **No** (solo directo en la base) | **No** | **No** |
| `miembros` | Super admin | Todos | RPC `aceptar_invitacion` | Permisos de cualquier "equipo"; quitar/bloquear con RPC | No |
| | Admin cliente | Todos los de su empresa (incluidos quitados, para el historial) | No | Permisos (`aprobar`, `ver_dinero`, `ver_todos_tickets`, `subir_archivos`) de su **equipo** activo. Nunca `rol`, `empresa_id`, `user_id`, `bloqueado` ni `quitado_en` por UPDATE. Quitar y bloquear: RPC, solo a "equipo" y no a sí mismo | No |
| | Equipo | Solo su propia fila | No | **No** (no se da permisos a sí mismo) | No |
| `invitaciones` | Super admin | Todas, **sin** `token_hash` | RPC `crear_empresa` / `invitar_miembro` | RPC (reemplazar y aceptar) | No |
| | Admin cliente | Las de su empresa, sin `token_hash` | RPC `invitar_miembro` (solo rol `equipo`, solo su empresa) | No | No |
| | Equipo | No | No | No | No |
| `aceptaciones_politica` | Super admin | Todas | RPC `aceptar_invitacion` | **No** (solo se agrega) | No |
| | Admin cliente / Equipo | Solo las propias | No | **No** | No |
| `registro_actividad` | Super admin | Todo | **No** (solo triggers y las funciones `anotar_rechazo` y del gancho de Auth) | **No** (solo se agrega) | **No** |
| | Admin cliente / Equipo | **No** (el cliente lee su historial en `historial_proyecto`, sin IP ni acciones internas) | No | No | No |
| `configuracion` | Super admin | Toda | Sí | Sí (`valor`); un trigger valida la forma de cada clave (ausente o inválido en `exigir_2fa_admin_cliente` cuenta como 2FA exigido) | No |
| | Admin cliente / Equipo | Toda (solo lectura) | No | No | No |
| `intentos_acceso` | Todos | **No** (sin acceso desde la API; solo la usa el gancho de Auth) | **No** | **No** | **No** |
| `preferencias_usuario` (tema) | Cualquiera con acceso | Solo la propia | Solo la propia (`tema`: clara u oscura) | Solo la propia | No |

Reglas transversales (aplican a todas las tablas con `empresa_id`):

- `WITH CHECK` en toda política de escritura.
- `empresa_id` **no se puede cambiar** después de creada la fila (trigger `empresa_id_inmutable`). También son fijos `miembros.rol`, `miembros.user_id` y el `token_hash`.
- Llaves compuestas `(empresa_id, id)`: una invitación de la empresa A no puede apuntar a un miembro de la B.
- El admin del cliente **no** gestiona a otros admins: solo el super admin.
- Nadie puede volverse super admin desde la API ni por invitación (`invitaciones.rol` solo admite `admin_cliente` y `equipo`).
- Un usuario está activo en **una** empresa a la vez (índice único parcial).

## Funciones RPC del sprint 1

Todas corren con la sesión del usuario, validan lo que entra y dejan rastro en `registro_actividad`.

| Función | Quién puede | Qué hace |
|---|---|---|
| `crear_empresa(nombre, razon_social, nit, correo_facturas, correo_admin, logo_path?)` | Solo super admin (2FA) | Crea empresa + facturación + invitación del primer admin. Devuelve el token **una sola vez** |
| `invitar_miembro(empresa_id, correo, rol?, aprobar?, ver_dinero?, ver_todos_tickets?, subir_archivos?)` | Super admin (cualquier rol y empresa) · Admin cliente (solo `equipo`, solo su empresa) | Crea la invitación (7 días, un solo uso). Si ya había una pendiente, la reemplaza. Al admin del cliente no se le revela si el correo es de un super admin o de otra empresa: el rechazo ocurre al activarla. Solo el super admin recibe `correo_no_invitable` |
| `revocar_invitacion(invitacion_id)` | Super admin · Admin cliente (solo invitaciones de rol `equipo` de su empresa) | Cancela una invitación pendiente. Al quitar o bloquear a quien invitó, sus invitaciones pendientes se revocan solas |
| `aceptar_invitacion(token, version_politica, nombre?, celular?)` | Usuario autenticado con correo confirmado, igual al invitado | Crea perfil (si no existe) y membresía, marca la invitación usada, guarda la aceptación de la política (versión, fecha, IP). La IP la pone la base, nunca el usuario; es dato de apoyo, no prueba única, hasta verificarla con Supabase real (toma el salto de confianza contando desde la derecha de `X-Forwarded-For`, configurable en `configuracion('red')`) |
| `quitar_miembro(miembro_id)` | Super admin · Admin cliente (solo "equipo" de su empresa, nunca a sí mismo) | Marca `quitado_en`, cierra sus sesiones, conserva el historial |
| `bloquear_miembro(miembro_id, bloqueado?)` | Igual que quitar | Bloquea o desbloquea; al bloquear cierra sesiones |
| `pausar_empresa(empresa_id, motivo?)` / `reactivar_empresa(empresa_id)` | Solo super admin (2FA) | Pausa (cierra sesiones de todos sus usuarios) o reactiva. No borra nada |
| `bloquear_usuario(user_id, bloqueado?)` | Solo super admin (2FA) | Bloqueo global del perfil. Nunca a un super admin |
| `mi_contexto()` | Cualquiera (el visitante recibe `sin_sesion`) | Estado del propio usuario para decidir a qué pantalla va |
| `politica_vigente()` | Cualquiera, incluso sin sesión | Versión vigente de la política de datos |

## Tablas del sprint 2 (proyectos)

**Ninguna se escribe directo desde la API** (ni el super admin): todo cambio pasa por las funciones de la siguiente sección, que validan quién llama. Las filas se leen así:

| Tabla | Super admin | Admin cliente | Equipo | Sin acceso / visitante |
|---|---|---|---|---|
| `proyectos` | Todos | Los de su empresa | Los de su empresa | No |
| `hitos` | Todos (incluido el 13 oculto) | Los de su empresa y **visibles** (el hito 13 sin mantenimiento no existe para el cliente) | Igual | No |
| `hitos_pago_asociado` (etiqueta del pago de cada hito) | Todos | Los de su empresa y de hitos visibles | Solo con `ver_dinero` | No |
| `sprints` | Todos, incluida la propuesta | Los de su empresa **solo si el plan del proyecto está aprobado** (nunca borradores) | Igual | No |
| `retrasos` | Todos | Los de hitos visibles de su empresa | Igual | No |
| `cambios_plan` (cambios a un plan aprobado, con motivo) | Todos | Los de su empresa con el plan aprobado | Igual | No |
| `historial_proyecto` (apto para el cliente: sin IP, sin autor) | Todo, con `visible_cliente` | Solo `visible_cliente = true` de su empresa | Igual | No |
| `sesiones_ver_como` | Solo el super admin real (con 2FA) | **No** | **No** | No |
| Vista `v_proyectos_resumen` (`security_invoker`) | Todos los proyectos | Sus proyectos | Sus proyectos | No |

- `retrasos`, `cambios_plan` e `historial_proyecto` **solo se agregan** (ni el superusuario edita ni borra).
- `empresa_id` inmutable y llaves compuestas `(empresa_id, id)` en todas. `proyectos` tiene además `unique (id, empresa_id)` para que otros módulos se enlacen con cualquiera de los dos órdenes.
- `avance_pct`, `avance_partes_*` los calcula la base (trigger) con la fórmula D-013; nadie los escribe.
- Sin plan aprobado, el cliente no ve sprints, "sprint actual" ni "próxima demo"; el avance cuenta el hito 6 como una sola parte.
- Con empresa pausada, usuario quitado, bloqueado o sin perfil: ninguna de estas tablas devuelve filas.

## Funciones RPC del sprint 2

Escritura: **solo super admin con 2FA y sin sesión "ver como" abierta**. Para cualquier otra persona responden `no_autorizado`; en "ver como", `ver_como_solo_lectura`.

| Función | Qué hace y qué exige |
|---|---|
| `crear_proyecto(empresa_id, nombre, descripcion?, fecha_inicio?, fecha_fin_planeada?)` | Crea el proyecto con sus 13 hitos (el 13 oculto) y los pagos asociados por defecto (hitos 1, 5, 11 y 13). Solo en empresas activas |
| `editar_proyecto(...)` | Nombre, descripción, estado, fechas. Lo nulo no cambia. Único modo de reabrir un proyecto terminado o cancelado |
| `editar_hito(hito_id, nombre?, estado?, fecha_planeada?, motivo?, lado?, que_falta?, visible?, fecha_real?)` | Cambiar una fecha ya fijada exige `motivo` (mínimo 5 caracteres) y `lado` (`websourcing` o `cliente`; si es `cliente`, también `que_falta`) y crea un retraso. El hito 6 no se edita a mano (su estado sale de los sprints). Solo el hito 13 se puede ocultar o mostrar |
| `fijar_pago_hito(hito_id, concepto)` | Pone o quita la etiqueta del pago asociado |
| `cargar_plan_sprints(proyecto_id, sprints[])` | Carga la propuesta completa (reemplaza la anterior). Solo mientras el plan es propuesta |
| `agregar_sprint`, `editar_sprint`, `quitar_sprint`, `reordenar_sprints` | Con el plan aprobado, cambiar fechas, contenido, orden o quitar exige `motivo`, y queda en `cambios_plan` (lo ve el cliente). Un sprint iniciado no se quita ni se mueve. `editar_sprint(..., correr_siguientes => true)` corre los siguientes los mismos días |
| `aprobar_plan_sprints(proyecto_id)` | Publica el plan al cliente (hito 6). **No es la aprobación del cliente**: el super admin nunca aprueba en nombre del cliente |
| `iniciar_ver_como(empresa_id, rol?, permisos...)` / `terminar_ver_como()` | Ver abajo |
| `anotar_rechazo(accion, codigo)` | Cualquier usuario con acceso anota que una acción suya fue rechazada (patrón estricto, tope de 20 por minuto, siempre a su nombre) |

Lectura (respetan RLS, no usan permisos especiales): `panel_super_admin()` (solo super admin), `inicio_cliente()` (solo quien actúa como miembro de una empresa, incluido "ver como"), `linea_de_tiempo(proyecto_id)` (cada quien recibe solo lo que RLS le deja ver; el plan y los avisos de cruce solo llegan al cliente si el plan está aprobado, y los avisos solo al super admin).

## Modo "ver como el cliente" (decisión D-020)

| Pregunta | Respuesta |
|---|---|
| Quién lo inicia | Solo el super admin real (en `super_admins`, no bloqueado, con 2FA). Nadie más, ni con otra empresa |
| Dónde vive la marca | En la tabla `sesiones_ver_como` (servidor), **no** en el token. Una sesión abierta por persona; vence a los 60 minutos |
| Qué ve | Exactamente lo que vería el miembro elegido (`admin_cliente` con todos los permisos, o `equipo` con los permisos que se indiquen): mismas políticas RLS, sin borradores ni hito 13 oculto, sin registro de actividad |
| Escritura | **Ninguna.** Mientras dura, `es_super_admin()` es falso y, además, **toda tabla** de `public` (salvo `sesiones_ver_como`, `registro_actividad` e `intentos_acceso`) tiene un trigger que rechaza INSERT, UPDATE, DELETE y TRUNCATE con `ver_como_solo_lectura`. Una prueba estructural falla si una tabla nueva no lo lleva |
| Registro | `ver_como_iniciado` (empresa, rol) y `ver_como_terminado` (manual, vencida o reemplazada), con el autor y la IP |
| Empresa pausada | No aplica (se rechaza al iniciar; si se pausa durante la sesión, el cliente simulado no ve nada, igual que el cliente real) |
| Sin clave de sistema | Todo corre con la sesión del super admin |

## Pendiente de ampliar

Sprint 3: `revisiones`, `aprobaciones`, `documentos`, `documento_versiones`, `documento_permisos`, `archivos_cliente` y las reglas de Storage (cada tabla nueva debe llevar el trigger `ver_como_solo_lectura`). Sprint 4: dinero. Sprint 5: tickets. Sprint 6: mantenimiento.
