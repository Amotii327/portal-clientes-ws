# Acta del sprint 1 · Portal de clientes Websourcing

**Equipo Websourcing** · Del 2026-11-19 al 2026-11-20 (plan: 23 al 27 de noviembre, se adelantó) · Demo: 2026-11-20, por capturas

## Lo que se entregó
| Historia | Estado | Cómo probarlo |
|---|---|---|
| Entrar con correo y clave, recuperar y cambiar clave | Hecho | `/entrar`, `/recuperar`, `/cambiar-clave` |
| Activar cuenta desde una invitación (con política de datos) | Hecho | `/activar?token=…` |
| Código de seguridad en el celular (2FA) para super admin y admin del cliente (D-014) | Hecho | `/verificar` |
| Super admin: crear empresa con su primer admin, pausar y reactivar | Hecho | `/admin/clientes` |
| Super admin: detalle de empresa, invitar, bloquear, quitar, cancelar invitaciones | Hecho | `/admin/clientes/[id]` |
| Admin del cliente: Mi equipo (invitar, 4 permisos, bloquear, quitar, cancelar invitación) | Hecho | `/cliente/equipo` |
| Datos de facturación de la empresa (adelantado, D-019) | Hecho | `/cliente/facturacion` |
| Pantallas de aviso: empresa pausada, persona quitada o bloqueada, sin permiso | Hecho | Se ven al entrar con esas cuentas |
| Tema Clara (por defecto) y Oscura, guardado por persona (D-017) | Hecho | Botón sol/luna arriba |
| Freno de 5 intentos fallidos por 15 minutos | Hecho en código; se enciende con Supabase Pro | — |
| Base de datos con separación por empresa y registro de actividad | Hecho | 373 pruebas automáticas |

**Link de prueba:** todavía no. Se publica en el VPS de Hostinger en el sprint 2, cuando esté listo. Por ahora la demo es con capturas en `/mnt/project-files/portal-clientes/demos/sprint1/`.

## Calidad
- Base de datos: 373 de 373 pruebas pasan. Calidad encontró 7 puntos importantes y 10 menores en la primera revisión. Se corrigieron y se re-verificaron (informes backend v1 y v2): pasa con condiciones.
- Pantallas: 77 de 77 recorridos automáticos pasan, en computador y celular, temas claro y oscuro. Calidad pidió 5 ajustes (aviso de cuenta frenada, mensaje que no revele si un correo existe, validar permisos en el servidor, cancelar invitaciones, prueba del 2FA del admin del cliente). Todos corregidos y re-verificados (informes frontend v1 y v2): pasa con condiciones.
- El enlace de invitación nunca llega al navegador (verificado con prueba).

## Lo que quedó pendiente y por qué
- Envío real de correos (invitaciones y recuperar clave): depende de la cuenta de Resend y del DNS.
- Freno de intentos y 2FA del admin del cliente encendidos en el sistema real: dependen de pasar Supabase a Pro, antes de producción.
- Verificar la IP real de cada acción con Supabase en vivo.
- Detalles menores de Calidad (M-1, M-2, M-3, M-5, M-7) pasan al sprint 2.
- Correo de soporte y texto legal completo de la política de datos: los define el dueño.

## Solicitudes de cambio de este sprint
Ninguna. La facturación del cliente estaba en los requerimientos aprobados y solo se adelantó (D-019).

## Próximo sprint
Sprint 2 según el plan aprobado (v2). Incluye la publicación en el VPS con link de prueba.

## Aprobación
- Dueño: aprobado · Fecha: 2026-11-20
- Cliente: aprueba / pide ajustes: ___ · Fecha: ___
