# Nota de Desarrollo (backend) para Desarrollo (frontend) · Módulo 4 Dinero (sprint 4)

**Equipo Websourcing · Desarrollo** · v1. Uso interno.

Qué quedó listo en el servidor para contrato, plan de pagos, abonos, saldo, facturas, comprobantes, recordatorios e ingresos. Las reglas de quién ve qué están en `docs/matriz-permisos-dinero.md`. Las pantallas **no** repiten esas reglas: preguntan a la base y la base responde. Lo de los sprints 1 y 2 sigue igual.

## 1. Archivos

| Archivo | Qué trae |
|---|---|
| `lib/portal/acciones-dinero.ts` | Todas las funciones listas: `dineroDelProyecto`, `subirComprobante`, `crearContrato`, `editarContrato`, `agregarPago`, `editarPago`, `quitarPago`, `crearAbono`, `anularAbono`, `crearFactura`, `anularFactura`, `comprobantesPorRevisar`, `confirmarComprobante`, `rechazarComprobante`, `ingresosPorMes`, `ingresosPorCliente`, `ingresosPorMesYCliente`, `urlFirmadaDinero`, `anotarDescargaFactura` |
| `lib/portal/errores-dinero.ts` | `mensajeDeErrorDinero(error)`: los códigos nuevos traducidos; si no es de dinero, delega en `mensajeDeError` |
| `lib/supabase/tipos-dinero.ts` | Tipos de todo lo de abajo |

Usan el cliente de **sesión del usuario**, nunca la llave de sistema. Fechas como texto `AAAA-MM-DD`. "Hoy" es la fecha de Colombia.

## 2. Dinero: cómo mostrarlo y cómo enviarlo

La base guarda `numeric(14,2)` (no float). **La pantalla no suma ni resta montos**: saldo, abonado, pendiente y estados ya vienen calculados. Para mostrar, `Intl.NumberFormat('es-CO', { style: 'currency', currency })` con la `moneda` del contrato (COP sin decimales, USD con 2). Para enviar un monto, mejor como texto (`"4000000.50"`). Más de 2 decimales se rechaza con `datos_invalidos`; no se redondea en silencio. COP y USD **nunca se mezclan** en un total.

## 3. Pantalla de dinero del cliente (`/cliente/dinero`)

Una sola llamada por proyecto:
```ts
const { data, error } = await dineroDelProyecto(c, proyectoId);
// data.contrato      -> null si el proyecto aún no tiene contrato; si no: valor, moneda, anticipo, abonado, saldo,
//                       programado, sin_programar, pagos_vencidos, monto_vencido, proximo_vence
// data.pagos[]       -> el plan: concepto, valor, vence_el, hito_numero/hito_nombre (o null), abonado, pendiente, estado, dias_para_vencer
// data.abonos[]      -> valor, fecha_pago, medio, referencia, anulado_en/anulado_motivo (pintar tachado con el motivo)
// data.facturas[]    -> numero, valor, fecha_emision, archivo_path, anulada_en/anulada_motivo
// data.comprobantes[] -> estado en_revision | confirmado | rechazado, motivo_rechazo, valor_declarado, creado_en
```
`estado` de cada cuota: `pagado`, `en_revision` (hay un comprobante esperando), `vencido` (marcar en rojo), `por_vencer` (3 días o menos) y `pendiente`. Si el hito de la cuota es el 13 y está oculto, `hito_numero` viene `null`.

- **Equipo sin `ver_dinero`:** `dineroDelProyecto` responde `no_autorizado`. No pinte el menú de Dinero: use `miContexto().permisos.ver_dinero`. El pago asociado de los hitos (sprint 2) sigue igual: solo con `ver_dinero`.
- **Sin contrato:** `contrato: null` y listas vacías (mensaje "Aún no hay contrato cargado").
- **Datos de facturación** (`datos_facturacion`, razón social, NIT, correo de facturas): sin cambios del sprint 1 (D-019).

