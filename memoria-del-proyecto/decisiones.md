# Decisiones · Portal de clientes Websourcing

Todas aprobadas por el dueño el 2026-11-19 ("sí a todo" a las propuestas de las preguntas pendientes).

## D-001 · Dominio del portal · 2026-11-19
- **Qué se decidió:** portal.websourcing.com.co (confirmado por el dueño el 2026-11-19, ya existe).
- **Aprobó:** dueño

## D-002 · Horario hábil para tickets · 2026-11-19
- **Qué se decidió:** lunes a viernes, 8 a. m. a 6 p. m., hora Colombia, sin festivos.
- **Aprobó:** dueño

## D-003 · Tiempos de respuesta por defecto · 2026-11-19
- **Qué se decidió:** urgente 2 horas hábiles, alta 1 día hábil, normal 2 días hábiles, baja en la siguiente planeación. Cada plan de mantenimiento puede cambiarlos.
- **Aprobó:** dueño

## D-004 · Aceptación de propuestas y cambios en v1 · 2026-11-19
- **Qué se decidió:** botón "acepto" que registra quién, cuándo y desde dónde.
- **Qué se descartó:** firma digital en v1 (pasa a v2).
- **Aprobó:** dueño

## D-005 · Logo y colores · 2026-11-19
- **Qué se decidió:** si no existen, el Estudio de marca propone 2 opciones antes del diseño.
- **Aprobó:** dueño

## D-006 · Primer cliente de prueba · 2026-11-19
- **Qué se decidió:** Websourcing se carga como su propio primer cliente y el proyecto "Portal de clientes" se sigue desde el portal. Al terminar el portal, el siguiente proyecto que se carga es una startup del ecosistema.
- **Aprobó:** dueño, 2026-11-19

## D-007 · Horas no usadas del mantenimiento · 2026-11-19
- **Qué se decidió:** por defecto se pierden al cerrar el mes. El super admin puede activar "acumular" por cliente.
- **Aprobó:** dueño (confirmado de nuevo el 2026-11-19, 7:55 p. m.)

## D-008 · Registro de horas en v1 · 2026-11-19
- **Qué se decidió:** el equipo anota a mano las horas de cada ticket; el dueño las revisa antes de que se descuenten de la bolsa.
- **Aprobó:** dueño

## D-009 · Reglas de precio · 2026-11-19
- **Qué se decidió:** no frenan el portal (los valores se escriben por contrato). Se definen después de la arquitectura y antes de la primera venta.
- **Aprobó:** dueño

## D-010 · Alojamiento de la app · 2026-11-19
- **Qué se decidió:** Hostinger (el dueño ya lo tiene). Se descarta Render. Plan: VPS (confirmado 2026-11-19), con Coolify.
- **Aprobó:** dueño

## D-013 · Fórmula de avance · 2026-11-19
- **Qué se decidió:** hitos con el mismo peso, el hito 6 repartido por sprint, el hito 13 no cuenta.
- **Aprobó:** dueño

## D-014 · Código adicional para el admin del cliente · 2026-11-19
- **Qué se decidió:** obligatorio (app del celular) para super admin y admin del cliente.
- **Aprobó:** dueño

## D-015 · Copia diaria de archivos · 2026-11-19
- **Qué se decidió:** la copia diaria de los archivos se guarda en Hostinger (fuera de Supabase).
- **Aprobó:** dueño

## D-017 · Tema visual del portal · 2026-11-19
- **Qué se decidió:** el portal tiene las dos propuestas como temas: Clara (por defecto) y Oscura. Cada usuario elige la suya y queda guardada.
- **Aprobó:** dueño

## D-018 · Proyecto de Supabase · 2026-11-19
- **Qué se decidió:** proyecto `portal-clientes-ws` (ID icinxatqxbpdvssdecke) en la organización Amotii, región East US (us-east-1). Por ahora en plan gratuito para desarrollo; se sube a Pro antes de producción (copias diarias y sin pausa). El VPS debe quedar en EE. UU. para estar cerca de la base.
- **Aprobó:** dueño (creó el proyecto)

## D-019 · Facturación del cliente adelantada al sprint 1 · 2026-11-20
- **Qué se decidió:** la pantalla `/cliente/facturacion` (datos de facturación de la empresa, parte del Módulo 4 de los requerimientos aprobados) queda en el sprint 1, aunque el plan la ponía después. No es alcance nuevo.
- **Aprobó:** dueño, 2026-11-20

## D-020 · "Ver como el cliente" · 2026-11-27
- **Qué se propone (Desarrollo, pendiente de aprobación del dueño):** el super admin con 2FA inicia una sesión "ver como" guardada en el servidor (tabla `sesiones_ver_como`, no en el token), de una empresa y un rol (admin del cliente o equipo con permisos elegidos). Dura máximo 60 minutos, ve exactamente lo que ve el cliente (mismas reglas RLS) y es de solo lectura: mientras dura, deja de actuar como super admin y todas las tablas rechazan escrituras con un trigger. El inicio y el fin quedan en el registro de actividad. No usa clave de sistema.
- **Qué se descartó:** una "vista aparte" con funciones de lectura duplicadas (se desincroniza con lo que ve el cliente) y marcar la empresa en el token (lo controla el navegador).
- **Costo para el dueño:** mientras está en "ver como", no puede editar nada en esa sesión del navegador; debe salir con el botón "Salir". Si abre otra pestaña con el mismo inicio de sesión, también queda en solo lectura.
- **Aprobó:** pendiente

