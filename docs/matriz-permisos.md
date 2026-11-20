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
| `consumo_equipo_proyecto`, `consumo_equipo_sprint` (interno, solicitud de cambio 4) | Todos, solo con 2FA y sin "ver como" | **Nunca** (una sola política, solo super admin) | **Nunca** | No |
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
| `fijar_consumo_proyecto`, `anotar_consumo_sprint`, `consumo_equipo` | Solo super admin con 2FA (también la lectura). Al llegar el consumo real al 80 % del tope queda `consumo_equipo_aviso_80` en el registro |
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

## Módulo 3 (Revisiones y documentos, sprint 3)

**Equipo Websourcing · Desarrollo** · v1 · 2026-12-11. Complementa `docs/matriz-permisos.md` (sprints 1 y 2, que no se toca aquí; quien integre las ramas funde las dos). Fuente de las reglas RLS (`supabase/migrations/20261211000300_revdocs_rls.sql` y `..._storage.sql`) y de las pruebas `supabase/tests/database/20_` a `25_`.

Se lee igual que la matriz principal: cada fila es una puerta y cada columna, quién tiene llave. Las reglas generales no cambian: el super admin solo cuenta con 2FA (`aal2`) y sin sesión "ver como"; los permisos se leen de la base en cada consulta; quitado, bloqueado, empresa pausada o visitante no tienen acceso a nada.

**Todas las tablas nuevas son de solo lectura desde la API.** No hay política de INSERT, UPDATE ni DELETE para nadie: toda escritura pasa por las funciones de la segunda parte, que validan quién llama.

### Tablas

| Tabla | Rol | Leer | Escribir |
|---|---|---|---|
| `revisiones` | Super admin | Todas, también los borradores | Solo con funciones |
| | Admin cliente / Equipo | Las de **su** empresa, **sin borradores**. Todos los miembros activos las ven (el equipo, por defecto, ve avance y revisiones) | No |
| `revision_versiones` | Super admin | Todas, también el borrador de una versión | Solo con funciones. Una versión publicada ya no cambia ni se borra (trigger) |
| | Admin / Equipo | Solo las **publicadas** de revisiones que ven | No |
| `v_aprobaciones` (vista para leer) | Cliente y super admin, de su empresa | Sin IP, usuario ni user-agent; usar esta vista, no `select *` de la tabla |
| `aprobaciones` | Super admin | Todas (columnas públicas; la evidencia está en el registro) | **Nadie**: solo se agrega con `responder_revision` (trigger: ni cambio ni borrado ni truncado, para ningún rol) |
| | Admin / Equipo | Las de su empresa, **sin** `ip`, `user_id` ni `user_agent` (permiso de columna) | No |
| `documentos` | Super admin | Todos | Funciones |
| | Admin cliente | Todos los de su empresa, cualquiera sea la visibilidad | No |
| | Equipo | `todo_el_equipo`, y los `personas` donde Websourcing lo eligió (y no se le revocó) | No |
| `documento_versiones` | Super admin | Todas | Solo se agrega (`crear_documento`, `confirmar_version_documento`). Ni cambio ni borrado |
| | Admin / Equipo | Las de los documentos que pueden ver (la regla de `documentos` se aplica a la subconsulta) | No |
| `documento_permisos` | Super admin | Todos | `fijar_visibilidad_documento` (revocar = marcar `revocado_en`, no se borra) |
| | Admin cliente | Los de su empresa | No |
| | Equipo | Solo su propia fila | No |
| `archivos_cliente` | Super admin | Todos, incluidos los borrados (rastro) | `marcar_archivo_recibido` |
| | Admin / Equipo | Los de **su** empresa que no estén borrados (todos los miembros los ven; solo los suben quienes tienen "subir archivos") | `confirmar_archivo_cliente`, `borrar_archivo_cliente` |
| `subidas_reservadas` | Cualquiera con acceso | Solo las **suyas** | `reservar_subida` |

### Funciones

