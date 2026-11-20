# Informe de pruebas · Sprint 3 (parte del servidor) · Revisiones y aprobaciones, Documentos y Archivos de la empresa

**Equipo Websourcing · Calidad** · Fecha: 2026-11-20 · Rama: `s3-revisiones-docs` · Commit revisado: `b00c835` (migraciones `20261211000100` a `000600`, pruebas 20 a 25).
Alcance: solo el servidor (base de datos, Storage, funciones, script de copia y la nota para Frontend). No se tocaron ni se revisaron las pantallas del Frontend, salvo una línea que pide el hallazgo A-1. No se arregló ningún código.

## Veredicto: devuelto con condiciones

La base de datos es sólida: las cerraduras por empresa, los permisos por rol, la evidencia de la aprobación y la regla de Storage resisten lo que se les probó. Pero **no se aprueba el sprint para la demo** hasta cerrar dos puntos altos:

1. **A-1.** La pantalla de detalle de una revisión pide `select('*')` sobre `aprobaciones` y la base la rechaza. En el sistema real falla siempre. Las pruebas con el servidor simulado no lo ven.
2. **A-2.** El candado "terminado requiere aprobación" está apagado: el super admin puede dar por terminado el diseño o un sprint sin que el cliente apruebe. Contradice los requerimientos. Es decisión del dueño.

Analogía: la caja fuerte y las cerraduras funcionan, pero la puerta principal que usa el cliente tiene la llave equivocada (A-1) y el portero del taller puede firmar "recibido" por el cliente si nadie le pide el comprobante (A-2).

## Pruebas realizadas

| Prueba | Resultado |
|---|---|
| `npm run test:db` (sin `npm ci`: `node_modules` ya estaba) | **24 archivos, 1120 pruebas, todas pasan.** Las migraciones bajan (rollback) y suben sin errores; después del rollback `public` y `private` quedan vacíos |
| Daños a propósito en copias (7 mutaciones, ver abajo) | 4 detectadas, 1 equivalente, **2 no detectadas** (B-1) |
| Consultas directas al catálogo | Ver "Lo que se verificó bien" |
| Sondas SQL con los ayudantes de las pruebas (roles reales `anon` y `authenticated`) | Ver evidencia de cada hallazgo |
| Lectura línea por línea de las 6 migraciones, el script, el diseño de copia, la nota y la matriz | Hecha |
| Script de copia | `bash -n` pasa. **No se ejecutó**: no hay `rclone` instalado ni VPS ni claves S3 (los hallazgos del script salen de leer el código y la documentación de rclone) |

### Daños a propósito (y restauración)

Se hicieron en copias del repositorio en una carpeta temporal; el árbol de trabajo no se modificó (`git status` solo muestra los archivos del Frontend). Las copias se borraron al terminar.

| # | Daño | ¿Lo detectaron las pruebas? |
|---|---|---|
| M1 | Dar al cliente `SELECT` sobre `ip` y `user_agent` de `aprobaciones` (`000300_rls.sql:189`) | **Sí.** Fallan 21 (2 pruebas) y 25 (1) |
| M2 | Apagar el candado (`r.estado <> 'aprobada'` por algo falso, `000200_logica.sql:107,110`) | **Sí.** Fallan 20 (pruebas 15 y 23) |
| M3 | Quitar `revocado_en is null` en `documentos_leer` (`000300_rls.sql:220`): la revocación deja de valer | **Sí.** Falla 22 (prueba 58, "ya no ve el contrato") |
| M6 | Quitar el trigger `archivos_cliente_empresa_fija` (empresa_id inmutable) | **Sí.** Fallan 01, 23 y 25 |
| M4 | Quitar `a.estado = 'nuevo'` de `puede_borrar_objeto` (`000600_storage.sql:32`) | No falla, pero es **equivalente**: el `check archivos_cliente_borrar_solo_nuevo` (`000100_tablas.sql:165`) ya impide un borrado suave en un archivo recibido. Defensa doble, no hueco |
| M5 | Quitar `r.user_id = auth.uid()` de la regla de **subir** (`000600_storage.sql:61`) | **No.** Ver B-1 |
| M7 | Quitar `r.user_id = auth.uid()` de la regla de **leer por reserva abierta** (`000600_storage.sql:51`) | **No.** Ver B-1 |

## Hallazgos

Gravedad: Alta = bloquea el sprint o contradice un requerimiento. Media = corregir antes de producción. Baja = mejora o decisión menor.

