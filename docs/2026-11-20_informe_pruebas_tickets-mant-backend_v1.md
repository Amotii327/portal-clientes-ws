# Informe de pruebas · Tickets y Mantenimiento (parte del servidor) · Portal de clientes Websourcing

**Equipo Websourcing · Calidad** · Fecha: 2026-11-20 · Rama: `s5-tickets-mant` · Commit revisado: `c1bdb6e`
Alcance: migraciones `20270108000100` a `000700` (prefijo `_tm_`), pruebas 40 a 48, `docs/matriz-permisos-tickets-mant.md` y `docs/2026-11-20_nota_backend-para-frontend_tickets-mant_v1.md`. No se revisaron ni se tocaron las pantallas del Frontend (`app/`, `components/`, `screens/`, `lib/app`, `lib/servidor`, `tests/e2e`). No se cambió código: solo se informa.

## Veredicto: pasa con condiciones

No hay hallazgos bloqueantes. La base está bien cerrada: aislamiento entre empresas, permisos por rol, 2FA del super admin, modo "ver como", Storage y reglas de negocio principales funcionan y las pruebas detectan los daños que les provoqué. Hay **4 importantes** que conviene resolver (o decidir con el dueño) antes de la demo del sprint, y varios menores.

Analogía: la bodega tiene buenas cerraduras y cada llave abre solo su puerta. Pero la libreta de recibos (cola de correos) copia el título que escribe el cliente, el cierre del mes puede botar facturas que aún no se han revisado, y los relojes que cierran tickets y meses (pg_cron) dependen de un enchufe que nadie ha confirmado.

## Pruebas realizadas

| Prueba | Resultado |
|---|---|
| `npm run test:db` | **TODO BIEN**: 27 archivos, **1204 de 1204 pasan** (las pruebas 40 a 48 suman 487). Las migraciones suben, bajan (rollback completo, `public` y `private` quedan vacíos) y vuelven a subir |
| Auditoría del catálogo (consulta directa) | Las funciones `SECURITY DEFINER` de `public` y `private` tienen todas `search_path` vacío. Ninguna función no definer sin `search_path`. `anon` solo ejecuta `mi_contexto()` y `politica_vigente()` (del sprint 1). `service_role` y `PUBLIC` no ejecutan ninguna. Las 12 tablas nuevas tienen RLS, `anon` y `service_role` sin permisos, y `authenticated` solo lee (más insert/update por columna en `garantias` y update de `parametros`/`nota` en `planes_base_mantenimiento`) |
| Políticas | Toda política de escritura (`garantias_crear`, `garantias_editar`, `planes_base_editar`, `portal_tickets_subir`) tiene WITH CHECK. `empresa_id` inmutable en las 11 tablas que lo tienen (`planes_base_mantenimiento` no tiene `empresa_id`). Trigger `ver_como_solo_lectura` en las 12 tablas |
| Llaves foráneas | Todas las que cruzan tablas de empresa son compuestas `(empresa_id, id)`, incluidos `proyecto_id` en tickets y garantías y `miembro_id` en tickets. Solo `outbox_correos` usa llave simple a `empresas` (ver M-8, es de bajo riesgo) |
| Sondas propias (copia desechable) | Cruces entre empresas con admin de B sobre tickets, adjuntos, cobros y bolsa de A: todo devuelve "no encontrado" o "no autorizado", sin diferencia que delate existencia. Escritura directa a tablas: rechazada. Super admin con sesión sin 2FA: no lee ni activa. Modo "ver como": crear ticket y responder quedan bloqueados por `ver_como_solo_lectura`; garantías y planes base no se editan. Equipo ve solo sus tickets; admin del cliente no ve notas internas ni sus adjuntos, ni en la tabla ni en Storage |
| ¿Las pruebas detectan el daño? | Rompí a propósito 10 reglas en copias y restauré. **Las 10 fueron detectadas** (tabla abajo). El repositorio original no se modificó |