| Función | Quién | Qué hace / reglas |
|---|---|---|
| `crear_revision(proyecto, tipo, titulo, sprint?, documento?, link?, video?, acta?, resumen?)` | Super admin | Crea el borrador v1. Un diseño por proyecto y una revisión por sprint (las rondas son versiones). `https` obligatorio en enlaces. El acta debe ser un documento categoría `acta` de la misma empresa |
| `editar_borrador_revision(...)` | Super admin | Cambia el borrador de la versión; una publicada no se toca. Texto vacío borra |
| `publicar_revision(revision)` | Super admin | Publica la versión (el cliente la ve). Ata al avance: sprint `en_revision`, hito 5 (diseño) `esperando_aprobacion`. Exige link o video (salvo tipo documento) |
| `nueva_version_revision(revision)` | Super admin | Con cambios pedidos o reabierta: abre el borrador de la versión siguiente |
| `reabrir_revision(revision, motivo)` | Super admin | Solo una aprobada, con motivo (queda en el historial del cliente). Deshace la atadura: sprint y hito 5 vuelven a `en_curso`, el hito pierde su fecha real |
| `responder_revision(revision, version, decision, comentario?, captura?)` | Miembro **real** con permiso `aprobar` (el admin lo tiene) | `apruebo` o `pido_cambios` (comentario ≥ 5 caracteres; captura opcional). Guarda quién, cuándo, IP y navegador (`private.ip_cliente()`). Solo sobre la versión vigente. Aprobar termina el sprint o el hito 5; pedir cambios los devuelve a `en_curso`. No se deshace desde el portal |
| `bandeja_revisiones(empresa?)` | Super admin | Cuatro listas: aprobado, cambios_pedidos, esperando_a_websourcing (borradores y reabiertas), esperando_al_cliente. Filtro por cliente |
| `reservar_subida(destino, empresa, nombre, mime, tamano)` | `documento`: super admin · `archivo_cliente`: admin o "subir archivos" · `captura`: "aprobar" | Valida permiso, tipo y tamaño y devuelve la ruta generada por el servidor. Tope de 60 reservas por hora por persona |
| `confirmar_archivo_cliente(reserva, nota?, proyecto?)` | Miembro real con "subir archivos" | Mide el archivo en Storage (tamaño y tipo reales), lo registra con fecha, quién y nota |
| `borrar_archivo_cliente(archivo)` | Quien lo subió | Solo si está `nuevo`. Borrado suave; devuelve la ruta para quitarlo de Storage |
| `marcar_archivo_recibido(archivo)` | Super admin | `nuevo` → `recibido`: queda fijo |
| `crear_documento(...)`, `confirmar_version_documento(...)`, `fijar_visibilidad_documento(...)` | Super admin | Documento con su primera versión; versiones nuevas (v2, v3…); cambiar quién lo ve |
| `anotar_descarga(tipo, id)` | Quien ya puede ver la fila | Deja la descarga en el registro (con autor e IP). INVOKER: si no ve la fila, no anota |

**Nadie aprueba en nombre del cliente.** El super admin que no es miembro de la empresa recibe `no_autorizado`. Si es a la vez miembro de su propia empresa (D-006: el dueño es cliente de sí mismo), puede aprobar **como ese miembro**, pero nunca durante una sesión "ver como", y el historial lo registra como del cliente.

### Storage (`storage.objects`)

| Bucket | Qué guarda | Tope y tipos | Leer | Subir | Borrar |
|---|---|---|---|---|---|
| `documentos` | Lo que publica Websourcing | 50 MB; imágenes, PDF, video, audio, Office sin macros, CSV, TXT, ZIP | Quien ya puede ver la versión del documento (misma regla que la tabla). Super admin: todo | Solo super admin con reserva vigente | Nadie desde la API |
| `archivos-empresa` | Lo que sube el cliente | Igual | Su empresa y super admin (regla de `archivos_cliente`) | Admin o "subir archivos" con reserva vigente | Solo quien lo subió, tras `borrar_archivo_cliente` y mientras no esté `recibido` |
| `capturas-revisiones` | Capturas de "pido cambios" | 10 MB; PNG, JPG, WEBP | Quien ve la aprobación | Con permiso "aprobar" y reserva | Nadie |

Reglas comunes: buckets **privados**; ruta `empresa_id/carpeta/uuid.ext` generada por el servidor; la regla de subida exige una **reserva a nombre de la persona**, vigente (30 min), sin usar, en la empresa de la ruta y con el permiso del destino (se vuelve a leer en cada subida); **no hay regla de UPDATE** (nadie pisa un archivo); un visitante, un miembro quitado/bloqueado, una empresa pausada y el super admin sin 2FA no leen ni suben nada. En "ver como", se lee lo que vería el cliente y no se sube.

