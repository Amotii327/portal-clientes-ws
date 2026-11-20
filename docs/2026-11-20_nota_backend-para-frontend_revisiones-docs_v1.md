# Nota de Desarrollo (backend) para Desarrollo (frontend) · Sprint 3 · Revisiones y documentos

**Equipo Websourcing · Desarrollo** · v1 · 2026-12-11. Uso interno.

Qué quedó listo en el servidor para los Módulos 3 (Revisiones y aprobaciones) y 6 (Documentos, con "Archivos de la empresa"). Las reglas de quién ve qué están en `docs/matriz-permisos-revisiones-docs.md`. Las pantallas **no** repiten esas reglas: preguntan a la base y la base responde. Lo de los sprints 1 y 2 sigue igual.

## 1. Archivos

| Archivo | Qué trae |
|---|---|
| `lib/portal/acciones-revisiones-docs.ts` | Todas las acciones (sección 4) más `reservarYSubir`, `borrarArchivoCliente` y `enlaceDeDescarga`, que ya hacen los pasos con Storage |
| `lib/portal/errores-revisiones-docs.ts` | `mensajeDeErrorRevDocs(error)` y `codigoDeErrorRevDocs(error)`: traducen los códigos nuevos y, si no son de este sprint, caen en `errores.ts` |
| `lib/supabase/tipos-revisiones-docs.ts` | Tipos de las tablas y de lo que devuelven las funciones, y las constantes `TIPOS_PERMITIDOS`, `TAMANO_MAXIMO_ARCHIVO` |

`database.types.ts`, `acciones.ts` y `errores.ts` **no se tocaron** (otros equipos trabajan en ellos). Las acciones nuevas usan el cliente de **sesión del usuario**, nunca la llave de sistema, y se tipan sin `Database`. Cuando se integren las ramas se pueden fundir en los archivos principales.

## 2. Modelo en una frase

Una **revisión** es un entregable (el diseño del proyecto, un sprint o un documento) con **versiones** (v1, v2…) y un estado: `borrador` (el cliente no la ve) → `publicada` (espera al cliente) → `aprobada` o `cambios_pedidos`; el super admin puede dejarla `reabierta`. La respuesta del cliente (`aprobaciones`) es de una por versión y no se deshace. Un **documento** tiene versiones que nunca se reemplazan en silencio, y una visibilidad que decide Websourcing: `todo_el_equipo`, `solo_admin` o `personas`.

## 3. Qué usa cada pantalla

**Revisiones del cliente (`/cliente/revisiones`)**: lectura directa, la base ya filtra borradores y empresas ajenas.
```ts
c.from('revisiones').select('*').eq('proyecto_id', id).order('actualizado_en', { ascending: false });
c.from('revision_versiones').select('*').eq('revision_id', rid).order('version');   // solo las publicadas
c.from('v_aprobaciones').select('id,revision_id,version,decision,comentario,captura_path,persona,creado_en').eq('revision_id', rid).order('version');   // sin IP ni usuario; trae `persona`
```
**Nunca use `select('*')` sobre la tabla `aprobaciones`**: la IP y el usuario están ocultos y falla con 42501. Lea siempre la vista `v_aprobaciones` (misma empresa, mismas reglas).

Las que esperan al cliente son `estado = 'publicada'` (úselas para el aviso "tienes algo por aprobar"). **Botones "Apruebo" y "Pido cambios"**: muéstrelos si `estado = 'publicada'`, pero **la base decide**: si responde `sin_permiso_aprobar`, diga que pida el permiso a su administrador (el permiso está en `miContexto().permisos.aprobar`). Para "Pido cambios": comentario obligatorio y captura opcional:
```ts
const cap = archivo ? await reservarYSubir(c, 'captura', empresaId, archivo) : null;   // PNG/JPG/WEBP, máx. 10 MB
await responderRevision(c, { p_revision_id, p_version: revision.version_actual, p_decision: 'pido_cambios',
  p_comentario: texto, p_captura_reserva_id: cap?.data?.reserva_id });
```
Pase siempre la versión que la persona está viendo. Una aprobación no se puede deshacer desde el portal: el botón no debe ofrecer "deshacer". La captura se ve con `enlaceDeCaptura(c, aprobacion.captura_path)`.