### Daños provocados (en copia, no en el repositorio)

| # | Daño | Detectado por |
|---|---|---|
| 1 | Mensajes: quitar `not interno` de la política (el cliente vería notas internas) | Prueba 41, 5 fallos (tablas y adjuntos) |
| 2 | Aviso del 80 % cambiado a 90 % | Prueba 46, fallos 21 a 26 |
| 3 | Cierre automático de 3 a 4 días | Prueba 42, fallos 59, 60, 64, 65 |
| 4 | "Mantenimiento encendido" sin exigir `activo` (apagado por defecto roto) | Prueba 45, fallos 69 y 70 |
| 5 | Una función `SECURITY DEFINER` sin `search_path` | Prueba 40, fallos 13 y 14 |
| 6 | Política de UPDATE en el bucket `portal-tickets` | Prueba 47 (el archivo de pruebas aborta: nadie debe poder cambiar archivos) |
| 7 | `outbox_correos` con permiso para `anon` | Pruebas 01/40/41, fallos 7, 8, 2, 78, 79 |
| 8 | `garantias_crear` con `WITH CHECK (true)` | Prueba 41, fallos 27 y 88 |
| 9 | `empresa_id` de tickets ya no inmutable | Prueba 41, fallo 102 |
| 10 | Una tabla sin la cerradura de "ver como" | Pruebas 40 y 41, fallos 3 y 23 |

## Hallazgos

### Importantes

**I-1 · La cola de correos guarda el título del ticket (texto libre del cliente).**
`supabase/migrations/20270108000400_tm_triggers.sql:316` mete `titulo` en `datos` de `outbox_correos` para todo evento de ticket, y `:355` lo repite en cada mensaje. `docs/matriz-permisos-tickets-mant.md:52` afirma lo contrario ("los textos libres de tickets no se guardan ni en la cola de correos"). Reproducido: un ticket con título "mi clave del servidor es Abc12345" queda tal cual en `outbox_correos.datos` (tipos `ticket_urgente_nuevo` y `ticket_requiere_decision`). El registro de actividad sí está limpio (0 coincidencias). `retirar_texto_mensaje` (`20270108000600:68-78`) no limpia el título ni la cola. La prueba 48 revisa el texto del mensaje y de las notas, pero no el título, por eso no lo vio. Recomendación: dejar solo `ticket_id` y `numero` en `datos` (el módulo de correos puede leer el título al armar el mensaje, con permisos) y agregar la prueba.

**I-2 · El corte mensual puede dejar horas pendientes sin poder aprobarse.**
`private.cerrar_mes_bolsas` (`20270108000300:300-319`) cierra toda bolsa de un mes anterior sin mirar si hay horas en `pendiente_dueno`. Después `revisar_horas` (`20270108000700:192`) responde `bolsa_cerrada` al aprobar. Reproducido: horas anotadas el último día, corte del día 1, aprobar falla. Solo queda rechazar, así que horas legítimas se pierden en silencio. Choca con D-008 (el dueño revisa antes de que se descuenten). Recomendación: que el corte espere (o avise) mientras haya horas pendientes del mes, o que revisar permita aprobar en la bolsa cerrada con una regla clara. Falta prueba para este caso.

**I-3 · Interpretaciones que no coinciden con los requerimientos o decisiones (ver sección propia).** La 5 contradice el Módulo 10 tal como está escrito; la 4 vacía el sentido de D-008; la 2 amplía el texto. Las debe confirmar el dueño; hoy están implementadas como verdad.