Excluidos a propósito: SVG (puede llevar scripts) y los formatos viejos de Office `.doc/.xls/.ppt` (admiten macros).

### Pruebas

`20_` flujo de revisiones y atadura al avance · `21_` permisos y separación por empresa de revisiones · `22_` documentos, versiones y visibilidad · `23_` archivos de la empresa · `24_` Storage por empresa · `25_` estructura, registro y límites.

## Módulo 4 (Dinero, sprint 4)

**Equipo Websourcing · Desarrollo** · sprint 4 · Uso interno. Complementa `docs/matriz-permisos.md` (no la reemplaza; al integrar se funden).

**Regla de oro:** ver dinero exige ser **admin del cliente** o tener el permiso **`ver_dinero`**, y solo de **su** empresa. El equipo sin `ver_dinero` no ve **ninguna** fila de este módulo (ni por tabla, ni por vista, ni por función, ni por archivo). Todo se lee de la base en cada consulta. Durante "ver como el cliente" todo es de solo lectura.

Roles: **SA** = super admin con 2FA (sin "ver como" abierto) · **Admin** = admin del cliente · **Eq+$** = equipo con `ver_dinero` · **Eq** = equipo sin `ver_dinero`. Sin 2FA, el super admin no tiene ningún poder. Anónimo: nada.

### Tablas y vistas

| Objeto | SA | Admin | Eq+$ | Eq | Escritura |
|---|---|---|---|---|---|
| `contratos` | Todos | El de su empresa | Idem | Nada | Solo funciones del SA |
| `pagos_programados` (el plan) | Todas (sin la columna cruda `hito_id`: se lee por `v_pagos_programados`) | Las de su empresa | Idem | Nada | Solo funciones del SA |
| `abonos` | Todos | Los de su empresa | Idem | Nada | Solo `crear_abono`, `confirmar_comprobante`; se anulan con `anular_abono` (nunca se editan ni se borran) |
| `facturas` | Todas | Las de su empresa | Idem | Nada | Solo SA (`crear_factura`, `anular_factura`); nunca se editan ni se borran |
| `comprobantes_pago` | Todos | Los de su empresa | Idem | Nada | El cliente solo por `subir_comprobante`; el SA los resuelve; nunca se borran |
| `avisos_salientes` (cola de avisos) | Todos | Nada | Nada | Nada | Triggers y la tarea de recordatorios. La vaciará el módulo de notificaciones (sprint 6) |
| `v_pagos_programados`, `v_contratos_saldo` | Todo | Lo de su empresa (`hito_id` null si el hito está oculto) | Idem | Vacías | No aplica (vistas `security_invoker`) |
| `v_ingresos_por_mes`, `v_ingresos_por_cliente`, `v_ingresos_por_mes_y_cliente` | Todo | **Vacías** | **Vacías** | **Vacías** | No aplica. Ingresos es solo del super admin |

Ningún rol de la aplicación tiene INSERT, UPDATE ni DELETE de tabla. `service_role` no tiene permisos de tabla (se concederán a notificaciones en el sprint 6).

### Funciones

