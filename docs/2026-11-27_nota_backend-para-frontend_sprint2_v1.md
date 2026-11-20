# Nota de Desarrollo (backend) para Desarrollo (frontend) · Sprint 2

**Equipo Websourcing · Desarrollo** · v1 · 2026-11-27. Uso interno.

Qué quedó listo en el servidor para proyectos, hitos, plan de sprints, panel, historial y "ver como el cliente". Las reglas de quién ve qué están en `docs/matriz-permisos.md`. Las pantallas **no** repiten esas reglas: preguntan a la base y la base responde. Lo del sprint 1 sigue igual (`docs/2026-11-23_nota_backend-para-frontend_v1.md`).

## 1. Archivos

| Archivo | Qué trae de nuevo |
|---|---|
| `lib/portal/acciones.ts` | `crearProyecto`, `editarProyecto`, `editarHito`, `fijarPagoHito`, `cargarPlanSprints`, `agregarSprint`, `editarSprint`, `cambiarEstadoSprint`, `quitarSprint`, `reordenarSprints`, `aprobarPlanSprints`, `panelSuperAdmin`, `inicioCliente`, `lineaDeTiempo`, `iniciarVerComo`, `terminarVerComo`, `anotarRechazo` |
| `lib/portal/errores.ts` | Los códigos nuevos de la sección 5 ya traducidos |
| `lib/supabase/database.types.ts` | Tablas, la vista `v_proyectos_resumen`, las funciones y los tipos `PanelSuperAdmin`, `InicioCliente`, `LineaDeTiempo`, `ResumenProyecto`. Los estados de contexto suman `'ver_como'` |

Todas usan el cliente de **sesión del usuario**, nunca la llave de sistema. Las fechas viajan como texto `AAAA-MM-DD`. "Hoy" es la fecha de Colombia.

## 2. Forma exacta de `proyectos` (la usan otros módulos)

`id uuid pk` · `empresa_id uuid not null → empresas(id)` · `nombre` (2–160) · `descripcion` (≤1000, nula) · `estado` (`activo` | `pausado` | `terminado` | `cancelado`) · `fecha_inicio`, `fecha_fin_planeada`, `fecha_fin_real` (fechas, nulas) · `plan_estado` (`propuesta` | `aprobado`) · `plan_aprobado_en` · `avance_pct numeric(5,2)` · `avance_partes_hechas`, `avance_partes_total` · `creado_en`, `actualizado_en`.

Llaves: `unique (empresa_id, id)` **y** `unique (id, empresa_id)`. Las tablas hijas se enlazan con `foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id)` (o `(id, empresa_id)`). RLS: lee el super admin (todos) o el miembro activo de la empresa. Sin escritura directa. Toda tabla nueva de `public` debe llevar el trigger `ver_como_solo_lectura` (`private.bloquear_escritura_ver_como()`, antes de insert/update/delete/truncate por sentencia): una prueba estructural falla si falta.

## 3. Qué usa cada pantalla

**Inicio del cliente (`/cliente/inicio`)**: `inicioCliente(c)` devuelve `{ empresa, proyectos[], pendientes_del_cliente[] }`. Cada proyecto trae avance (`avance_pct`, `avance_partes_hechas`/`avance_partes_total`, por ejemplo "3/14"), `sprint_actual_*`, `proxima_demo`, `hitos_atrasados` y `hito_actual_*`. `pendientes_del_cliente` son los hitos cuyo último retraso es "esperando al cliente", con `que_falta`: es el aviso claro que pide el requerimiento. Para el super admin (sin "ver como") responde `no_autorizado`: use el panel.

**Línea de tiempo (`/cliente/inicio` detalle y `/admin/proyectos/:empresa/:proyecto`)**: `lineaDeTiempo(c, proyectoId)` en una sola llamada:
```ts
const { data, error } = await lineaDeTiempo(c, proyectoId);
// data.proyecto  -> resumen (avance, sprint actual, próxima demo)
// data.hitos[]   -> { numero, nombre, estado, fecha_planeada, fecha_real, atrasado, pago_asociado, retrasos[] }
// data.plan      -> null si el cliente aún no tiene plan aprobado; si no: { estado, sprints[], cambios[], avisos[] }
```
`pago_asociado` solo llega si quien pregunta es admin, tiene `ver_dinero` o es super admin; si no, viene `null` (no lo pinte). El hito 13 no llega al cliente mientras el mantenimiento esté apagado. `retrasos[]` trae `fecha_anterior`, `fecha_nueva`, `motivo`, `lado` y `que_falta`. `plan.cambios[]` son los cambios a un plan ya aprobado, con su motivo. `plan.avisos` (cruces de fechas) solo llega al super admin.

