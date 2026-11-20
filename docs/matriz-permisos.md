# Matriz de permisos · Portal de clientes Websourcing

**Equipo Websourcing · Desarrollo** · Se amplía en cada sprint. Última actualización: sprint 1 (2026-11-23).
Fuente de las reglas RLS (`supabase/migrations/20261123000400_rls_y_permisos.sql`) y de las pruebas (`supabase/tests/database/`). Si una regla cambia, se cambia primero aquí.

## Cómo leerla

Como las llaves de un edificio: cada fila es una puerta (tabla) y cada columna es quién tiene llave y qué puede hacer con ella.

- **Super admin**: el dueño. Solo cuenta si la sesión tiene el código adicional (2FA, `aal2`). Sin él, **no tiene ningún permiso**.
- **Admin cliente**: `miembros.rol = admin_cliente`, de **su** empresa.
- **Equipo**: `miembros.rol = equipo`, de su empresa; algunas puertas dependen de sus permisos (`aprobar`, `ver_dinero`, `ver_todos_tickets`, `subir_archivos`).
- **Sin acceso**: usuario quitado, bloqueado (como miembro o a nivel de perfil), de una empresa pausada, sin perfil, o visitante sin sesión. **Ninguna tabla, ninguna función** (salvo `politica_vigente()` y `mi_contexto()`, que solo hablan del propio usuario).
- Leer / Crear / Editar / Borrar: **Sí**, **No**, o la condición. "RPC" significa que solo se hace con la función indicada, que valida quién llama.
- **Borrar: nadie**, en ninguna tabla (nada se borra desde la aplicación; quitar y pausar son marcas).
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
| | Admin cliente | El suyo y los de quienes tienen o tuvieron fila en su empresa | No | Solo el suyo: `nombre`, `celular` | No |
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
| `registro_actividad` | Super admin | Todo | **No** (solo triggers) | **No** (solo se agrega) | **No** |
| | Admin cliente / Equipo | **No** (el cliente verá su historial por una vista aparte, sprint 2) | No | No | No |
| `configuracion` | Super admin | Toda | Sí | Sí (`valor`) | No |
| | Admin cliente / Equipo | Toda (solo lectura) | No | No | No |
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
| `invitar_miembro(empresa_id, correo, rol?, aprobar?, ver_dinero?, ver_todos_tickets?, subir_archivos?)` | Super admin (cualquier rol y empresa) · Admin cliente (solo `equipo`, solo su empresa) | Crea la invitación (7 días, un solo uso). Si ya había una pendiente, la reemplaza |
| `aceptar_invitacion(token, version_politica, nombre?, celular?, ip?)` | Usuario autenticado con correo confirmado, igual al invitado | Crea perfil (si no existe) y membresía, marca la invitación usada, guarda la aceptación de la política (versión, fecha, IP) |
| `quitar_miembro(miembro_id)` | Super admin · Admin cliente (solo "equipo" de su empresa, nunca a sí mismo) | Marca `quitado_en`, cierra sus sesiones, conserva el historial |
| `bloquear_miembro(miembro_id, bloqueado?)` | Igual que quitar | Bloquea o desbloquea; al bloquear cierra sesiones |
| `pausar_empresa(empresa_id, motivo?)` / `reactivar_empresa(empresa_id)` | Solo super admin (2FA) | Pausa (cierra sesiones de todos sus usuarios) o reactiva. No borra nada |
| `bloquear_usuario(user_id, bloqueado?)` | Solo super admin (2FA) | Bloqueo global del perfil. Nunca a un super admin |
| `mi_contexto()` | Usuario autenticado | Estado del propio usuario para decidir a qué pantalla va |
| `politica_vigente()` | Cualquiera, incluso sin sesión | Versión vigente de la política de datos |

## Pendiente de ampliar

Sprint 2: `proyectos`, `hitos`, `retrasos`, `sprints`, vista del historial para el cliente, sesiones "ver como". Sprint 3: `revisiones`, `aprobaciones`, `documentos`, `documento_versiones`, `documento_permisos`, `archivos_cliente` y las reglas de Storage. Sprint 4: dinero. Sprint 5: tickets. Sprint 6: mantenimiento.