**Descargar una factura o comprobante**: `urlFirmadaDinero(c, archivo_path)` (enlace de 10 minutos, descarga como adjunto) y, al firmar, `anotarDescargaFactura(c, facturaId)` para el registro.

## 4. Subir un comprobante (cliente)

Lo puede hacer el admin del cliente o el equipo con **`ver_dinero` y `subir_archivos`**. Solo para una cuota que no esté pagada y sin otro comprobante en revisión.
1. El **servidor** genera la ruta `<empresa_id>/comprobantes/<uuid>.<ext>` (uuid nuevo, nunca el nombre del usuario; `ext` = `pdf`, `png`, `jpg` o `webp`) y sube el archivo al bucket privado `dinero` con la sesión del usuario (máx. 10 MB).
2. Llama `subirComprobante(c, { p_pago_id, p_archivo_path, p_archivo_nombre, p_archivo_tipo, p_tamano_bytes, p_valor, p_fecha_pago, p_nota? })`.
3. La cuota pasa a `en_revision`, el saldo **no** cambia y el super admin recibe un aviso. Si lo rechazan, `comprobantes[].motivo_rechazo` trae el motivo: muéstrelo y deje subir otro.

Con Storage real, `subirComprobante` comprueba que el archivo **ya exista** en el bucket y usa su tipo y tamaño **reales** (no los declarados); el bucket solo admite pdf, jpg, png y webp.

**Archivos huérfanos (si la función falla, o si alguien sube y no registra):** el archivo queda en el bucket sin fila dueña; nadie puede leerlo (la regla de lectura mira la tabla). Cómo limpiarlos: (1) el servidor, si `subirComprobante` falla, borra el archivo recién subido con la sesión del usuario... pero **no hay política de borrado**, así que la limpieza real es una tarea programada con la clave de sistema (módulo de notificaciones/mantenimiento, sprint 6) que cada semana lista `storage.objects` del bucket `dinero` con más de 24 horas y sin fila en `comprobantes_pago.archivo_path`, `facturas.archivo_path` ni `abonos.archivo_path`, y los borra con la API de Storage. Consulta de apoyo: `select o.name from storage.objects o where o.bucket_id = 'dinero' and o.created_at < now() - interval '1 day' and not exists (select 1 from public.comprobantes_pago k where k.archivo_path = o.name) and not exists (select 1 from public.facturas f where f.archivo_path = o.name) and not exists (select 1 from public.abonos a where a.archivo_path = o.name);` Pendiente de ese sprint: un tope de archivos huérfanos por empresa.

## 5. Super admin

| Función | Notas |
|---|---|
| `crearContrato`, `editarContrato` | `{ p_proyecto_id, p_valor, p_moneda: 'COP'\|'USD', p_anticipo?, p_fecha_firma? }`. Un contrato por proyecto, se puede crear aunque el proyecto ya esté terminado |
| `agregarPago`, `editarPago`, `quitarPago` | Plan de pagos. `p_hito_id` ata la cuota a un hito (del mismo proyecto). `p_quitar_hito: true` lo suelta |
| `crearAbono` | `{ p_contrato_id, p_valor, p_fecha_pago, p_medio, p_pago_id?, p_referencia?, p_archivo_path? }`. Devuelve `{ abono_id, saldo }` (el saldo ya recalculado) |
| `anularAbono(c, id, motivo)` | Un abono no se edita ni se borra. El motivo lo lee el cliente: escríbalo pensando en él |
| `crearFactura` | PDF a nombre de Amotii. El servidor genera `<empresa_id>/facturas/<uuid>.pdf`, sube el PDF y llama la función con la ruta, nombre y tamaño |
| `comprobantesPorRevisar` | Bandeja de todas las empresas |
| `confirmarComprobante` | **Aquí nace el abono.** Por defecto usa el valor y la fecha que declaró el cliente; `p_valor`/`p_fecha_pago` permiten corregirlos con lo que se vio en el banco |
| `rechazarComprobante(c, id, motivo)` | Motivo obligatorio (5 a 500 letras). No crea abono |
| `ingresosPorMes`, `ingresosPorCliente`, `ingresosPorMesYCliente` | Vistas solo del super admin (para cualquier otro vienen vacías). Una fila por moneda |