**Panel general (`/admin/panel`)**: `panelSuperAdmin(c)` → `{ totales, proyectos[], atencion[] }`. `totales` trae `pagos_vencidos` y `tickets_abiertos` en `null` a propósito: esos módulos llegan en los sprints 4 y 5 (muestre "—"). `atencion[]` mezcla tres tipos (`hito_atrasado`, `plan_por_aprobar`, `demo_proxima`) ordenados por prioridad.

**Historial del proyecto**: lectura directa, la misma consulta sirve a los dos roles:
```ts
c.from('historial_proyecto').select('*').eq('proyecto_id', id).order('id', { ascending: false });
```
El cliente solo recibe las filas aptas (sin IP, sin autor; `actor_tipo` es `equipo_websourcing`, `cliente` o `sistema`: se firma "Equipo Websourcing"). El super admin recibe todas, con `visible_cliente`. Tipos: `proyecto_creado`, `proyecto_estado_cambiado`, `hito_estado_cambiado`, `hito_fecha_fijada`, `retraso_registrado`, `plan_sprints_aprobado`, `plan_sprints_modificado`, `sprint_estado_cambiado`; el contenido va en `detalle` (por ejemplo `numero`, `nombre`, `motivo`, `lado`). El **registro de actividad** completo (con IP y autor) sigue siendo solo del super admin: `from('registro_actividad').select('*').eq('detalle->>proyecto_id', id)` (hay índice).

**Detalle de proyecto del super admin**: lecturas directas permitidas sobre `proyectos`, `hitos`, `sprints`, `retrasos`, `cambios_plan` y `hitos_pago_asociado`. **Ninguna se escribe directo**: todo con las funciones.

## 4. Funciones de escritura (solo super admin con 2FA)

Todas devuelven `{ data, error }`. Para el error use `mensajeDeError(error)`.

| Función (`acciones.ts`) | Parámetros | Devuelve |
|---|---|---|
| `crearProyecto(c, { p_empresa_id, p_nombre, p_descripcion?, p_fecha_inicio?, p_fecha_fin_planeada? })` | | `{ proyecto_id }`. Nace con 13 hitos (el 13 oculto) |
| `editarProyecto(c, { p_proyecto_id, p_nombre?, p_descripcion?, p_estado?, p_fecha_inicio?, p_fecha_fin_planeada?, p_fecha_fin_real? })` | Lo nulo no cambia | |
| `editarHito(c, { p_hito_id, p_nombre?, p_estado?, p_fecha_planeada?, p_motivo?, p_lado?, p_que_falta?, p_visible?, p_fecha_real? })` | | `{ hito_id, retraso_registrado }` |
| `fijarPagoHito(c, hitoId, concepto \| null)` | Vacío o `null` quita la etiqueta | |
| `cargarPlanSprints(c, { p_proyecto_id, p_sprints })` | `p_sprints`: lista de `{ nombre, fecha_inicio, fecha_fin, fecha_demo?, incluye?: string[] }` (1 a 30). Reemplaza la propuesta. Solo si el plan no está aprobado | `{ sprints, avisos }` |
| `agregarSprint(c, { p_proyecto_id, p_nombre, p_fecha_inicio, p_fecha_fin, p_fecha_demo?, p_incluye?, p_motivo? })` | `p_motivo` obligatorio si el plan ya está aprobado | `{ sprint_id, numero, avisos }` |
| `editarSprint(c, { p_sprint_id, p_nombre?, p_fecha_inicio?, p_fecha_fin?, p_fecha_demo?, p_incluye?, p_estado?, p_motivo?, p_correr_siguientes? })` | Con plan aprobado, cambiar nombre, fechas o contenido exige `p_motivo`; cambiar solo el estado no | `{ sprint_id, avisos }` |
| `cambiarEstadoSprint(c, sprintId, estado)` | Atajo de `editarSprint` | |
| `quitarSprint(c, sprintId, motivo?)` | Solo sprints `propuesto` o `aprobado`; motivo obligatorio con plan aprobado; los demás se renumeran | `{ avisos }` |
| `reordenarSprints(c, proyectoId, orden, motivo?)` | `orden`: **todos** los ids de sprint en el orden nuevo; los iniciados no se mueven | `{ avisos }` |
| `aprobarPlanSprints(c, proyectoId)` | Necesita al menos un sprint | `{ avisos }` |