### Alta

**A-1 · `select('*')` sobre `aprobaciones` da error 42501 para todos (cliente y super admin).**
- Causa: el permiso por columna (`000300_rls.sql:189`) deja fuera `user_id`, `ip` y `user_agent`. En PostgreSQL, `SELECT *` sobre una tabla con permisos parciales falla entero.
- Evidencia: sonda con rol `authenticated` (admin A): `select * from public.aprobaciones` → `ERROR 42501 permission denied for table aprobaciones`. Con el super admin pasa igual. `select ip` también falla, como debe.
- Dónde se pide mal: `docs/2026-11-20_nota_backend-para-frontend_revisiones-docs_v1.md:27` (la nota, que es del Backend) y `components/portal/revisiones/datos.ts:23` (Frontend, solo leído). Con el servidor simulado del Frontend (`tests/mock-supabase`) no se nota.
- Efecto: el detalle de una revisión lanza `lectura_fallida`, o sea el Módulo 3 no se puede usar con la base real.
- Qué hace falta: pedir las columnas por nombre (`id, empresa_id, revision_id, version, decision, comentario, captura_path, miembro_id, persona, creado_en`) y corregir la nota. El Backend corrige la nota y avisa al Frontend; yo no toqué nada.
- Prueba que falta: una prueba que haga `select *` y confirme el error, o que el contrato de la nota use solo columnas permitidas.

**A-2 · El candado "terminado requiere aprobación" está apagado, y aun encendido tiene huecos.**
- Lo que dicen los requerimientos: la aprobación del cliente es lo que hace avanzar el hito (Módulo 3: "Dado que apruebo… el hito avanza"; sección 2: el admin del cliente "aprueba sprints y diseños"; punto de control 4: QA, dueño y luego cliente). El sprint 2 dejó escrito: "en el sprint 3 se atará `terminado` de diseño y de sprint a la aprobación" (`docs/2026-11-27_nota_backend-para-frontend_sprint2_v1.md:124`).
- Lo que hay: interruptor `configuracion('revisiones').exigir_aprobacion_para_terminar = false` (`000200_logica.sql:158-162`). Con el interruptor apagado el candado solo actúa si **ya existe** una revisión sin aprobar (`000200_logica.sql:105-110`).
- Evidencia (sondas con super admin con 2FA):
  - C1: `editar_hito` del hito 5 a `terminado` sin ninguna revisión → **pasa**.
  - C2: `editar_sprint` a `terminado` sin revisión → **pasa**.
  - C2b: los hitos 3 (requerimientos aprobados) y 8 (pruebas del cliente) a `terminado` → **pasan**.
  - C3 y C4: con una revisión en borrador o publicada, sí se bloquea (`terminado_requiere_aprobacion`). Eso funciona.
  - C6 y C7: con el interruptor **encendido** se bloquean el sprint y el hito 5.
- Huecos aun con el candado encendido:
  - **Deshacer una aprobación sin reabrir (Media):** C5: con la revisión `aprobada` y el sprint `terminado`, `editar_sprint(estado => 'en_curso')` **pasa**. El sprint vuelve a "en curso" y la revisión sigue "aprobada", sin motivo y sin el evento `revision_reabierta` en el historial del cliente. El requerimiento dice: "solo el super admin puede reabrir una revisión, y queda en el historial". Lo mismo con `editar_hito` en el hito 5. El candado solo mira la subida a `terminado`, no la bajada.
  - **Otros hitos con aprobación del cliente (decisión del dueño):** C8: los hitos 3 y 8 se terminan a mano. Los requerimientos solo piden aprobación atada para "sprint o diseño", así que no es un incumplimiento, pero el estado "esperando tu aprobación" existe en los 13 hitos (sección 5.4).
  - **Efecto lateral del candado apagado:** si el hito 5 ya se terminó a mano, `publicar_revision` responde `hito_ya_terminado` y ese diseño nunca llega a revisión del cliente.
- Qué hace falta: decisión del dueño. Recomendación: encender el interruptor antes de cualquier cliente externo. Si el dueño quiere dejarlo apagado para Websourcing como cliente de sí misma (D-006), que quede escrito en `memoria-del-proyecto/decisiones.md` y como condición de salida a producción. Aparte, cerrar la bajada de estado (que `editar_sprint` y `editar_hito` no puedan sacar de `terminado` algo que tiene una revisión aprobada; debe pasar por `reabrir_revision`).