| Función | Quién | Reglas clave |
|---|---|---|
| `crear_contrato`, `editar_contrato` | SA | Un contrato por proyecto. Moneda COP o USD. Anticipo ≤ valor. La moneda no cambia con cuotas o abonos; el valor no baja de lo programado/abonado |
| `agregar_pago`, `editar_pago`, `quitar_pago` | SA | Las cuotas suman ≤ valor del contrato. El hito debe ser del mismo proyecto. No se baja de lo abonado. Con comprobante en revisión no se cambia valor ni fecha. Solo se quita sin movimientos |
| `crear_abono`, `anular_abono` | SA | Un abono no pasa del saldo ni de lo que falta de su cuota. Fecha no futura. El motivo de anulación (5 a 500 letras) lo lee el cliente |
| `crear_factura`, `anular_factura` | SA | PDF ≤ 20 MB en `<empresa>/facturas/<uuid>.pdf`. Número de factura único |
| `subir_comprobante` | Admin, o equipo con `ver_dinero` **Y** `subir_archivos` | Cuota de **su** empresa (si no, `pago_no_encontrado`). PDF/PNG/JPG/WEBP ≤ 10 MB en `<empresa>/comprobantes/<uuid>.<ext>`. Valor ≤ lo que falta de la cuota y ≤ saldo. Un comprobante en revisión por cuota. **No crea abono** |
| `confirmar_comprobante` | SA | Aquí nace el abono (con el valor y la fecha declarados, o los que corrija el SA). Si pasa del saldo, todo se deshace |
| `rechazar_comprobante` | SA | Motivo obligatorio (5 a 500 letras), lo lee el cliente. **No crea abono** |
| `dinero_del_proyecto` | SA, Admin, Eq+$ | Sin permiso: `no_autorizado` (no devuelve vacío). Proyecto ajeno: `proyecto_no_encontrado` |
| `comprobantes_por_revisar` | SA | Bandeja de todas las empresas |
| `anotar_descarga_factura` | SA, Admin, Eq+$ (de su empresa) | Anota la descarga (1 por minuto y persona). Quien no puede ver la factura no anota nada |
| `generar_recordatorios_pago` | Solo `service_role` (tarea programada) | No repite avisos. Salta empresas pausadas, cuotas pagadas y con comprobante en revisión |
| `panel_super_admin`, `inicio_cliente` | Igual que en el sprint 2 | Ahora traen dinero: ver nota de Frontend. `inicio_cliente` trae dinero solo con `ver_dinero` |

### Archivos (Storage, bucket privado `dinero`)

Ruta siempre `<empresa_id>/<facturas|abonos|comprobantes>/<uuid>.<ext>`, generada por el servidor.

| Acción | SA | Admin | Eq+$ | Eq |
|---|---|---|---|---|
| Leer (la regla mira la tabla dueña: factura, comprobante o abono; no solo la carpeta) | Sí | De su empresa | De su empresa | No |
| Subir | Facturas, soportes y comprobantes en cualquier empresa | Solo comprobantes en su empresa | Solo comprobantes en su empresa y solo con `subir_archivos` | No |
| Reemplazar o borrar | Nadie (sin políticas de UPDATE ni DELETE) | Nadie | Nadie | Nadie |

En "ver como" no se sube nada. Las políticas sobre `storage.objects` solo se crean si existe ese esquema (Supabase real); las funciones que deciden (`private.puede_leer_archivo_dinero`, `private.puede_subir_archivo_dinero`) sí están probadas.

### Registro de actividad (por triggers)

`contrato_creado`, `contrato_editado`, `pago_programado_creado|editado|quitado`, `abono_registrado`, `abono_anulado`, `factura_subida`, `factura_anulada`, `factura_descargada`, `comprobante_subido`, `comprobante_confirmado`, `comprobante_rechazado`. Todos con `proyecto_id` en el detalle. Solo lo lee el super admin.

## Módulo 5 (Tickets y mantenimiento, sprint 5)

Equipo Websourcing · Desarrollo. Complementa `docs/matriz-permisos.md` (no la reemplaza). Todo se decide en la base de datos con RLS; el JWT no da permisos. Super admin = dueño, con 2FA (aal2). Ninguna tabla tiene acceso para `anon` ni `service_role`.

### Tablas (acceso directo por la API)

| Tabla | Super admin | Admin del cliente | Equipo del cliente | Escritura directa |
|---|---|---|---|---|
| `tickets` | Lee todos | Lee todos los de su empresa | Lee los que creó (o todos con el permiso `ver_todos_tickets`) | Ninguna: solo RPC |
| `ticket_mensajes` | Lee todos, con notas internas | Lee los no internos de tickets que ve | Igual | Ninguna: solo RPC |
| `ticket_adjuntos` | Lee todos | Los de tickets visibles; los de notas internas no | Igual | Ninguna: solo RPC (`preparar_adjunto_ticket`) |
| `garantias` | Lee, crea, edita | Lee las de su empresa | Lee las de su empresa | Solo super admin (con WITH CHECK) |
| `planes_base_mantenimiento` | Lee y edita `parametros`/`nota` | No | No | Solo super admin |
| `planes_mantenimiento` | Lee todos | Lee el de su empresa solo si está ACTIVO | No | Ninguna: solo RPC |
| `planes_mantenimiento_historial` | Lee | No | No | Ninguna |
| `bolsa_mensual`, `bolsa_avisos` | Lee | Lee si el mantenimiento está activo | No | Ninguna |
| `horas_registradas` | Lee todas | Lee solo las ya revisadas por el dueño | No | Ninguna |
| `horas_notas_internas` | Lee | No | No | Ninguna |
| `outbox_correos` | Lee | No | No | Ninguna (solo triggers) |
| Vistas `tickets_semaforo`, `bolsa_mensual_resumen` | Lee | Lee lo suyo (security invoker) | Tickets suyos | No aplica |

