# Nota de Backend para Frontend: tickets y mantenimiento (v1)

Equipo Websourcing · Desarrollo

## Lo esencial

- Todo se usa con un cliente de sesión de usuario. Funciones listas en `lib/portal/acciones-tickets.ts` y `lib/portal/acciones-mantenimiento.ts`; mensajes de error en `lib/portal/errores-tickets-mant.ts` (`mensajeTicketsMant`); tipos en `lib/supabase/tipos-tickets-mant.ts`.
- Las tablas nuevas aún no están en `database.types.ts`; por eso las lecturas usan esos tipos a mano.
- Permisos por rol: `docs/matriz-permisos-tickets-mant.md`.

## Tickets

- Lectura: `listarTickets`, `mensajesDeTicket`, `adjuntosDeTicket`, `semaforoDeTickets` (vista `tickets_semaforo`).
- Semáforo: `verde`, `amarillo`, `rojo`, `cumplido`, `incumplido`, `cerrado`, `sin_plazo`. Amarillo cuando queda 50 % o menos del plazo. `minutos_habiles_restantes` sirve para mostrar el tiempo.
- Flujo de estados: `nuevo` → `clasificado` → `en_progreso` ⇄ `esperando_cliente` → `resuelto` → `cerrado`.
- Si `fuera_de_plan` es verdadero o el tipo es `solicitud_cambio`, el ticket queda esperando la decisión del dueño (`decidir_ticket`). Si es cobro, el admin del cliente acepta o rechaza (`aceptarCobroTicket`, `rechazarCobroTicket`). Mostrar `motivo_fuera_de_plan`.
- Al responder como Websourcing hay que enviar el área; las notas internas (`p_interno: true`) nunca llegan al cliente.
- Cierre automático a los 3 días de `resuelto`. El cliente puede `confirmarResolucion` y luego `calificarTicket` (1 a 5).

## Adjuntos (dos pasos)

1. `prepararAdjuntoTicket({ p_ticket_id, p_nombre, p_mime, p_tamano_bytes })` devuelve `{ bucket: 'portal-tickets', ruta }`.
2. Subir con `supabase.storage.from('portal-tickets').upload(ruta, archivo, { upsert: false, contentType })`. Solo imágenes, videos y audios de hasta 50 MB, máximo 30 por ticket. Para ver el archivo, usar `createSignedUrl` sobre la ruta guardada en `ticket_adjuntos.storage_path`.

## Mantenimiento

- Apagado por defecto. `miMantenimientoActivo()` decide si se muestra el módulo al cliente.
- Cliente (admin): `miPlanMantenimiento`, `resumenDeBolsas` (vista con `horas_disponibles` y `porcentaje_usado`), `avisosDeBolsa`, `horasRegistradas` (solo revisadas por el dueño), `decidirHorasExtra`, `autorizarHorasExtra`.
- Super admin: `activarMantenimiento`, `configurarMantenimiento` (`'hoy'` o `'proximo_mes'`), `apagarMantenimiento`, `anotarHorasTicket`, `revisarHoras`, `planesBase`, `registrarGarantia`.
- Si la bolsa se agota y no hay autorización de extras, los tickets no pasan a `en_progreso` (`bolsa_agotada_sin_autorizacion`).

## Pendientes y avisos

- Tareas programadas: el cierre automático de tickets y el corte mensual de bolsas se programan solo si la extensión `pg_cron` está activada en Supabase; si no, DevOps debe llamarlas desde otro programador.
- Correos: los avisos se guardan en la cola `outbox_correos`; todavía no hay envío real (falta conectar el servicio de correo). Esa tabla no tiene permisos para `service_role`; el módulo de notificaciones deberá concederlos y ajustar la prueba 01.
- Hito 13 y cuota mensual generada (`pagos_programados`): quedan para el sprint de dinero; no se integró aquí.
- Cambios en archivos compartidos: el conteo de tablas en `01_estructura.test.sql` (31), `scripts/test-db.sh` (carga `mock_extra_*.sql`) y el mock de Storage `supabase/tests/local/mock_extra_storage_tickets.sql` (solo pruebas).

## Cambios tras la revisión de Calidad (migración `20270108000800`)

- `horas_registradas.sin_descuento` es verdadero en las horas de solicitudes de cambio (no descuentan de la bolsa). Ya no existe el error `ticket_fuera_de_bolsa` al anotar horas.
- Errores nuevos: `horas_requeridas` (activar plan personalizado sin horas) y `ticket_en_progreso` (cobrar un ticket ya en trabajo).
- El cierre del mes espera mientras haya horas pendientes de revisión; la bolsa se muestra abierta hasta entonces.
- Los correos en cola ya no llevan el título del ticket: el módulo de correos debe leerlo con permisos al armar el mensaje.
- Las horas aprobadas ya no traen nota del dueño (`motivo_revision` queda vacío al aprobar).