### Media

**M-1 · La copia diaria no cumple "30 días": la retención borra por fecha de modificación del archivo, no por la fecha en que se movió al histórico.**
- Evidencia: `scripts/copia-archivos-hostinger.sh:79` `rclone delete "CIFRADO:historico" --min-age "${RETENCION_DIAS}d"`. En rclone, `--min-age` mira la fecha de modificación del objeto, y mover a `--backup-dir` (línea 67) la conserva. Un archivo que el cliente subió hace 40 días y borra hoy llega a `historico/hoy/…` con 40 días de edad y **el mismo script lo borra en la misma corrida** (la limpieza va justo después del `sync`).
- Efecto: lo que el diseño promete (`docs/2026-11-20_diseno_copia-archivos-hostinger_v1.md` §3, punto 4: "un archivo que el cliente borró… sigue disponible 30 días") solo se cumple para archivos de menos de 30 días.
- Límite de esta revisión: razonado desde la documentación de rclone; no se pudo ejecutar.
- Qué hace falta: retener por el nombre de la carpeta `historico/AAAA-MM-DD` (borrar carpetas completas más viejas que el plazo), no por la edad del archivo. Probarlo con un archivo viejo antes de activar la tarea.

**M-2 · El `sync` no tiene freno si el origen aparece vacío o sin permiso.**
- Evidencia: `scripts/copia-archivos-hostinger.sh:66-69` (sin `--max-delete` ni conteo mínimo) y `:72` (`rclone check … --one-way`: si el origen está vacío no falta nada, así que pasa).
- Efecto: una clave sin permiso, un endpoint mal escrito o un bucket renombrado hacen que todo el espejo se mueva a `historico/hoy` y la verificación diga "bien". Con M-1, a los 30 días se pierde. No se borra nada de inmediato (bien, gracias a `--backup-dir`), pero tampoco avisa.
- Qué hace falta: un freno (`--max-delete`, o comparar el conteo antes y después y fallar si cae más de un porcentaje) y que el aviso de éxito (`AVISO_URL`) solo salga si pasa.

**M-3 · Las claves S3 de Supabase no son de solo lectura.**
- Evidencia: el script (`:15`) y el diseño (§3 punto 1 y §8) dicen "solo lectura si el plan lo permite". Según lo que se conoce de Supabase Storage (por confirmar con el panel real), las claves S3 dan acceso total a todos los buckets y se saltan las reglas RLS.
- Efecto: quien entre al VPS puede leer, pisar y borrar los archivos de todos los clientes en producción. Es la misma gravedad que la llave de sistema (`service_role`), que el proyecto prohíbe usar en el portal.
- Qué hace falta: confirmar en Supabase y, si no hay solo lectura, tratarlas como llave de sistema: usuario sin shell interactivo, rotación, nunca en el repositorio, y anotarlo como riesgo conocido en la arquitectura. Las claves por URL de aviso (`AVISO_URL`, `:85`) también viajan en la línea de comandos de `curl` y se ven en `ps`.

**M-4 · `private.registrar_descarga` está abierta a `authenticated` y permite escribir en el registro de cualquier empresa.**
- Evidencia: `000500_rpc.sql:483-493` (función DEFINER) y `:537` (`grant execute … to authenticated`). Sonda P1: el admin A ejecutó `select private.registrar_descarga('documento', gen_random_uuid(), <empresa B>, gen_random_uuid())` y quedó **1 fila `descarga` en la empresa B con el admin A de autor**. En cambio `private.registrar` directa da `42501` (`000300_funciones_auxiliares.sql:127-133`, solo la llaman triggers).
- Alcance: la API solo expone `public` (`supabase/config.toml:12`), así que desde el navegador no se llega; hace falta acceso SQL. Es defensa en profundidad, pero rompe la regla del sprint 1 ("el registro solo lo escriben los triggers") y la evidencia del registro es parte de la promesa.
- Qué hace falta: que `anotar_descarga` sea DEFINER (revisando antes con el mismo criterio de visibilidad), o que `registrar_descarga` compruebe que la fila existe y que quien llama la puede ver.