**Retrasos con motivo obligatorio** (hito 2 con fecha ya fijada, pasa al 11 de diciembre por el cliente):
```ts
await editarHito(c, {
  p_hito_id, p_fecha_planeada: '2026-12-11',
  p_lado: 'cliente', p_motivo: 'Falta el material de marca', p_que_falta: 'Logo en vectores',
});
// Sin lado o sin motivo -> retraso_requiere_lado / retraso_requiere_motivo; lado 'cliente' sin que_falta -> retraso_requiere_que_falta
```
La primera vez que se fija una fecha no hace falta nada. Para el super admin, avise en pantalla la lista `avisos` (cruces `{ tipo: 'cruce_de_fechas', sprints: [1, 2] }`): **solo avisa, no impide guardar**.

**Plan de sprints (flujo)**: el Equipo carga la propuesta (`cargarPlanSprints`) → el super admin agrega, quita, reordena y edita sin motivo mientras el plan es propuesta → `aprobarPlanSprints` (los sprints pasan de `propuesto` a `aprobado` y el cliente los ve) → desde ahí cada cambio pide motivo y el cliente lo ve en `plan.cambios`. Ya aprobado no se puede volver a "propuesta" ni recargar.

## 5. Errores nuevos

`error.message` trae el código; `errores.ts` ya los traduce.

| Código | Cuándo |
|---|---|
| `no_autorizado` | Quien llama no es super admin con 2FA (o, en lectura, no tiene acceso) |
| `ver_como_solo_lectura` | Hay una sesión "ver como" abierta: nada se escribe (en las funciones y en cualquier tabla) |
| `sin_sesion_ver_como` | `terminarVerComo` sin sesión abierta |
| `proyecto_no_encontrado` | No existe **o no es suyo** (mismo mensaje) |
| `proyecto_cerrado` | El proyecto está terminado o cancelado (se reabre con `editarProyecto`) |
| `hito_no_encontrado`, `sprint_no_encontrado` | No existe |
| `hito_derivado` | Se intentó cambiar a mano el estado o la fecha real del hito 6 |
| `hito_no_ocultable` | `p_visible` en un hito distinto del 13 |
| `fechas_invalidas` | Fin antes del inicio, demo antes del inicio, fecha real futura |
| `retraso_requiere_lado`, `retraso_requiere_motivo`, `retraso_requiere_que_falta` | Cambio de fecha sin lo obligatorio |
| `plan_requiere_motivo` | Cambio a un plan aprobado sin motivo |
| `plan_ya_aprobado`, `plan_no_aprobado`, `plan_vacio` | Estado del plan no permite la acción |
| `sprint_ya_iniciado` | Quitar un sprint que ya empezó |
| `orden_invalido` | `orden` incompleto, con ids ajenos o que mueve sprints iniciados |
| `datos_invalidos` | Texto o estado fuera de rango (los textos se recortan y validan) |
| `empresa_no_disponible`, `empresa_no_encontrada` | Crear proyecto o ver como en empresa pausada o inexistente |

## 6. "Ver como el cliente" (decisión D-020, pendiente de aprobación del dueño)

```ts
const { data } = await iniciarVerComo(c, { p_empresa_id, p_rol: 'equipo', p_ver_dinero: true });
// data: { sesion_id, empresa_id, empresa_nombre, rol, vence_en }
// a partir de aquí las pantallas del cliente funcionan con la misma sesión del super admin
await terminarVerComo(c);
```
- `miContexto()` pasa a `estado: 'ver_como'` y trae `ver_como: { empresa_nombre, rol, vence_en }`, `empresa`, `rol` y `permisos` simulados, y `es_super_admin: true`. **Pinte siempre un aviso fijo** ("Estás viendo como {empresa}") con el botón Salir.
- Dura **60 minutos**; al vencer, el usuario vuelve solo a `super_admin`. Iniciar otra reemplaza la anterior.
- `p_rol`: `admin_cliente` (todos los permisos) o `equipo` (con `p_aprobar`, `p_ver_dinero`, `p_ver_todos_tickets`, `p_subir_archivos`, por defecto falsos).
- Es **solo lectura**: mientras dura, las funciones del super admin y toda escritura responden `ver_como_solo_lectura` (por ejemplo, también `miembros`, `datos_facturacion`, el tema). El panel del super admin tampoco funciona: hay que salir primero.
- La marca vive en el servidor, no en el navegador: abrir otra pestaña con el mismo inicio de sesión también queda en solo lectura. Para una empresa pausada no aplica (`empresa_no_disponible`).
- Queda en el registro: `ver_como_iniciado` y `ver_como_terminado`.

