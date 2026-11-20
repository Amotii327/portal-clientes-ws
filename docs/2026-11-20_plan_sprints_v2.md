# Plan de sprints · Portal de clientes Websourcing

**Equipo Websourcing · Producto** · Versión v2 · Estado: aprobado por el dueño el 2026-11-19 (sprints de 1 semana)
Base: requerimientos v3, arquitectura v4 y diseño aprobado (controles 2 y 3, 2026-11-19).

Sprints de 1 semana (decisión del dueño, 2026-11-19). Son el tope: si un sprint termina antes, la demo se adelanta. Cada sprint termina con demo en link de prueba, revisión de Calidad y aprobación del dueño (control 4). Descanso del 21 de diciembre al 4 de enero.

| Sprint | Fechas (máximo) | Qué queda funcionando |
|---|---|---|
| 1 | 23 – 27 nov 2026 | Base de datos con las cerraduras por empresa y sus pruebas automáticas; entrada segura (login, invitación, recuperar contraseña, código del celular, bloqueo por intentos); crear y pausar empresas; invitar equipo y permisos; temas Clara y Oscura |
| 2 | 30 nov – 4 dic 2026 | Portal publicado en el VPS (link de prueba); proyectos con los 13 hitos, retrasos con motivo, línea de tiempo y % de avance; plan de sprints editable por el super admin; panel general; historial, registro de actividad y "ver como el cliente" |
| 3 | 7 – 11 dic 2026 | Revisiones y aprobaciones; documentos con versiones y permisos; "Archivos de la empresa"; archivos privados; copia diaria de archivos en el VPS |
| 4 | 14 – 18 dic 2026 | Dinero: contrato, plan de pagos, abonos, saldo, facturas, comprobantes con revisión; datos de facturación; recordatorios de pago; ingresos por mes y cliente |
| — | 21 dic – 4 ene | Descanso de fin de año |
| 5 | 5 – 8 ene 2027 | Tickets completos: tipos, prioridades, horario hábil, semáforo, adjuntos, estados, cierre automático, calificación, solicitudes de cambio |
| 6 | 12 – 15 ene 2027 | Mantenimiento por empresa (parámetros, historial, bolsa, horas, avisos del 80 %) y avisos por correo de todos los módulos |
| Pruebas finales | 18 – 22 ene 2027 | Calidad (seguridad completa), auditoría independiente y validación legal (Ley 1581) |
| Pruebas del cliente | 25 – 29 ene 2027 | El dueño prueba todo con el proyecto "Portal de clientes" cargado |
| Salida a producción | 1 feb 2027 (o antes) | portal.websourcing.com.co en línea (control 5) |

## Lo que necesitamos del dueño y cuándo

| Qué | Para cuándo | Para qué |
|---|---|---|
| VPS de Hostinger listo y acceso para instalar Coolify (por el gestor de secretos, nunca por chat) | 30 nov | Link de prueba desde el sprint 2 |
| Cuenta de Supabase (plan Pro, ~USD 25/mes) creada por el dueño, en la región del VPS | 25 nov | Base de datos desde el sprint 1 |
| Cuenta de Resend y acceso al DNS de websourcing.com.co (para los registros de correo) | 30 nov | Correos de invitación y recuperación |
| Subdominio de pruebas `demo.portal.websourcing.com.co` apuntando al VPS | 30 nov | Demos de cada sprint |
| Revisar cada demo y aprobar | Fecha de cada demo | Control 4 |
| Asesoría legal sobre transferencia internacional de datos | 1 mar | Requisito antes de producción |

## Riesgos

- Si el VPS o Supabase no están listos el 30 de noviembre, la demo se muestra como prototipo publicado y el link real se corre al sprint siguiente.
- Las fechas suponen que el dueño aprueba cada demo en máximo 2 días hábiles.
- Todo pedido nuevo pasa como solicitud de cambio y puede mover fechas.