Con "ver como" abierto todas estas responden `ver_como_solo_lectura`.

## 6. Panel e inicio (cambian dos funciones del sprint 2)

- `panelSuperAdmin(c).totales.pagos_vencidos` ya **no** es null: cuotas vencidas, sin pagar y sin comprobante en revisión, de empresas activas. Nuevo `totales.comprobantes_en_revision`. `tickets_abiertos` sigue en `null` hasta el sprint 5.
- `atencion[]` suma dos tipos: `pago_vencido` (prioridad 1; trae `empresa_nombre`, `concepto`, `pendiente`, `moneda`, `vence_el`, `dias_de_atraso`) y `comprobante_en_revision` (prioridad 2; `comprobante_id`, `valor`, `moneda`). Hay que agregarlos al `switch` de la tarjeta de atención.
- `inicioCliente(c)` suma `pagos_vencidos` y `proximo_pago`. **Ambos vienen `null` si quien llama no tiene `ver_dinero`**: no pinte la tarjeta de pagos. `proximo_pago` es la cuota no pagada con la fecha más cercana (puede estar vencida).

## 7. Errores nuevos

`error.message` trae el código; `mensajeDeErrorDinero` los traduce. Además de los de siempre (`no_autorizado`, `datos_invalidos`, `ver_como_solo_lectura`, `proyecto_no_encontrado`, `fechas_invalidas`):

`contrato_no_encontrado`, `contrato_ya_existe`, `contrato_bajo_lo_comprometido`, `moneda_con_movimientos`, `anticipo_excede_valor`, `pago_no_encontrado` (no existe **o es de otra empresa**: mismo mensaje), `pagos_exceden_contrato`, `pago_bajo_lo_abonado`, `pago_con_movimientos`, `pago_en_revision`, `pago_ya_pagado`, `hito_de_otro_proyecto`, `abono_no_encontrado`, `abono_excede_saldo`, `abono_excede_pago`, `abono_ya_anulado`, `abono_no_modificable`, `factura_no_encontrada`, `factura_numero_repetido`, `factura_ya_anulada`, `factura_no_modificable`, `archivo_invalido`, `valor_excede_pendiente`, `comprobante_en_revision`, `comprobante_no_encontrado`, `comprobante_ya_revisado`.

## 8. Recordatorios y cola de avisos (para el sprint 6)

- Tabla **`avisos_salientes`** (no existía una cola; la creé con forma genérica: `modulo`, `tipo`, `destino`, `referencia_id`, `clave_unica` única, `datos`, `estado`, `intentos`...). **Si el backend de tickets crea otra parecida, hay que unificarlas al integrar**: esta ya sirve (`modulo = 'dinero' | 'tickets' | ...`).
- Se llena sola por triggers (comprobante recibido → `super_admin`; confirmado o rechazado → `cliente_dinero`) y con `generar_recordatorios_pago()`, pensada para correr **una vez al día** con la clave de sistema (el módulo de notificaciones): encola `pago_por_vencer` (de 3 días antes hasta el día anterior), `pago_vence_hoy` y `pago_vencido` (este también al `super_admin`). Sin repetir (`clave_unica`) aunque corra dos veces; salta empresas pausadas, cuotas pagadas y cuotas con comprobante en revisión.
- `destino = 'cliente_dinero'` significa "el admin y los del equipo con `ver_dinero`": quien envía resuelve los correos al momento de enviar.
- **Nadie envía todavía**: el módulo de notificaciones (sprint 6) leerá `pendiente`, enviará por Resend y marcará `enviado`. Hoy `service_role` no tiene permisos sobre la tabla; se le concederán allí.

## 9. Ambigüedades y la lectura que tomé