**M-5 · Los avisos y el modo real de Storage siguen sin probarse (condición de salida).**
- Storage real: todo se probó con un `storage.objects` simulado (`supabase/tests/local/mock_supabase.sql`). La nota (§7) reconoce tres supuestos sin confirmar: que `metadata.size` y `metadata.mimetype` llegan como se espera, que la subida con la regla de INSERT funciona con la librería y que los buckets se crean con sus topes. La regla de leer por reserva abierta (`000600_storage.sql:47-52`) existe justo por ese miedo. Mientras no se pruebe con Supabase real, el flujo de subir, confirmar y descargar es una hipótesis.
- Correos: "avisar por correo a quienes pueden aprobar" (Módulo 3) y "el super admin recibe un aviso" al subir un archivo (Módulo 6) hoy solo dejan un asiento en `registro_actividad`. Está planeado para el sprint 6 (`docs/2026-11-20_plan_sprints_v2.md:16`), pero los criterios de aceptación de esos módulos no se cumplen todavía.

**M-6 · Heredado del sprint 1: el 2FA del admin del cliente está apagado de origen.**
- Evidencia: `20261123000500_registro_actividad_triggers.sql:144` crea `seguridad` con `exigir_2fa_admin_cliente: false`. Sonda E5: el admin A con sesión sin 2FA (`aal1`) lee las revisiones. Con el interruptor apagado también puede **aprobar** (acción que no se deshace).
- D-014 dice que es obligatorio. Ya está en la lista de salida del sprint 1; lo repito porque una aprobación es la acción más pesada de este sprint. Encender antes de dar acceso a un cliente externo.

### Baja

**B-1 · Dos reglas de Storage no tienen prueba que las proteja (M5 y M7).** La prueba "otra persona no usa la reserva de admin A" (`24_storage_por_empresa.test.sql`, sección Subir) pasa por una razón distinta: el equipo A no tiene el permiso "subir archivos". Con otro miembro que sí lo tenga, la comprobación de `user_id` es la única que impide usar una reserva ajena. Lo mismo para leer un objeto con reserva abierta de otra persona (`000600_storage.sql:51`). El riesgo real es mínimo (la ruta lleva un UUID aleatorio y la reserva dura 30 minutos), pero el criterio es "que las pruebas detecten el daño". Falta una prueba con dos miembros con permiso.

**B-2 · Desvíos de las lecturas de la nota (sección 6) frente a los requerimientos.** Ver el cuadro de abajo. Los principales: la bandeja trae cuatro listas y los requerimientos piden tres; la lista "esperando a Websourcing" mezcla borradores con reabiertas; el tipo de revisión `documento` no aparece en los requerimientos; los formatos viejos de Office quedan fuera.

**B-3 · Tipos de archivo según el navegador.** El tipo se toma de `archivo.type` (`lib/portal/acciones-revisiones-docs.ts:37,40`). En Windows, un `.csv` suele llegar como `application/vnd.ms-excel`, y `.m4a` o `.mp3` a veces con otro nombre de tipo; la lista (`000200_logica.sql:7-19`) los rechaza con `tipo_no_permitido`. No es un hueco de seguridad (el rechazo es seguro) pero un cliente real lo sufrirá. Probar con archivos reales desde Windows y decidir si se aceptan por extensión más tipo.

**B-4 · El registro de descargas es opcional y se puede saturar.** `anotar_descarga` la llama la aplicación; quien pida el enlace firmado directo a Storage con su sesión no deja asiento. Además, pasando de 60 descargas por minuto el registro deja de anotar en silencio (`000500_rpc.sql:487-490`). Aceptable para evitar inundar el registro, pero la arquitectura (sección 7) lo presenta como rastro completo. Decirlo así en la documentación.

**B-5 · Llaves compuestas que no atan todo.** `revisiones_sprint_fk` (`000100_tablas.sql:28`) ata el sprint a la empresa pero no al proyecto: una revisión del proyecto X podría apuntar a un sprint del proyecto Y de la misma empresa por SQL directo (la función `crear_revision` sí lo comprueba, `000500_rpc.sql:277`). Igual `aprobaciones.user_id` no está atado al `miembro_id` y el acta (`revision_versiones.acta_documento_id`) solo se valida como "acta" en la función. No se pudo probar la inserción cruzada porque el entorno de pruebas solo trae un proyecto por empresa; es lectura del esquema.