Nadie borra filas. Una empresa nunca ve datos de otra. En modo "ver como el cliente" todo es de solo lectura (trigger `ver_como_solo_lectura` en las 12 tablas).

### Funciones (RPC)

| Función | Quién | Qué hace / reglas clave |
|---|---|---|
| `crear_ticket` | Cliente (admin o equipo) | Tipo, título, detalle, prioridad propuesta, proyecto opcional (de la misma empresa). Calcula plazo y si queda `fuera_de_plan`. |
| `responder_ticket` | Cliente y super admin | Websourcing exige `p_area` (una de las 6 áreas) o `p_interno=true`. El primer mensaje público de Websourcing marca la primera respuesta. |
| `retirar_texto_mensaje` | Super admin | Retira el texto (queda constancia). |
| `preparar_adjunto_ticket` | Quien ve el ticket | Valida tipo (imagen, video, audio), tamaño (hasta 50 MB), máximo 30; devuelve la ruta en el bucket `portal-tickets`. |
| `clasificar_ticket` | Super admin | Confirma prioridad (y corrige tipo); `nuevo` pasa a `clasificado`. |
| `cambiar_estado_ticket` | Super admin | Transiciones válidas; `resuelto` exige resolución. Cambios o fuera de plan no pasan a `en_progreso` sin decisión; bolsa agotada sin autorización tampoco. |
| `marcar_solicitud_cambio` | Super admin | Convierte el ticket en solicitud de cambio (pasa al flujo del Product Manager). |
| `decidir_ticket` | Super admin | `regalar`, `cobrar` (valor y moneda) o `rechazar` (cierra el ticket). |
| `aceptar_cobro_ticket`, `rechazar_cobro_ticket` | Admin del cliente | Acepta o rechaza el cobro propuesto. Rechazar cierra el ticket. |
| `confirmar_resolucion` | Dueño del ticket o admin del cliente | Cierra un ticket `resuelto`. |
| `calificar_ticket` | Quien creó el ticket o admin | 1 a 5 estrellas, una sola vez, ticket cerrado. |
| `activar_mantenimiento`, `apagar_mantenimiento`, `configurar_mantenimiento` | Super admin (aal2) | Activar exige cuota y fecha de inicio. Todo queda en el historial con motivo. |
| `anotar_horas_ticket` | Super admin | Horas manuales por ticket; quedan `pendiente_dueno`. |
| `revisar_horas` | Super admin (dueño) | Aprueba (descuenta de la bolsa; el sobrante pasa a hora extra) o rechaza con motivo. |
| `decidir_horas_extra`, `autorizar_horas_extra` | Admin del cliente | Decide una hora extra o pre-autoriza las del mes. |
| `mi_mantenimiento_activo` | Cualquier usuario | `true` si su empresa tiene el plan activo (para mostrar el módulo). |

### Reglas y semáforo

- Horario por defecto (D-002): lunes a viernes 8:00 a 18:00, hora de Bogotá, sin festivos. Con plan activo y vigente mandan los horarios y tiempos del plan (D-003).
- Semáforo: `verde` (queda más del 50 % del plazo), `amarillo` (50 % o menos; umbral en `configuracion('semaforo_tickets')`), `rojo` (vencido), `cumplido` / `incumplido` (ya hubo primera respuesta), `cerrado`, `sin_plazo` (prioridad baja: siguiente planeación).
- Bolsa de horas (D-007): las horas no usadas se pierden al cerrar el mes, salvo que el plan tenga `acumular_horas`; en ese caso se arrastra como máximo el sobrante de un mes de horas propias.
- Horas (D-008): las anota el super admin y el dueño las revisa antes de descontar. Aviso al 80 % y al 100 %, con historial.
- Cierre automático: tickets `resuelto` sin confirmar se cierran a los 3 días.
- Los textos libres de tickets (título, mensajes) no se guardan en `registro_actividad` ni en la cola de correos.