**I-4 · Las tareas programadas dependen de `pg_cron` y nadie lo ha verificado.**
`20270108000300:349-356` solo programa el cierre de tickets (3 días) y el corte mensual si la extensión ya existe al aplicar la migración. Si se activa después, no se programa nada y no hay error. Además las funciones están en `private` y sin permisos para `service_role` (`:358-367`), así que "llamarlas desde otro programador" (nota de Backend, línea 34) solo sirve con conexión directa a la base, no por la API. `listas-de-chequeo/salida-a-produccion.md` no menciona este punto. Sin esto fallan dos criterios aprobados (cierre automático a los 3 días, bolsa mensual). Recomendación: agregar a la lista de salida "pg_cron activo y los dos trabajos visibles en `cron.job`", o dejar documentado cómo los corre DevOps en el VPS de Hostinger (D-010).

**Pendiente conocido, no es error del Backend (informativo):** el correo solo se encola, no se envía (el criterio "aviso por correo de inmediato" del Módulo 5 y los avisos del 80 % no llegan hasta conectar el servicio), y el hito 13 y la cuota mensual en Dinero (Módulo 10) quedaron para el sprint de dinero. Está dicho en la nota de Backend; debe quedar en el acta de la demo como criterio abierto.

### Menores

- **M-1 · El cliente ve la nota del dueño al aprobar horas.** `horas_leer` (`20270108000500:93-96`) deja leer todas las columnas de las filas aprobadas, y `revisar_horas` guarda `motivo_revision` también al aprobar (`20270108000700:199-211`). Reproducido: el admin del cliente lee "nota privada del dueno..." y el `registrado_por`. Recomendación: no guardar motivo al aprobar, o dar solo las columnas necesarias.
- **M-2 · Plan personalizado sin `horas_mes` queda con 0 horas y bloquea todo.** El valor por defecto es 0 (`20270108000200:83`); `activar_mantenimiento` no lo exige; la bolsa nace en 0 y `bolsa_agotada_sin_autorizacion` (`20270108000300:218`) impide pasar cualquier ticket a `en_progreso` (`20270108000600:172-176`). Reproducido. Es una trampa al activar; validar o avisar.
- **M-3 · Se puede volver a decidir "cobrar" en un ticket que ya está en progreso, sin aceptación del admin.** `decidir_ticket` (`20270108000600:215-234`) solo bloquea si el cobro ya fue aceptado; el trigger (`20270108000400:60`) solo mira la transición `clasificado` a `en_progreso`. Reproducido: regalar, pasar a en progreso, luego cobrar: el trabajo sigue sin aceptación. Solo lo hace el dueño, pero choca con "si se cobra, el admin la acepta".
- **M-4 · Garantía manual y sin tope de 30 días.** `garantias` la escribe a mano el super admin y acepta hasta 366 días (`20270108000200:203`); no se deriva del hito 12. Si nadie la registra, los tickets de un proyecto recién entregado quedan `fuera_de_plan` por `sin_mantenimiento`. `clasificar_ticket` los corrige solo si aún no hay decisión (`20270108000600:144`).
- **M-5 · Storage: tipo y tamaño son los que declara el cliente.** `preparar_adjunto_ticket` (`20270108000600:96-106`) confía en `p_mime` y `p_tamano_bytes`; la protección real es el bucket (`file_size_limit`, `allowed_mime_types`, `20270108000500:137-141`). Las filas preparadas y nunca subidas cuentan para el máximo de 30. Además el bucket se crea con `on conflict do nothing` (`:141`): si ya existiera con otra configuración, no se corrige. El mock de pruebas no valida mime ni tamaño. Verificar en Supabase real (lista de salida).
- **M-6 · Funciones `private` ejecutables por `authenticated` con empresa arbitraria.** `semaforo_en`, `minutos_restantes_en` (`20270108000300:370-373`) y `mantenimiento_encendido` (`20270108000500:41`) aceptan un `empresa_id` cualquiera y revelan horario o si hay mantenimiento activo de otra empresa. Mitigado porque `private` no está expuesto en la API (`supabase/config.toml:12`, `schemas = ["public"]`). Además `ticket_visible(..., true)` bloquea la fila antes de saber si es visible (`20270108000300:166-170`), por un instante. Sin riesgo hoy; vigilar si alguna vez se expone `private`.
- **M-7 · Plan base editable sin validar valores.** El CHECK de `planes_base_mantenimiento` solo valida las claves (`20270108000200:66`); un valor roto falla recién al activar un cliente.
- **M-8 · `outbox_correos` usa llave simple a `empresas` y no comprueba que el destinatario sea de esa empresa** (`20270108000100:94-96`). Solo la llenan triggers `SECURITY DEFINER` que ya validan, por eso es menor.
- **M-9 · Pequeños bordes del semáforo y avisos.** Reclasificar recalcula el plazo desde la creación y puede cambiar un `cumplido` a `incumplido` (`20270108000600:147-153`); un ticket que pasa a urgente al clasificar no dispara el aviso urgente (solo cuenta la prioridad propuesta, `20270108000400:319`); `mi_mantenimiento_activo()` responde `true` también al equipo, no solo al admin (`20270108000700:250-253`; no ven datos, solo cambia si se muestra el módulo).
- **M-10 · Huecos de pruebas.** No hay prueba funcional de "ver como" sobre las RPC de tickets (la 40 solo comprueba que el trigger existe; yo lo probé a mano y funciona); no hay prueba del título en la cola (I-1), del corte con horas pendientes (I-2), de plan con 0 horas (M-2) ni de re-decisión (M-3). Los límites reales de Storage no se pueden probar con el mock.

