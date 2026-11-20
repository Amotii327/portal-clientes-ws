# Informe de pruebas · Módulo 4 (Dinero) · Backend

**Equipo Websourcing · Calidad** · v1 · 2026-11-20 · Uso interno.

Rama `s4-dinero`, commit `47f1b12`. Migraciones `20261218000100` a `000500`, pruebas `30` a `36`. Motor: Sonnet (revisión de sprint). Esto **no** es la revisión de seguridad final con Opus.

## Veredicto

**APROBADO CON OBSERVACIONES.** No hay hallazgos críticos ni altos. Se puede pasar a demo (punto de control 4) una vez que Desarrollo corrija o acepte por escrito los dos medios (M-1 y M-2) y se pruebe Storage en Supabase real (M-3). Nada de esto frena la integración con el frontend.

Analogía: la caja fuerte está bien construida y cerrada. Falta probar la cerradura de la puerta del cuarto de archivos (Storage), que en la base local no existe, y poner un candado extra a un cajón (el bloqueo de contrato) que hoy ninguna prueba vigila.

## Resultado de las pruebas

- `npm run test:db`: **PASS**. 25 archivos, 1120 pruebas (las 30 a 36 incluidas). La reversibilidad de las migraciones (bajar y volver a subir) también pasó. No hizo falta `npm ci` (`node_modules` ya estaba).
- Pruebas rotas a propósito, en copias en `/tmp/qa-mut/` (la rama real no se tocó; `git status` de la rama solo muestra la carpeta del frontend `components/portal/dinero/`):

| # | Regla rota | Resultado |
|---|---|---|
| M1 | Quitar el filtro de super admin de `v_ingresos_por_mes` (`20261218000200:206`) | **Detectada**: fallan 3 pruebas (25 en 31, 54 en 35, 21 en 36) |
| M2 | Quitar `mi_ver_dinero()` de la política `contratos_leer` (`...0300:24-26`) | **Detectada**: fallan 4 pruebas (44, 45, 63 en 31; 35 en 36) |
| M3 | Quitar el `for update` de `contrato_para_cambio` (`...0400:22`) | **NO detectada**: todo pasa (ver M-1) |
| M4 | Quitar `comprobantes_pago` de los triggers `ver_como_solo_lectura` (`...0300:46`) | **Detectada**: falla la 16 de 30 y la 23 de 36 |
| M5 | Desactivar el tope `abono_excede_saldo` (`...0200:67`) | **Detectada**: fallan 4 a 7 pruebas (saldo, anulación, confirmar) |

Después se descartaron las copias; el repositorio quedó igual.

## Hallazgos

### M-1 · MEDIO · El bloqueo contra dos confirmaciones a la vez no tiene prueba
Evidencia: mutación M3 pasa 1120/1120. La nota de Desarrollo lo admite (`docs/2026-11-20_nota_backend-para-frontend_dinero_v1.md`, sección 11).

Análisis de bloqueos (leído, no ejecutado con dos sesiones):
- Todas las funciones que escriben bloquean **primero la fila del contrato** (`private.contrato_para_cambio`, `...0400:17-25`) y después las hijas. El orden es único, así que no veo interbloqueo posible.
- Dos `confirmar_comprobante` sobre el mismo contrato: la segunda espera en el contrato; al soltarse, Postgres (READ COMMITTED) relee el contrato y la suma de abonos ya incluye el abono de la primera. Si pasa del saldo, `abono_excede_saldo` la deshace (trigger `...0200:56-85`).
- El mismo comprobante confirmado dos veces: la segunda ve `estado <> 'en_revision'` y responde `comprobante_ya_revisado` (`...0400:332-333`). Hay además un índice único de un solo comprobante en revisión por cuota (`...0100`, `comprobantes_uno_en_revision`).
- Hay **doble candado**: aunque se quite el del RPC (M3), el trigger del abono vuelve a bloquear el contrato (`...0200:64`). Por eso M3 no rompe nada hoy, pero justamente por eso nadie notaría que un cambio futuro quitó el candado.
- Sin `lock_timeout`: una sesión lenta hace esperar a las demás. Aceptable en este volumen.

Qué falta: una prueba con dos conexiones simultáneas (por ejemplo dos `psql` en paralelo en `scripts/test-db.sh`) que confirme dos comprobantes que juntos pasan el saldo y verifique que uno solo gana.

