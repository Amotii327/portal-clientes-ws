# Matriz de permisos · Módulo 4 (Dinero)

**Equipo Websourcing · Desarrollo** · sprint 4 · Uso interno. Complementa `docs/matriz-permisos.md` (no la reemplaza; al integrar se funden).

**Regla de oro:** ver dinero exige ser **admin del cliente** o tener el permiso **`ver_dinero`**, y solo de **su** empresa. El equipo sin `ver_dinero` no ve **ninguna** fila de este módulo (ni por tabla, ni por vista, ni por función, ni por archivo). Todo se lee de la base en cada consulta. Durante "ver como el cliente" todo es de solo lectura.

Roles: **SA** = super admin con 2FA (sin "ver como" abierto) · **Admin** = admin del cliente · **Eq+$** = equipo con `ver_dinero` · **Eq** = equipo sin `ver_dinero`. Sin 2FA, el super admin no tiene ningún poder. Anónimo: nada.

## Tablas y vistas

| Objeto | SA | Admin | Eq+$ | Eq | Escritura |
|---|---|---|---|---|---|
| `contratos` | Todos | El de su empresa | Idem | Nada | Solo funciones del SA |
| `pagos_programados` (el plan) | Todas | Las de su empresa | Idem | Nada | Solo funciones del SA |
| `abonos` | Todos | Los de su empresa | Idem | Nada | Solo `crear_abono`, `confirmar_comprobante`; se anulan con `anular_abono` (nunca se editan ni se borran) |
| `facturas` | Todas | Las de su empresa | Idem | Nada | Solo SA (`crear_factura`, `anular_factura`); nunca se editan ni se borran |
| `comprobantes_pago` | Todos | Los de su empresa | Idem | Nada | El cliente solo por `subir_comprobante`; el SA los resuelve; nunca se borran |
| `avisos_salientes` (cola de avisos) | Todos | Nada | Nada | Nada | Triggers y la tarea de recordatorios. La vaciará el módulo de notificaciones (sprint 6) |
| `v_pagos_programados`, `v_contratos_saldo` | Todo | Lo de su empresa | Idem | Vacías | No aplica (vistas `security_invoker`) |
| `v_ingresos_por_mes`, `v_ingresos_por_cliente`, `v_ingresos_por_mes_y_cliente` | Todo | **Vacías** | **Vacías** | **Vacías** | No aplica. Ingresos es solo del super admin |

Ningún rol de la aplicación tiene INSERT, UPDATE ni DELETE de tabla. `service_role` no tiene permisos de tabla (se concederán a notificaciones en el sprint 6).

## Funciones

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

## Archivos (Storage, bucket privado `dinero`)

Ruta siempre `<empresa_id>/<facturas|abonos|comprobantes>/<uuid>.<ext>`, generada por el servidor.

| Acción | SA | Admin | Eq+$ | Eq |
|---|---|---|---|---|
| Leer (la regla mira la tabla dueña: factura, comprobante o abono; no solo la carpeta) | Sí | De su empresa | De su empresa | No |
| Subir | Facturas, soportes y comprobantes en cualquier empresa | Solo comprobantes en su empresa | Solo comprobantes en su empresa y solo con `subir_archivos` | No |
| Reemplazar o borrar | Nadie (sin políticas de UPDATE ni DELETE) | Nadie | Nadie | Nadie |

En "ver como" no se sube nada. Las políticas sobre `storage.objects` solo se crean si existe ese esquema (Supabase real); las funciones que deciden (`private.puede_leer_archivo_dinero`, `private.puede_subir_archivo_dinero`) sí están probadas.

## Registro de actividad (por triggers)

`contrato_creado`, `contrato_editado`, `pago_programado_creado|editado|quitado`, `abono_registrado`, `abono_anulado`, `factura_subida`, `factura_anulada`, `factura_descargada`, `comprobante_subido`, `comprobante_confirmado`, `comprobante_rechazado`. Todos con `proyecto_id` en el detalle. Solo lo lee el super admin.