## Reglas de negocio contra los requerimientos

| Regla | Resultado |
|---|---|
| Horario hábil L-V 8 a. m. a 6 p. m., hora Colombia, sin festivos (D-002) | Cumple. Probado: viernes 5 p. m. + 2 h hábiles = lunes 9 a. m.; sábado y domingo arrancan el lunes a las 8; el plan de mantenimiento reemplaza horario y tiempos (D-003) |
| Tiempos por defecto (D-003): urgente 2 h, alta 1 día, normal 2 días, baja "siguiente planeación" | Cumple; baja queda `sin_plazo` |
| Semáforo (verde, amarillo al 50 % o menos, rojo vencido; cumplido o incumplido) | Cumple (umbral configurable y validado). El requerimiento no fija el umbral: lo puso Desarrollo |
| Fuera de plan (Módulo 10, CLAUDE.md 10b) | Cumple para error sin garantía ni plan vigente (`sin_mantenimiento`, `mantenimiento_vencido`). Se amplía a pregunta y acceso (interpretación 2) |
| Solicitud de cambio: no se trabaja sin decisión del dueño; si se cobra, acepta el admin | Cumple (trigger en `20270108000400:60`), con la salvedad M-3 |
| Bolsa de horas: se descuenta al aprobar el dueño (D-008); sobrante pasa a hora extra; 100 % bloquea trabajo nuevo | Cumple. Probado: 1,7 h de 2 h genera aviso al 85 %; 1 h más parte en 0,3 aprobada y 0,7 extra pendiente del cliente; con la bolsa llena un ticket nuevo no pasa a en progreso |
| Aviso del 80 % (y 100 %) al super admin y al admin del cliente | Cumple en la cola (un aviso por tipo y bolsa, sin duplicar). No se envía todavía |
| Horas no usadas se pierden salvo "acumular" por cliente, máximo un mes (D-007, 10b) | Cumple (el arrastre es solo el sobrante propio de un mes). Ver I-2 para horas pendientes |
| Cierre automático a los 3 días de resuelto | Cumple en la base (3 días corridos, omite empresas pausadas, idempotente); depende de I-4 |
| Mantenimiento apagado por defecto | Cumple: sin fila de plan no hay mantenimiento; el cliente no lee plan, bolsa ni horas |
| Cambio de parámetros desde el mes siguiente u hoy, con motivo e historial | Cumple (con prueba en seco para que un valor inválido falle al programar, no en el corte) |
| Super admin con 2FA (aal2) | Cumple: toda función de super admin usa `es_super_admin()`; probado con sesión sin 2FA |
| Sin IA, claves ni Vercel en lo nuevo | Cumple: no hay menciones de IA, ni claves, ni Vercel en las migraciones, tipos y documentos nuevos |