### M-2 · MEDIO · Tipo y tamaño del comprobante los declara el cliente; el bucket no los limita
Evidencia: `subir_comprobante` toma `p_archivo_tipo` y `p_tamano_bytes` tal cual (`...0400:297-305`); la tabla solo comprueba que el número declarado sea ≤ 10 MB (`...0100`, columna `tamano_bytes`). El bucket se crea con límite de 20 MB y **sin `allowed_mime_types`** (`...0300:205-207`).
Riesgo: un miembro con `ver_dinero` y `subir_archivos` puede subir a Storage un archivo de hasta 20 MB de cualquier tipo con nombre `.pdf` y declarar "100 bytes, PDF". El super admin lo abriría con un enlace firmado. Mitiga que el enlace descarga como adjunto y que solo llega a quien tiene ese permiso en su propia empresa.
Qué hacer: poner `allowed_mime_types` (pdf, png, jpeg, webp) en el bucket y, si se puede, validar tamaño real con el servidor al subir. Que la ficha del servidor (frontend) verifique el tamaño antes de subir.

### M-3 · MEDIO (riesgo por no probar) · Las políticas de Storage no se ejecutaron
Evidencia: `...0300:203-212` solo se crean si existe `storage.objects`; la base local no lo tiene. Lo probado son las funciones `puede_leer_archivo_dinero` y `puede_subir_archivo_dinero` (bien razonadas: leen la tabla dueña, exigen misma empresa, `ver_dinero`, `subir_archivos`, y bloquean en "ver como"; no hay políticas de UPDATE ni DELETE).
Pendiente en Supabase real:
1. Subir con cada rol: admin A, equipo A con y sin `subir_archivos`, equipo A sin `ver_dinero`, admin B, super admin con y sin 2FA, y en "ver como".
2. Leer un archivo ajeno con enlace firmado: debe fallar.
3. Verificar que la subida simple funciona con solo la política INSERT: la lectura exige que el archivo ya esté en una tabla, y un archivo recién subido aún no lo está. Si la API de Storage hace `INSERT ... RETURNING`, podría pedir también SELECT y fallar. No lo sé; hay que verlo.
4. `insert ... on conflict (id) do nothing` en `storage.buckets` (`...0300:206-207`): si el bucket `dinero` ya existiera como público, no se corrige. Revisar en el ambiente.

### B-1 · BAJO · El aviso de "comprobante confirmado" dice el valor declarado, no el confirmado
Evidencia: `...0300:146` usa `new.valor_declarado`; el super admin puede corregir el valor en `confirmar_comprobante` (`...0400:339`). El correo futuro al cliente podría decir un monto distinto al abono real. Usar el valor del abono (`abono_id`).

### B-2 · BAJO · Recordatorios: dos diferencias con el requerimiento
Evidencia: `generar_recordatorios_pago` (`...0400:367-403`).
- Salta las cuotas con comprobante en revisión (`...0400:382`). El requisito dice "3 días antes y el día que vence" sin excepción (lectura 6).
- Agrega un aviso de "vencido" que no se pidió (inofensivo; es una sugerencia del requisito del panel).
- El "3 días antes" real es "al primer corrido dentro de la ventana de 3 días". Con corrida diaria coincide.

### B-3 · BAJO · `hito_id` visible aunque el hito esté oculto (hito 13)
`v_pagos_programados` y `dinero_del_proyecto` devuelven `hito_id` (`...0200:164`, `to_jsonb(v)`), y la tabla también lo expone. `hito_numero` y `hito_nombre` sí vienen nulos por la RLS de hitos. Solo se filtra un uuid; no es un dato legible. No hay prueba de este caso que yo haya visto.

### B-4 · BAJO · Defensa en profundidad: `comprobantes_abono_fk` no ata el abono al mismo contrato
`...0100:126` solo exige misma empresa. Hoy solo el RPC (super admin) lo llena, y nadie tiene escritura directa, así que no es explotable.

### B-5 · BAJO · Archivos huérfanos en Storage
Si `subir_comprobante` falla, el archivo queda subido (la nota lo dice, sección 4). Un miembro autorizado puede subir muchos sin registrar. Pedir tarea de limpieza (sprint 6) y límite de uso.

### B-6 · INFO · Montos que viajan como número JSON al frontend
La base usa `numeric(14,2)` en todo (sin `float`, `real` ni `money`: verificado por búsqueda en las 5 migraciones). Los máximos (menos de 1e12 con 2 decimales) caben exactos en un número de JavaScript. El frontend no debe sumar ni restar (lo dice la nota, sección 2).

## Revisión punto por punto