### Interpretaciones tomadas (9)

Aceptadas por Calidad como lecturas válidas: 2 y 4. Corregida tras la revisión: 5. Las demás siguen pendientes de confirmación del dueño.

1. Un día hábil equivale a una jornada completa de horario hábil.
2. (Lectura aceptada.) Tickets de soporte son error, pregunta y acceso; las solicitudes de cambio no cuentan como soporte, así que `fuera_de_plan` también aplica a pregunta y acceso.
3. `fuera_de_plan` se evalúa al crear el ticket. El ticket se puede crear, pero no se trabaja sin decisión del dueño.
4. (Lectura aceptada.) Registrar y revisar horas lo hace el super admin; la versión 1 no tiene un rol de personal separado.
5. (Corregida, Módulo 10.) Las horas se anotan en todos los tickets y descuentan de la bolsa todas, salvo las de solicitudes de cambio: se cotizan aparte (CLAUDE.md sección 5), quedan anotadas para costo (`sin_descuento`) y no tocan la bolsa.
6. Los valores de los planes Básico, Estándar y Premium (incluidas las horas) son propuestas de Desarrollo, sin precios; el dueño las confirma.
7. El semáforo no se detiene en `esperando_cliente`; solo mide la primera respuesta.
8. Rechazar el cobro de un ticket lo cierra (`cobro_rechazado`).
9. "3 días" del cierre automático son días corridos; se omiten empresas pausadas; la bolsa agotada solo frena el paso a `en_progreso` de tickets nuevos, no los que ya están en curso.

### Correcciones de Calidad (migración `20270108000800`)

- I-1: la cola de correos guarda solo identificadores, tipo y datos de control (nunca título ni texto del cliente).
- I-2 (elegido: el corte espera): `cerrar_mes_bolsas` no cierra una bolsa mientras haya horas en `pendiente_dueno`; el dueño las revisa y se imputan a la bolsa del mes en que se trabajaron. El corte corre a diario, así que cierra al día siguiente de la revisión. Si la bolsa del mes siguiente ya existía, recibe lo arrastrado.
- M-1: al aprobar horas no se guarda nota (el cliente ve las filas aprobadas); la nota solo existe al rechazar, y esas filas no las ve el cliente.
- M-2: un plan sin `horas_mes` mayor que 0 no se activa (`horas_requeridas`).
- M-3: no se decide "cobrar" en un ticket en `en_progreso`, `esperando_cliente` o `resuelto` (`ticket_en_progreso`).
- M-5: el bucket `portal-tickets` se corrige (privado, 50 MB, tipos permitidos) aunque ya existiera.

## Integración y sprint 6 (cola de avisos, freno de acceso, ahorro de espacio)

| Objeto | Anónimo | Cliente / equipo | SA (con 2FA) | service_role |
|---|---|---|---|---|
| `avisos_salientes` (cola única) | nada | nada (sin lectura directa) | solo lectura | select y update de `estado, intentos, enviado_en, ultimo_error, programado_para, reclamado_hasta`; no inserta ni borra |
| `reclamar_avisos`, `marcar_aviso`, `marcar_avisos_sin_proveedor` | nada | nada | nada | ejecutar |
| `freno_acceso_consultar`, `freno_acceso_anotar` | nada | nada | nada | ejecutar |
| Cuota de espacio por empresa (config y uso) | nada | ver su uso | ver y cambiar la cuota | nada |
| `archivados` (registro de archivos trasladados) | nada | leer los de su empresa | leer y marcar | nada |
| Interruptor `videos_a_archivo_externo` | nada | nada | leer y cambiar | nada |
| Resumen del registro de actividad a 12 meses | nada | nada | ejecutar | nada |

La cola guarda solo identificadores, tipo y referencia; los destinatarios y textos se resuelven al enviar, en el servidor.