## Las "9 interpretaciones"

El documento que revisé (`docs/matriz-permisos-tickets-mant.md:54-62`) trae **7**, no 9, y la nota de Backend para Frontend no tiene una lista. Falta que Backend diga cuáles son las otras dos. Del análisis del código salen dos candidatas no documentadas (A y B abajo).

| # | Interpretación | ¿Choca? |
|---|---|---|
| 1 | Un día hábil = una jornada completa del horario (600 min por defecto) | No. Coherente con el requerimiento 5.3 y con las pruebas 43 |
| 2 | Soporte = error, pregunta y acceso; `fuera_de_plan` también a pregunta y acceso (`20270108000300:34-40`) | **Amplía el texto del Módulo 10** ("un ticket de **error** fuera de garantía"). No contradice CLAUDE.md 10b ("tickets de soporte"). Importante confirmar: hoy, sin plan, hasta una pregunta de acceso queda esperando decisión del dueño |
| 3 | `fuera_de_plan` se evalúa al crear; se puede crear, no se trabaja sin decisión | No. Coherente con CLAUDE.md 5 y 10b |
| 4 | Registrar y revisar horas lo hace el super admin (`20270108000700:144`) | **Debilita D-008** ("el equipo anota, el dueño revisa"): una sola persona anota y aprueba, sin segundo control. Aceptable en v1 solo si el dueño lo confirma |
| 5 | Las horas de cambios y de fuera de plan no descuentan de la bolsa; ni siquiera se pueden anotar (`20270108000700:152`) | **Contradice el Módulo 10** ("se registra tiempo en un ticket de esa empresa, entonces se descuenta de la bolsa"). Además esas horas no quedan registradas en ninguna parte. Decisión del dueño |
| 6 | Valores de los planes Básico, Estándar y Premium propuestos sin precios | No contradice. Es coherente con "el portal no inventa precios" (D-009) y no copia los porcentajes de CLAUDE.md. Las horas 4, 8 y 16 son inventadas por Desarrollo: confirmar |
| 7 | El semáforo no se detiene en `esperando_cliente` | No. Solo mide la primera respuesta |
| A (no documentada) | Rechazar el cobro cierra el ticket (`20270108000600:262`) | No está en los requerimientos. Razonable; confirmar |
| B (no documentada) | "3 días" son corridos y se omiten empresas pausadas; la hora extra se bloquea solo al pasar a en progreso, no a tickets ya en curso | No está escrito en los requerimientos; confirmar |

Ninguna contradice una regla de CLAUDE.md. Las que necesitan decisión del dueño, en orden: 5, 4, 2.

## Condiciones para cerrar el sprint

1. Corregir I-1 (y agregar prueba) y decidir I-2.
2. El dueño confirma las interpretaciones 5, 4 y 2; Backend completa la lista de 9.
3. DevOps confirma `pg_cron` o el programador alterno y se agrega a `listas-de-chequeo/salida-a-produccion.md` junto con la verificación del bucket `portal-tickets` (tipos, 50 MB, privado) en el Supabase real.
4. Dejar en el acta de la demo como abiertos: envío real de correos, hito 13 y cuota en Dinero.

## Qué no se probó (por entorno)

- Supabase real: Storage con sus límites reales, `pg_cron`, cabeceras de IP.
- Pantallas y recorridos de navegador (Playwright): revisión aparte del Frontend.
- Envío de correos (no existe aún).

Decisión de Calidad: el backend de tickets y mantenimiento **pasa con condiciones** y puede ir a la demo del punto de control 4 una vez resueltas las condiciones 1 y 2. No bloquea la entrega.