**B-6 · Detalles de borde.**
- `quitar_sprint` con una revisión responde un error crudo `23503` (la nota §6.10 lo reconoce; la pantalla debe esconder el botón).
- `responder_revision` no mira si el proyecto está cerrado o cancelado (el resto de funciones del super admin sí usan `proyecto_para_cambio`).
- Una revisión tipo `documento` sobre un documento `solo_admin` muestra su título y resumen a todo el equipo aunque el documento no (`000300_rls.sql:195-197`).
- Archivos reservados y nunca confirmados quedan huérfanos en Storage; no hay tarea de limpieza (solo la consulta del diseño §7). Tampoco hay tope total de espacio por empresa ni revisión de contenido (antivirus, bytes mágicos); la nota (§7) lo reconoce.
- `private.agente_cliente()` y la IP dependen de `proxies_de_confianza = 1` (`configuracion('red')`). Hay que confirmar con el Supabase real cuántos saltos hay antes de dar valor legal a la IP guardada (D-004).

## Lo que se verificó bien

- **Cerraduras por empresa y rol.** Las 8 tablas tienen RLS, una política de lectura cada una y **ninguna** de escritura; `authenticated` solo tiene `SELECT` (consulta a `information_schema.role_table_grants`) y `anon` nada. Como no hay políticas de INSERT/UPDATE, no existe un `WITH CHECK` que revisar en tablas; la única regla con `WITH CHECK` es la de subir a Storage (`revdocs_subir`, `000600_storage.sql:168-178`) y está bien escrita. Probado en las pruebas 21, 22, 23 y 24 con visitante, equipo sin permiso, admin de otra empresa, quitado, bloqueado, perfil bloqueado, empresa pausada y super admin sin 2FA.
- **`empresa_id` inmutable y llaves compuestas.** Triggers en las 8 tablas (`000100_tablas.sql:199-207`), más campos fijos (`:210-221`). Las llaves hijo-padre llevan `empresa_id`, probado con inserciones cruzadas A/B (`23503`) en la prueba 21.
- **Funciones.** Consulta al catálogo: **todas** las funciones de `public` y `private` tienen `search_path` vacío. `anon` solo ejecuta `mi_contexto()` y `politica_vigente()`. Las 15 funciones públicas del sprint 3 están concedidas solo a `authenticated` (el super admin se comprueba dentro con `es_super_admin()`, que exige `aal2`). Excepción: M-4.
- **Trigger `ver_como_solo_lectura`.** Está en las 8 tablas (consulta a `pg_trigger`) y las funciones de escritura responden `ver_como_solo_lectura` (prueba 21). Sonda V3: `marcar_archivo_recibido` en "ver como" da `42501`.
- **Evidencia de la aprobación.** Sondas E1 a E4: el cliente no lee `ip`, `user_id`, `user_agent` ni con `select *`; tampoco lee `registro_actividad`. El super admin ve IP y navegador en `registro_actividad` (se guardó `203.0.113.7` y `NavegadorX/2` con la cabecera simulada `9.9.9.9, 203.0.113.7`: toma el último salto de confianza, no el primero que puede falsear el cliente). Ni el super admin lee `ip` de la tabla.
- **Aprobación irreversible y sin suplantación.** `aprobaciones` no tiene `UPDATE`, `DELETE` ni `TRUNCATE` para nadie (triggers `solo_agregar`, `000100_tablas.sql:224-225`); una respuesta por versión (`unique`). Sonda E3: el super admin que no es miembro recibe `no_autorizado` al responder; E4: responder dos veces da `revision_no_pendiente`. Solo `reabrir_revision` (con motivo ≥ 5, `000500_rpc.sql:378-396`) la reabre y queda en el historial. Matiz: A-2 muestra una segunda vía (editar el avance a mano).
- **Visibilidad por persona y revocación.** `documentos_leer` y `documento_permisos_leer` (`000300_rls.sql:213-233`) y la regla de Storage reutilizan la misma regla (la subconsulta corre con el rol de la persona). Revocar es marcar `revocado_en`; el mutante M3 lo confirmó. Miembro quitado, bloqueado o empresa pausada no lee nada.
- **Storage.** Tres buckets privados con tope (50, 50 y 10 MB) y tipos (`000600_storage.sql:131-137`). La ruta la genera el servidor con UUID y extensión según el tipo, nunca la persona (`000500_rpc.sql:111,126`); el nombre original se limpia de separadores y caracteres de control. Subir exige reserva a nombre de la persona, vigente, sin usar y con el permiso del destino releído en cada subida. **No existe regla de `UPDATE`** (nadie pisa un archivo; consulta a `pg_policies`: 0). Leer exige poder ver la fila dueña; probado que otra empresa no lee ni conociendo la ruta exacta. Borrar solo lo hace quien subió el archivo, tras borrarlo en el portal y mientras esté `nuevo`. La confirmación vuelve a medir tamaño y tipo en Storage (`confirmar_reserva`, `000500_rpc.sql:30-66`), no los que declara la pantalla.
- **Evidencia de que no hay claves** en el commit: búsqueda de patrones de llaves y contraseñas en el diff (`afb73e0..HEAD`) sin coincidencias; el script solo lee variables de entorno.
- **Script de copia (lo que está bien).** Sin secretos en el archivo; `set -Eeuo pipefail`, `umask 077`, variables obligatorias con `:?`; configuración de rclone solo por variables de entorno; cifrado `crypt` en el destino; `flock` evita dos corridas; el origen nunca se modifica (la dirección es siempre Supabase hacia el VPS; la restauración usa `copy`, que no borra); el `sync` usa `--backup-dir`, así que nada se borra de inmediato; `find … -delete` solo toca `copia-*.log` dentro de `DESTINO_COPIAS`. No usa `rm -rf`, `eval`, ni `sudo`.