**Bandeja del super admin (`/admin/aprobaciones`)**: `bandejaRevisiones(c, empresaId?)` → `{ aprobado[], cambios_pedidos[], esperando_a_websourcing[], esperando_al_cliente[] }` con filtro por cliente. `esperando_a_websourcing` junta lo que el dueño debe mover: borradores por publicar y revisiones reabiertas por rehacer. Cada ítem trae empresa, proyecto, tipo, título, estado y versión.

**Preparar una revisión (super admin)**: `crearRevision` (borrador v1) → `editarBorradorRevision` → `publicarRevision`. Publicar pasa el sprint a "en revisión" o el hito 5 (diseño) a "esperando tu aprobación", y eso ya se ve en la línea de tiempo. Si el cliente pidió cambios: `nuevaVersionRevision` (copia la anterior como borrador), editar, `publicarRevision` otra vez. Para reabrir una aprobada: `reabrirRevision(c, id, motivo)`; el cliente ve el motivo en su historial.

**Atadura al avance** (lo que dejó anotado el sprint 2): aprobar un **sprint** lo marca `terminado` (con su fecha); aprobar el **diseño** termina el hito 5. Pedir cambios los devuelve a `en_curso`. Mientras exista una revisión sin aprobar, `editarHito`/`editarSprint` no pueden poner `terminado` a mano (`terminado_requiere_aprobacion`). Ver ambigüedad 2. El avance se recalcula solo (D-013).

**Documentos (`/cliente/documentos`)**:
```ts
c.from('documentos').select('*').eq('proyecto_id', id);               // ya viene filtrado por visibilidad
c.from('documento_versiones').select('*').eq('documento_id', did).order('version', { ascending: false });
```
Agrupe por `categoria` (contrato, propuesta, requerimientos, arquitectura, acta, manual, entregable, otro). Muestre "v{n}" y las versiones anteriores. Descarga: `enlaceDeDescarga(c, 'documento', version.id, 'documentos', version.storage_path, version.nombre_original)` → URL que vence en 10 minutos y baja como archivo adjunto; además anota la descarga en el registro. **Nunca** guarde ni comparta esa URL.

**Documentos del super admin**: subir = reservar + subir + crear (la ruta la genera el servidor):
```ts
const r = await reservarYSubir(c, 'documento', empresaId, archivo);
await crearDocumento(c, { p_empresa_id, p_proyecto_id, p_categoria: 'manual', p_titulo, p_descripcion: null,
  p_visibilidad: 'personas', p_miembros: [miembroId], p_reserva_id: r.data!.reserva_id });
// versión nueva de un documento que ya existe:
await confirmarVersionDocumento(c, { p_documento_id, p_reserva_id: r2.data!.reserva_id, p_nota: 'Se agregó el capítulo 3' });
// cambiar quién lo ve (lista de miembros solo con 'personas'):
await fijarVisibilidadDocumento(c, { p_documento_id, p_visibilidad: 'solo_admin' });
```
Para elegir personas, el super admin lee `miembros` de la empresa (activos: `quitado_en is null` y no bloqueados). Quién lo tiene hoy: `documento_permisos` con `revocado_en is null`.

**Archivos de la empresa (`/cliente/archivos`)**: lista con `c.from('archivos_cliente').select('*').order('creado_en', { ascending: false })` (muestra nombre, nota, `subido_por_nombre`, fecha, estado "nuevo" o "recibido"). Subir (solo admin o permiso `subir_archivos`; esconda el botón si no, pero la base decide):
```ts
const r = await reservarYSubir(c, 'archivo_cliente', empresaId, archivo);   // valida tipo y 50 MB antes de subir
await confirmarArchivoCliente(c, { p_reserva_id: r.data!.reserva_id, p_nota: nota, p_proyecto_id });
```
Borrar: `borrarArchivoCliente(c, id)` solo para quien lo subió y mientras esté "nuevo"; si responde `archivo_ya_recibido`, el archivo quedó fijo. Bandeja del super admin: `archivos_cliente` con `estado = 'nuevo'` (el aviso por correo llega en el sprint 6; hoy cada subida queda en `registro_actividad` como `archivo_cliente_subido`). `marcarArchivoRecibido(c, id)` lo deja fijo.

