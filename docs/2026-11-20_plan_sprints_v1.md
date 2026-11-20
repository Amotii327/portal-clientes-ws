# Plan de sprints · Portal de clientes Websourcing

**Equipo Websourcing · Producto** · Versión v1 · Estado: borrador para aprobación del dueño
Base: requerimientos v3, arquitectura v4 y diseño aprobado (controles 2 y 3, 2026-11-19).

Sprints de 2 semanas. Cada sprint termina con demo en link de prueba, revisión de Calidad y aprobación del dueño (control 4). Se descansa del 21 de diciembre al 4 de enero.

| Sprint | Fechas | Qué queda funcionando | Demo |
|---|---|---|---|
| 1 | 23 nov – 4 dic 2026 | Base del portal en el VPS con Coolify; base de datos en Supabase con las cerraduras por empresa y sus pruebas automáticas; entrada segura (login, invitación, recuperar contraseña, código del celular, bloqueo por intentos); crear y pausar empresas; invitar equipo y permisos; temas Clara y Oscura | 4 dic |
| 2 | 7 – 18 dic 2026 | Proyectos con los 13 hitos, retrasos con motivo, línea de tiempo y % de avance; panel general del super admin; historial y registro de actividad; modo "ver como el cliente" | 18 dic |
| — | 21 dic – 4 ene | Descanso de fin de año | — |
| 3 | 5 – 16 ene 2027 | Revisiones y aprobaciones (apruebo / pido cambios, versiones, bandeja del super admin); documentos con versiones y permisos; "Archivos de la empresa"; archivos privados con enlaces que vencen; copia diaria de archivos en el VPS | 16 ene |
| 4 | 19 – 30 ene 2027 | Dinero: contrato, plan de pagos, abonos, saldo, facturas, comprobantes con revisión; datos de facturación; recordatorios de pago por correo; ingresos por mes y cliente | 30 ene |
| 5 | 2 – 13 feb 2027 | Tickets completos: tipos, prioridades, horario hábil, semáforo de respuesta, adjuntos, estados, cierre automático, calificación, solicitudes de cambio con cotización y decisión del dueño | 13 feb |
| 6 | 16 – 27 feb 2027 | Mantenimiento por empresa: activar, parámetros, historial de cambios, bolsa mensual, registro y aprobación de horas, horas extra, avisos del 80 %; avisos por correo de todos los módulos | 27 feb |
| Pruebas finales | 1 – 6 mar 2027 | Calidad (revisión de seguridad completa) y auditoría independiente; validación legal de la Ley 1581 | — |
| Pruebas del cliente | 8 – 12 mar 2027 | El dueño prueba todo con el proyecto "Portal de clientes" cargado como primer cliente | — |
| Salida a producción | 15 mar 2027 | portal.websourcing.com.co en línea (control 5) | — |

## Lo que necesitamos del dueño y cuándo

| Qué | Para cuándo | Para qué |
|---|---|---|
| VPS de Hostinger listo y acceso para instalar Coolify (por el gestor de secretos, nunca por chat) | 30 nov | Link de prueba del sprint 1 |
| Cuenta de Supabase (plan Pro, ~USD 25/mes) creada por el dueño, en la región del VPS | 25 nov | Base de datos desde el sprint 1 |
| Cuenta de Resend y acceso al DNS de websourcing.com.co (para los registros de correo) | 30 nov | Correos de invitación y recuperación |
| Subdominio de pruebas `demo.portal.websourcing.com.co` apuntando al VPS | 30 nov | Demos de cada sprint |
| Revisar cada demo y aprobar | Fecha de cada demo | Control 4 |
| Asesoría legal sobre transferencia internacional de datos | 1 mar | Requisito antes de producción |

## Riesgos

- Si el VPS o Supabase no están listos el 30 de noviembre, el sprint 1 se demuestra en el computador del equipo y el link de prueba se corre al sprint 2.
- Las fechas suponen que el dueño aprueba cada demo en máximo 2 días hábiles.
- Todo pedido nuevo pasa como solicitud de cambio y puede mover fechas.
