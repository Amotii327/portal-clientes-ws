# Matriz de permisos · Revisiones y documentos (sprint 3)

**Equipo Websourcing · Desarrollo** · v1 · 2026-12-11. Complementa `docs/matriz-permisos.md` (sprints 1 y 2, que no se toca aquí; quien integre las ramas funde las dos). Fuente de las reglas RLS (`supabase/migrations/20261211000300_revdocs_rls.sql` y `..._storage.sql`) y de las pruebas `supabase/tests/database/20_` a `25_`.

Se lee igual que la matriz principal: cada fila es una puerta y cada columna, quién tiene llave. Las reglas generales no cambian: el super admin solo cuenta con 2FA (`aal2`) y sin sesión "ver como"; los permisos se leen de la base en cada consulta; quitado, bloqueado, empresa pausada o visitante no tienen acceso a nada.

**Todas las tablas nuevas son de solo lectura desde la API.** No hay política de INSERT, UPDATE ni DELETE para nadie: toda escritura pasa por las funciones de la segunda parte, que validan quién llama.

## Tablas

| Tabla | Rol | Leer | Escribir |
|---|---|---|---|
| `revisiones` | Super admin | Todas, también los borradores | Solo con funciones |
| | Admin cliente / Equipo | Las de **su** empresa, **sin borradores**. Todos los miembros activos las ven (el equipo, por defecto, ve avance y revisiones) | No |
| `revision_versiones` | Super admin | Todas, también el borrador de una versión | Solo con funciones. Una versión publicada ya no cambia ni se borra (trigger) |
| | Admin / Equipo | Solo las **publicadas** de revisiones que ven | No |
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

## Funciones

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

## Storage (`storage.objects`)

| Bucket | Qué guarda | Tope y tipos | Leer | Subir | Borrar |
|---|---|---|---|---|---|
| `documentos` | Lo que publica Websourcing | 50 MB; imágenes, PDF, video, audio, Office sin macros, CSV, TXT, ZIP | Quien ya puede ver la versión del documento (misma regla que la tabla). Super admin: todo | Solo super admin con reserva vigente | Nadie desde la API |
| `archivos-empresa` | Lo que sube el cliente | Igual | Su empresa y super admin (regla de `archivos_cliente`) | Admin o "subir archivos" con reserva vigente | Solo quien lo subió, tras `borrar_archivo_cliente` y mientras no esté `recibido` |
| `capturas-revisiones` | Capturas de "pido cambios" | 10 MB; PNG, JPG, WEBP | Quien ve la aprobación | Con permiso "aprobar" y reserva | Nadie |

Reglas comunes: buckets **privados**; ruta `empresa_id/carpeta/uuid.ext` generada por el servidor; la regla de subida exige una **reserva a nombre de la persona**, vigente (30 min), sin usar, en la empresa de la ruta y con el permiso del destino (se vuelve a leer en cada subida); **no hay regla de UPDATE** (nadie pisa un archivo); un visitante, un miembro quitado/bloqueado, una empresa pausada y el super admin sin 2FA no leen ni suben nada. En "ver como", se lee lo que vería el cliente y no se sube.

Excluidos a propósito: SVG (puede llevar scripts) y los formatos viejos de Office `.doc/.xls/.ppt` (admiten macros).

## Pruebas

`20_` flujo de revisiones y atadura al avance · `21_` permisos y separación por empresa de revisiones · `22_` documentos, versiones y visibilidad · `23_` archivos de la empresa · `24_` Storage por empresa · `25_` estructura, registro y límites.