**Accesos (usuarios y claves de los sistemas entregados)**: el portal **no guarda claves**. Muestre solo la nota fija de cómo se entregan. Además, el campo "nota" de un archivo debe llevar el aviso "No escribas claves aquí".

**"Ver como el cliente"**: las lecturas muestran exactamente lo del cliente; todas las funciones de escritura responden `ver_como_solo_lectura`. Un "equipo" simulado no ve los documentos compartidos "por persona" (no es una persona real).

## 4. Funciones

| Acción (`acciones-revisiones-docs.ts`) | Quién | Devuelve |
|---|---|---|
| `reservarSubida`, `subirAReserva`, `reservarYSubir` | Según destino: `documento` super admin · `archivo_cliente` admin o `subir_archivos` · `captura` `aprobar` | `{ reserva_id, bucket, ruta, vence_en, tamano_maximo }` |
| `confirmarArchivoCliente` · `borrarArchivoCliente` · `marcarArchivoRecibido` | Cliente · quien lo subió · super admin | `{ archivo_id }` · `{ bucket, ruta }` · nada |
| `crearDocumento` · `confirmarVersionDocumento` · `fijarVisibilidadDocumento` | Super admin | `{ documento_id, version }` |
| `enlaceDeDescarga` · `enlaceDeCaptura` | Quien ve la fila | `{ data: { signedUrl } }` (10 min, como adjunto) |
| `crearRevision` · `editarBorradorRevision` · `publicarRevision` · `nuevaVersionRevision` · `reabrirRevision` · `bandejaRevisiones` | Super admin | `{ revision_id, version }` (crear, publicar, nueva versión) |
| `responderRevision` | Cliente con `aprobar` (miembro real) | `{ aprobacion_id, estado }` |

Las fechas viajan como texto ISO. Los enlaces de prueba y de video deben empezar por `https://`.

## 5. Errores nuevos

`error.message` trae el código; `errores-revisiones-docs.ts` los traduce.

| Código | Cuándo |
|---|---|
| `revision_no_encontrada` | No existe, es un borrador o **no es de su empresa** (mismo mensaje, no revela) |
| `sin_permiso_aprobar` | Miembro sin el permiso "aprobar" |
| `revision_no_pendiente` / `version_desactualizada` | Ya se respondió, o hay una versión más nueva: recargar |
| `cambios_requiere_comentario` | "Pido cambios" sin texto (mínimo 5 caracteres) |
| `revision_ya_existe` · `revision_sin_contenido` · `revision_ya_publicada` · `revision_ya_aprobada` · `revision_no_editable` · `revision_no_aprobada` · `sin_borrador` · `ya_hay_borrador` | Estado de la revisión no permite la acción |
| `terminado_requiere_aprobacion` | Se intentó terminar a mano un sprint o el hito 5 con una revisión sin aprobar |
| `sprint_no_revisable` · `sprint_ya_terminado` · `hito_ya_terminado` | No se puede publicar sobre ese sprint o hito |
| `enlace_invalido` · `acta_invalida` | Enlace sin https, o acta que no es un documento "acta" de la empresa |
| `documento_no_encontrado` · `archivo_no_encontrado` · `miembro_invalido` | No existe / no es suyo / persona no activa de esa empresa |
| `archivo_ya_recibido` | El cliente intenta borrar algo ya recibido |
| `reserva_invalida` · `reserva_vencida` · `archivo_no_subido` | Subida inválida, usada, vencida (30 min) o sin archivo en Storage |
| `archivo_demasiado_grande` · `tipo_no_permitido` · `demasiadas_subidas` | Más de 50 MB (10 MB capturas), tipo fuera de la lista, más de 60 reservas por hora |

Siguen valiendo `no_autorizado`, `ver_como_solo_lectura`, `proyecto_no_encontrado`, `proyecto_cerrado`, `sprint_no_encontrado`, `empresa_no_disponible`, `datos_invalidos`. Para el rastro de intentos rechazados use `anotarRechazo` (sprint 2) como siempre.

## 6. Ambigüedades y la lectura que tomé