1. **Quién sube comprobantes:** la arquitectura dice `ver_dinero`; el pedido menciona también "subir archivos". Exijo **ambos** (admin los tiene siempre). Si el dueño prefiere solo `ver_dinero`, es cambiar una condición en `subir_comprobante` y en `puede_subir_archivo_dinero`.
2. **Anticipo:** es el valor acordado en el contrato (informativo, ≤ valor); no crea cuota ni abono solo. La cuota "Anticipo" se agrega al plan como cualquier otra.
3. **Plan de pagos:** las cuotas deben sumar **como máximo** el valor del contrato (`sin_programar` muestra lo que falta repartir); no obliga a llegar al 100 %.
4. **Abono:** puede ir atado a una cuota o suelto (al contrato). Una cuota con abonos parciales sigue por vencer o vencida hasta cubrirse. Si un abono se anula, la cuota vuelve a su estado por fecha.
5. **Estado `vencido`** = fecha pasada y sin pagar. Una cuota con comprobante en revisión se muestra `en_revision` (no cuenta como vencida en el panel ni genera recordatorios al cliente).
6. **Recordatorios (lectura aceptada por Calidad: no se avisa de cuotas con comprobante en revisión, porque el cliente ya pagó y espera la revisión):** "3 días antes y el día que vence" (requisito) se implementa como ventana de 3 días hasta el día anterior (un solo aviso aunque la tarea falle un día) + aviso el día del vencimiento + un aviso de vencido. Si el super admin cambia la fecha de una cuota, se encola un aviso nuevo con la fecha nueva.
7. **Facturas:** a nombre de Amotii, siempre. Se anulan (no se borran) y el motivo lo ve el cliente. Una factura puede atarse a una cuota o ser del contrato.
8. **Cliente que borra su comprobante:** no se permite (queda en el historial). Si se equivocó, el super admin lo rechaza con motivo y sube otro.
9. **Ingresos** = abonos vigentes por `fecha_pago`, por mes y por cliente, una fila por moneda (sin conversión COP/USD, que no está en el alcance).
10. **Contrato en proyecto cerrado:** se permite (se puede cobrar el saldo final después de terminar).

## 10. Para integrar con las otras ramas

- `panel_super_admin()` e `inicio_cliente()` se reemplazan aquí (`20261218000500`). Si otra rama (tickets) también las reemplaza, hay que fusionar las dos versiones a mano: la de esta rama parte de la del sprint 2.
- `01_estructura.test.sql`: el conteo de tablas pasa de 19 a 25 aquí; con otras ramas se suma lo de cada una. `15_panel_y_resumen.test.sql`: la línea de `pagos_vencidos` ahora espera `0`.
- `database.types.ts`: regenerar con las tablas, vistas y funciones nuevas y mover `tipos-dinero.ts`, `acciones-dinero.ts` y `errores-dinero.ts` a sus archivos de siempre.

## 10b. Correcciones de Calidad (migración `20261218000600`)

- `hito_id` de una cuota llega `null` si el hito está oculto para el cliente (vista y `dinero_del_proyecto`); la columna cruda `hito_id` de la tabla `pagos_programados` ya no se puede leer: use la vista `v_pagos_programados`.
- El aviso de comprobante confirmado trae el valor del abono confirmado (no el declarado).
- El abono de un comprobante debe ser del mismo contrato (llave compuesta).

## 11. Lo que falta o no se probó

- Las políticas de `storage.objects` (bucket `dinero`) no se pueden probar con la base local (no tiene Storage); sí están probadas las funciones que deciden. Probar con Supabase real: leer y subir con cada rol, y que un enlace firmado de otra empresa falle.
- Concurrencia: probada con dos sesiones reales (`supabase/tests/concurrencia/40_dinero_concurrencia.test.sql`, con dblink, en una copia desechable de la base que arma `scripts/test-db.sh`). Verifica que `contrato_para_cambio` bloquea la fila (si alguien le quita el `for update`, la prueba falla), que de dos abonos que juntos pasan el saldo solo uno gana, y que un mismo comprobante confirmado desde dos sesiones crea un solo abono.
- No hay pago en línea (v2) ni conversión de monedas ni envío real de correos.