## Las lecturas de la nota (sección 6) frente a los requerimientos

| # | Lectura | ¿Contradice los requerimientos? |
|---|---|---|
| 1 | Una revisión por entregable, con versiones; tipo extra `documento` | **No contradice, pero excede.** "Qué versión" aprobó queda bien cubierto. El tipo `documento` no está en el Módulo 3 ("sprint o diseño"): pedir al dueño que lo confirme o tratarlo como solicitud de cambio (`plantillas/solicitud-de-cambio.md`). Es de bajo costo |
| 2 | "Terminado" atado a la aprobación, **candado apagado** | **Sí, contradice** (ver A-2). El sprint 2 prometió atarlo; el comportamiento por defecto no lo ata |
| 3 | Diseño = hito 5; sprints = hito 6 | **No.** Coincide con la tabla 5.1 y con D-013 |
| 4 | Quién aprueba: quien tenga `aprobar`; el super admin no aprueba por el cliente (salvo como miembro real fuera de "ver como") | **No.** Coincide con el rol "Aprobar en nombre del cliente" de los requerimientos y con la sección 5.2. Probado (E3, prueba 21). El caso del dueño como miembro (D-006) es coherente con la cabecera de los requerimientos |
| 5 | "Esperando a Websourcing" = borradores + reabiertas; cuarta lista "esperando al cliente" | **Se aparta en parte.** Los requerimientos piden tres listas (aprobado, cambios pedidos, "espera mi revisión"). Un borrador no lo ha visto el cliente, así que no es algo que "espere mi revisión" en el sentido de la respuesta del cliente. La lista extra no estorba. Pedir al dueño que confirme qué significa "espera mi revisión" |
| 9 | Tipos permitidos sin SVG ni `.doc/.xls/.ppt` | **Parcial.** Los requerimientos dicen "documentos de Office, hojas de cálculo". Excluir lo viejo es una decisión de seguridad razonable pero debe aprobarla el dueño. `text/plain` sí se acepta y no está en la lista (inofensivo) |

## Qué sigue sin probarse (por entorno)

- Storage real de Supabase (M-5), correos (sprint 6) y los saltos de proxy para la IP.
- El script de copia: no corrió ni una vez; la restauración tampoco (hay que ensayarla, incluida la parte de M-1).
- Rendimiento con miles de filas: las políticas usan subconsultas sin correlación, pero no se midió.
- Contenido real de los archivos (antivirus, bytes mágicos).

## Condiciones para cerrar el sprint y para producción

Para cerrar el sprint (devuelve al Backend):
1. A-1: corregir la nota y avisar al Frontend para que pida las columnas por nombre; añadir una prueba.
2. A-2: decisión del dueño por escrito sobre el interruptor; cerrar la bajada de estado.
3. M-4: cerrar `registrar_descarga`.
4. B-1: dos pruebas nuevas con dos miembros con permiso.

Para la salida a producción (se agrega a `listas-de-chequeo/salida-a-produccion.md`):
- Probar el flujo de subir, confirmar y descargar contra Supabase real, con los tres buckets.
- Corregir y ensayar el script de copia (M-1, M-2, M-3) con un archivo viejo y una restauración completa.
- Encender el 2FA del admin del cliente (M-6) y confirmar los saltos de proxy.
- Revisión de seguridad completa con Opus (la de este informe es la de sprint, con Sonnet).

**Equipo Websourcing · Calidad**