1. **Una revisión por entregable, con versiones.** Un diseño por proyecto y una revisión por sprint; las rondas nuevas son versiones, no revisiones nuevas. El tipo `documento` revisa un documento ya publicado y no toca el avance.
2. **"Terminado" atado a la aprobación (ya encendido).** El interruptor `exigir_aprobacion_para_terminar` viene **encendido**: el hito 5 (diseño) y los sprints solo se terminan cuando el cliente aprueba su revisión. `editar_sprint` y `editar_hito` no pueden deshacer una aprobación (error `reabrir_requiere_revision`); solo `reabrir_revision` (con motivo, queda en el historial). Los tests de sprint 2 que terminaban a mano usan ahora `tests.permitir_terminar()`.
2b. **2FA del admin del cliente (D-014) ya encendido**: `seguridad.exigir_2fa_admin_cliente = true`.
3. **Hito del diseño = hito 5** ("Diseño y prototipo"). Sprints = hito 6 (derivado, ya existente).
4. **Quién aprueba.** Quien tenga `aprobar` (el admin lo tiene siempre). El super admin no aprueba en nombre del cliente; si el dueño es además miembro de su propia empresa (D-006) aprueba como miembro, fuera de "ver como".
5. **"Esperando a Websourcing"** en la bandeja = borradores por publicar + reabiertas. Añadí una cuarta lista, "esperando al cliente" (publicadas), por si la pantalla la quiere.
6. **Visibilidad.** No existe una columna "ver documentos" en `miembros` (son cuatro permisos). Por eso "ver cada documento" se resuelve por documento: `todo_el_equipo` lo ve cualquier miembro activo; `solo_admin`, solo el admin; `personas`, el admin y los elegidos.
7. **Archivos de la empresa**: todos los miembros activos los ven; suben el admin y quien tenga `subir_archivos`. Borrar es **borrado suave** (queda el rastro para Websourcing) y el objeto de Storage se quita con la sesión del usuario.
8. **Capturas de "pido cambios"** van en un bucket propio (`capturas-revisiones`, imágenes, 10 MB).
9. **Tipos permitidos**: imágenes (PNG, JPG, GIF, WEBP), PDF, video (MP4, MOV, WEBM), audio, Office moderno (docx, xlsx, pptx, sin macros), CSV, TXT y ZIP. **Lecturas aceptadas por el dueño: tipo `documento` (1), cuatro listas en la bandeja (5) y sin formatos Office antiguos. Quedaron fuera SVG** (puede llevar scripts) **y .doc/.xls/.ppt antiguos** (admiten macros). Si el dueño quiere SVG o formatos viejos, se decide aparte.
10. **Quitar un sprint con revisión**: `quitar_sprint` (sprint 2) falla con un error de llave (23503) si el sprint ya tiene revisión. La pantalla debe esconder "quitar" cuando hay revisión; no cambié la función del sprint 2.

## 7. Lo que falta o no se probó

- **Storage real**: se probó con un `storage` simulado en PostgreSQL local (`supabase/tests/local/mock_supabase.sql`). Falta confirmar con Supabase real (a) que `metadata.size` y `metadata.mimetype` llegan como supuse, (b) que el flujo de subida con la regla de INSERT funciona con la librería (la regla de lectura incluye la reserva abierta justamente por si Storage relee la fila al insertar) y (c) que los buckets se crean con sus topes.
- **Contenido real del archivo**: la base confía en el tipo que mide Storage (viene del encabezado de la subida). La revisión por "bytes mágicos" y el antivirus no están hechos: recomiendo un paso del servidor antes de `confirmar_*` (leer los primeros bytes) o un escáner en el sprint 6.
- **Avisos por correo** (nueva revisión, aprobación, archivo subido): sprint 6. Hoy todo queda en `registro_actividad` e `historial_proyecto`.
- **Copia diaria a Hostinger (D-015)**: diseño y script, sin ejecutar (`docs/2026-11-20_diseno_copia-archivos-hostinger_v1.md`, `scripts/copia-archivos-hostinger.sh`).
- **Archivos huérfanos** (reservados y nunca confirmados): consulta de limpieza en el diseño de la copia; la tarea programada es de Operaciones.
- Rendimiento con volumen: las políticas usan subconsultas sin correlación; no se midió con miles de filas.