| Punto pedido | Resultado |
|---|---|
| RLS con `WITH CHECK` | No hay políticas de escritura: cada tabla tiene solo `SELECT` para `authenticated` (`...0300:15-40`). La prueba 05 de la estructura (hay 25 tablas, toda política de escritura exige `WITH CHECK`) pasa. |
| Aislamiento por rol, foco equipo sin `ver_dinero` | Correcto: toda política de lectura exige super admin o misma empresa **y** `mi_ver_dinero()`. Mutación M2 confirma que las pruebas lo vigilan. `dinero_del_proyecto` responde `no_autorizado` (no vacío). Vistas `security_invoker` quedan vacías. |
| `empresa_id` inmutable | Trigger en las 6 tablas (`...0200:123-128`). |
| FKs compuestas | Contrato→proyecto `(proyecto_id, empresa_id)`, cuota→contrato, abono/factura/comprobante→`(empresa, contrato, cuota)`. Una cuota de otro contrato o empresa da `pago_no_encontrado`. Único hueco: B-4. |
| `SECURITY DEFINER` con `search_path` vacío | Todas las funciones de las 5 migraciones lo declaran (revisadas una por una; mi búsqueda automática marcó 6 por firma en varias líneas, todas con `set search_path = ''` más abajo). Las lecturas son `SECURITY INVOKER`. |
| Grants y `aal2` | `revoke all` sobre cada función y vista y `grant` explícito; `service_role` solo ejecuta `generar_recordatorios_pago` (que además rechaza si hay usuario). Los permisos por defecto de tablas ya vienen revocados desde el sprint 1 (`...0100_base:16-18`). Super admin exige `aal2` (`es_super_admin_real`); admin del cliente, cuando la empresa lo exige. |
| Trigger `ver_como_solo_lectura` | En las 6 tablas, también en TRUNCATE (`...0300:43-50`). Mutación M4 detectada. `subir_comprobante` y `anotar_descarga_factura` además lo revisan por su cuenta. |
| Storage del bucket `dinero` | Ver M-2 y M-3. Diseño correcto, sin ejecutar. |
| `numeric` sin float | Verificado (B-6). `private.dinero` rechaza más de 2 decimales, cero, negativos, NaN, infinito y ≥ 1e12 (`...0400:8-15`). |
| Saldo no manipulable desde el cliente | El saldo no se guarda: lo calcula `v_contratos_saldo`. Ningún rol de la aplicación tiene INSERT/UPDATE/DELETE. El cliente solo llama `subir_comprobante`. |
| Comprobante solo crea abono al confirmar | Correcto: `subir_comprobante` no toca `abonos`; `rechazar_comprobante` tampoco; solo `confirmar_comprobante` inserta (`...0400:338`). Restricciones de coherencia en la tabla (`confirmado` exige `abono_id`). Pruebas 33 lo cubren. |
| Concurrencia de dos confirmaciones | Ver M-1. Diseño sin interbloqueo; falta prueba. |
| Ingresos vacíos para quien no es super admin | Correcto en las 3 vistas (`...0200:206,212,219`). Mutación M1 detectada. |
| Avisos sin fuga de datos | La cola es solo del super admin. Los avisos al super admin llevan empresa y concepto; los del cliente solo concepto, valor y motivo de su propia empresa; el texto libre del cliente (`nota`) no entra. Único detalle: B-1. |

## Las 7 lecturas de ambigüedad (sección 9 de la nota)

Numeradas como en la nota. Comparadas con `memoria-del-proyecto/requerimientos-aprobados.md` (Módulo 4 y cambio v3).

| # | Lectura | ¿Contradice los requerimientos? |
|---|---|---|
| 1 | Subir comprobante exige `ver_dinero` **y** `subir_archivos` | **No.** El permiso 5 dice "subir archivos (y comprobantes, si además puede ver dinero)" (línea 30). Coincide. |
| 2 | Anticipo informativo, no crea cuota ni abono | **No.** El requisito no lo define; la cuota "Anticipo" se agrega al plan. |
| 3 | Cuotas suman como máximo el valor del contrato | **No.** No se exige llegar al 100 %. |
| 4 | Abono atado a cuota o suelto | **No.** |
| 5 | Cuota con comprobante en revisión se muestra `en_revision`, no `vencida` | **No contradice**: el requisito dice que al subir el comprobante "el pago queda en revisión". Vigilar que un comprobante olvidado oculte una cuota vencida del contador; el panel sí lo trae en `atencion`. |
| 6 | Recordatorios en ventana de 3 días + hoy + vencido | **Parcial.** No contradice la ventana, pero omite cuotas con comprobante en revisión (el requisito no lo exceptúa) y agrega un aviso no pedido. Ver B-2. Decisión del dueño. |
| 7 | Facturas anulables, motivo visible al cliente | **No.** A nombre de Amotii, de acuerdo con el requisito. |

Ninguna lectura contradice de frente un requerimiento. Solo la 6 pide una decisión del dueño.

## Lo que se probó y lo que no
- Probado por pgTAP: roles, aislamiento, 2FA, saldo, abonos, comprobantes, facturas, recordatorios, panel, ingresos, "ver como", registro de actividad y reversibilidad.
- No probado: Storage real (M-3), concurrencia con dos sesiones (M-1), correos reales (el módulo de notificaciones es del sprint 6), rendimiento con volumen.

## Siguiente paso
Desarrollo (backend): M-1 (prueba de dos sesiones) y M-2 (`allowed_mime_types`). DevOps / QA: M-3 en Supabase real. Dueño: decidir la lectura 6. Luego QA vuelve a correr `npm run test:db` y firma el punto de control 4 de QA.