## 7. Rastro de intentos rechazados (M-7)

Una función que falla deshace todo, también su rastro. Para dejarlo, cuando una acción sensible responda con error, el servidor llama aparte `anotarRechazo(c, 'editar_hito', codigoDeError(error))`. Solo guarda la acción y el código (patrón `[a-z_]`), a nombre de quien llama, con tope de 20 por minuto; si no se pudo anotar, ignórelo (no muestre nada). Conviene envolverlo en la capa del servidor que ya llama a las funciones. Además, el gancho de Auth (cuando esté encendido en el plan Pro) anota `inicio_de_sesion` y `inicio_de_sesion_fallido` (hasta 5 por racha).

## 8. Ambigüedades y la lectura que tomé

1. **"Aprobar el plan"** (requerimientos, Módulo 7) = publicarlo al cliente. No es una aprobación del cliente y el super admin sigue sin poder aprobar en su nombre.
2. **Avance (D-013)**: 11 hitos (1–5 y 7–12) valen una parte cada uno; el hito 6 vale lo que sumen sus sprints (una parte por sprint); el 13 nunca cuenta. Los sprints solo cuentan cuando el plan está aprobado; antes (o sin sprints) el hito 6 es una sola parte, así el cliente no ve que el avance se mueva con borradores. Ejemplo: 3 sprints = 14 partes, un sprint terminado = 1/14. Redondeo a 2 decimales.
3. **El estado del hito 6 es derivado**: pendiente si ningún sprint arrancó, en curso si alguno arrancó, "esperando aprobación" si alguno está en revisión, terminado cuando todos terminaron.
4. **Retrasos**: cualquier cambio de una fecha planeada ya fijada (también adelantarla) exige motivo y lado. Un hito está atrasado si no está terminado y su fecha planeada es anterior a hoy (Colombia).
5. **Estados manuales**: en este sprint el super admin puede mover hitos (`pendiente`, `en_curso`, `esperando_aprobacion`, `terminado`) y sprints (incluido `terminado`) sin pasar por una aprobación del cliente, porque las revisiones y aprobaciones llegan en el sprint 3. Allí se atará `terminado` de diseño y de sprint a la aprobación. Reabrir un hito terminado borra su fecha real.
6. **Hito 13**: nace oculto. `editarHito({ p_visible: true })` lo muestra; el módulo de mantenimiento (sprint 6) lo hará al activar el plan. Los eventos que ocurrieron mientras estaba oculto siguen ocultos al cliente.
7. **Pago asociado** del hito: solo la etiqueta (Anticipo, Segundo pago, Saldo final, Cuota mensual) en una tabla aparte con permiso de dinero; los montos son del sprint 4.
8. **Quitar un sprint** lo elimina de la tabla (solo si no empezó); el rastro queda en el registro y, con plan aprobado, en `cambios_plan`.
9. **"Correr los siguientes"**: se corren los mismos días que se movió el **fin** del sprint editado (si el fin no cambia, lo que se movió el inicio), con fechas de inicio, fin y demo.
10. **Un cliente de empresa pausada** no ve nada (igual que en el sprint 1).

## 9. Lo que falta o no se probó

- Medición de rendimiento con volumen (M-8): las políticas ya usan subconsultas que se evalúan una vez por consulta y `miembro_activo` se lee una sola vez por llamada, pero no se midió con miles de filas. Revisar al llegar al sprint 3.
- M-9 (`postcss` dentro de `next`) no es de servidor: queda para Frontend/auditoría.
- Todo se probó con PostgreSQL local y pgTAP; el gancho de intentos y la IP siguen pendientes de probar con Supabase real.
- No hay avisos por correo (sprint 6) ni pagos vencidos/tickets en el panel (sprints 4 y 5).
