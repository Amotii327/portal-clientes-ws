# Matriz de permisos: tickets y mantenimiento (sprints 5 y 6)

Equipo Websourcing · Desarrollo. Complementa `docs/matriz-permisos.md` (no la reemplaza). Todo se decide en la base de datos con RLS; el JWT no da permisos. Super admin = dueño, con 2FA (aal2). Ninguna tabla tiene acceso para `anon` ni `service_role`.

## Tablas (acceso directo por la API)

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

## Funciones (RPC)

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

## Reglas y semáforo

- Horario por defecto (D-002): lunes a viernes 8:00 a 18:00, hora de Bogotá, sin festivos. Con plan activo y vigente mandan los horarios y tiempos del plan (D-003).
- Semáforo: `verde` (queda más del 50 % del plazo), `amarillo` (50 % o menos; umbral en `configuracion('semaforo_tickets')`), `rojo` (vencido), `cumplido` / `incumplido` (ya hubo primera respuesta), `cerrado`, `sin_plazo` (prioridad baja: siguiente planeación).
- Bolsa de horas (D-007): las horas no usadas se pierden al cerrar el mes, salvo que el plan tenga `acumular_horas`; en ese caso se arrastra como máximo el sobrante de un mes de horas propias.
- Horas (D-008): las anota el super admin y el dueño las revisa antes de descontar. Aviso al 80 % y al 100 %, con historial.
- Cierre automático: tickets `resuelto` sin confirmar se cierran a los 3 días.
- Los textos libres de tickets no se guardan en `registro_actividad` ni en la cola de correos.

## Interpretaciones tomadas (a confirmar por el dueño)

1. Un día hábil equivale a una jornada completa de horario hábil.
2. Tickets de soporte son error, pregunta y acceso; las solicitudes de cambio no cuentan como soporte.
3. `fuera_de_plan` se evalúa al crear el ticket. El ticket se puede crear, pero no se trabaja sin decisión del dueño.
4. Registrar y revisar horas lo hace el super admin (la versión 1 no tiene un rol de personal separado).
5. Las horas de cambios y de tickets fuera de plan no descuentan de la bolsa.
6. Los valores de los planes Básico, Estándar y Premium son propuestas de Desarrollo, sin precios; el dueño las confirma.
7. El semáforo no se detiene en `esperando_cliente`.
