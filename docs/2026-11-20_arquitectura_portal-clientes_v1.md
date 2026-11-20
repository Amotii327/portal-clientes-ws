# Arquitectura · Portal de clientes Websourcing

**Uso interno.** Para el cliente se entrega el resumen de la sección 0.
Versión v1 · Estado: propuesta, pendiente del control 2 (aprobación del dueño)
Base: `memoria-del-proyecto/requerimientos-aprobados.md` (requerimientos v2, aprobados 2026-11-19) y `memoria-del-proyecto/decisiones.md`.

## 0. Resumen para el cliente (una página, lenguaje simple)

El portal es una página web privada, como una sucursal virtual de Websourcing, donde cada empresa cliente entra con su usuario y ve solo lo suyo: en qué va su proyecto, qué tiene que aprobar, cuánto ha pagado, qué ha pedido y sus documentos.

- **Una sola casa, apartamentos con llave propia.** Todas las empresas usan el mismo portal, pero la base de datos tiene una cerradura en cada puerta: aunque alguien cambie un enlace, el sistema no le muestra datos de otra empresa.
- **Entrada segura:** contraseña, bloqueo tras varios intentos fallidos y código adicional para las cuentas administrativas.
- **Archivos privados:** los documentos se descargan con enlaces que vencen en minutos; no quedan públicos en internet.
- **Copias de seguridad diarias** y registro de quién hizo qué y cuándo.
- **Funciona en computador y celular**, y se puede instalar como app desde el navegador.
- Usamos proveedores tecnológicos externos para guardar y procesar la información, según la Ley 1581 de Colombia.

*Equipo Websourcing · Arquitectura*

## 1. Opciones evaluadas (máximo dos)

Las dos usan la misma base: Next.js + TypeScript + Tailwind para las pantallas y Supabase (PostgreSQL) para datos, usuarios y archivos. Lo único que cambia es **dónde vive** la aplicación web.

Analogía: la opción A es **arrendar un local amoblado** (llegas y abres). La opción B es **arrendar un local vacío y adecuarlo tú** (más barato al mes, pero hay que mantenerlo).

| | Opción A: plataforma administrada (Render) | Opción B: servidor propio (Hetzner o DigitalOcean + Coolify) |
|---|---|---|
| Cómo funciona | Se conecta el repositorio de GitHub; cada cambio aprobado se publica solo. La plataforma se encarga del servidor, el certificado de seguridad y los reinicios | Alquilamos un servidor virtual y le instalamos un panel (Coolify) que hace lo mismo: publicar desde GitHub, certificados y reinicios |
| Ventajas | Casi cero mantenimiento. Links de prueba por cada rama ("vista previa"), útiles para las demos de sprint. Fácil de entregar a otro equipo | Más barato. Un solo servidor puede alojar el portal y varios proyectos de clientes. Control total |
| Riesgos | Cuesta más al crecer. Dependemos de un proveedor (mitigado: el código es Next.js estándar y se puede mover) | Nosotros respondemos por actualizaciones de seguridad del servidor, caídas y espacio en disco. Más trabajo para DevOps |
| Costo mensual de servidores (solo la app, aprox.) | USD 7 a 25 | USD 6 a 15 |

**Recomendada: Opción A (Render)** porque en el piloto lo que más vale es que el dueño no tenga que cuidar servidores, y los links de prueba por rama encajan con el control 4 (demo por sprint). Cuando la fábrica tenga varios clientes alojados, se puede revisar la opción B para bajar costos.

> Precios aproximados a noviembre de 2026, en dólares; DevOps los confirma antes de contratar.

## 2. Mapa de módulos

```
                 ┌──────────────────────────────────────────────┐
  Navegador ───▶ │  Portal web (Next.js, en Render)              │
  (PC/celular)   │  - Zona cliente: inicio/línea de tiempo,      │
                 │    revisiones, dinero, tickets, documentos,   │
                 │    mi equipo, mi plan de mantenimiento        │
                 │  - Zona super admin: panel, clientes,         │
                 │    proyectos, bandeja de aprobaciones,        │
                 │    finanzas, tickets, mantenimiento, registro │
                 └──────┬───────────────────┬────────────────────┘
                        │                   │
           ┌────────────▼─────┐    ┌────────▼─────────┐
           │ Supabase          │    │ Correo (Resend)  │
           │ - PostgreSQL+RLS  │    │ invitaciones,    │
           │ - Usuarios (Auth) │    │ avisos, claves   │
           │ - Archivos privados│   └──────────────────┘
           │ - Tareas programadas (cron): recordatorios de pago,
           │   cierre automático de tickets, corte de bolsa de horas
           └───────────────────┘
```

Módulos de código (carpetas del repositorio):
1. `auth` – entrada, invitaciones, recuperación, código adicional (2FA).
2. `empresas` y `usuarios` – empresas, miembros, permisos.
3. `proyectos` – proyectos, hitos (13 estándar), sprints, retrasos.
4. `revisiones` – revisiones de sprint/diseño y aprobaciones.
5. `dinero` – contratos, plan de pagos, abonos, facturas, datos de facturación.
6. `tickets` – tickets, mensajes, adjuntos, estados, tiempos (horario hábil), calificación.
7. `documentos` – documentos con versiones y visibilidad.
8. `mantenimiento` – planes por empresa, bolsa de horas, registro de horas.
9. `admin` – panel general, modo "ver como el cliente", registro de actividad.
10. `notificaciones` – correos y tareas programadas.

## 3. Modelo de datos

Todas las tablas de datos de clientes llevan la columna `empresa_id`.

| Tabla | Qué guarda | Relación |
|---|---|---|
| `empresas` | Nombre, razón social, NIT, correo de facturas, logo, estado (activa/pausada) | — |
| `perfiles` | Usuario: nombre, correo, celular, si es super admin | 1 a 1 con usuario de Supabase Auth |
| `miembros` | Usuario dentro de una empresa: rol (`admin_cliente` / `equipo`) y permisos (aprobar, ver_dinero, ver_todos_tickets) | perfil ↔ empresa |
| `invitaciones` | Correo, empresa, rol, vence_en (7 días), usada | empresa |
| `proyectos` | Nombre, estado, fechas, % avance | empresa |
| `hitos` | Número (1–13), nombre, estado, fecha planeada, fecha real, pago asociado | proyecto |
| `retrasos` | Fecha anterior, fecha nueva, motivo, lado (websourcing/cliente) | hito |
| `sprints` | Número, fechas, fecha de demo | proyecto (hito 6) |
| `revisiones` | Tipo (sprint/diseño), link de prueba, video, acta, estado, publicada_por | proyecto / sprint |
| `aprobaciones` | Decisión (apruebo/pido cambios), comentario, captura, quién, cuándo, IP | revisión |
| `contratos` | Valor total, moneda (COP/USD), fecha firma | proyecto |
| `pagos_programados` | Concepto, valor, vencimiento, hito asociado, estado | contrato |
| `abonos` | Valor, fecha, medio, comprobante | contrato / pago programado |
| `facturas` | Número, valor, archivo PDF (a nombre de Amotii) | contrato |
| `tickets` | Tipo, prioridad propuesta y confirmada, estado, creado_por, vence_primera_respuesta, calificación | empresa (y proyecto opcional) |
| `ticket_mensajes` | Texto, adjuntos, área que responde ("Equipo Websourcing · Desarrollo") | ticket |
| `documentos` y `documento_versiones` | Categoría, visibilidad (todo el equipo / solo admin), versión, archivo | empresa / proyecto |
| `planes_mantenimiento` | Activo, plan base, cuota, horas/mes, acumular, frecuencia por semana, días y horario, tiempos de respuesta por prioridad, qué incluye, valor hora extra, vigencia | empresa |
| `horas_registradas` | Ticket, horas, nota, estado (pendiente de revisión / aprobada), mes | plan / ticket |
| `propuestas_cambios` | Solicitud de cambio cotizada, valor, estado, aceptada_por, cuándo, IP | ticket / proyecto |
| `registro_actividad` | Quién, qué, sobre qué, cuándo, IP (solo se agrega, nunca se edita) | empresa (o global) |
| `configuracion` | Marca de Websourcing, horario hábil, tiempos por defecto, festivos | global |

El saldo y el % de avance se **calculan** (vistas de la base de datos), no se escriben a mano, para que nunca queden desfasados.

## 4. Multi-empresa

- **Regla:** cada fila lleva `empresa_id`, y cada tabla tiene reglas RLS (Row Level Security) de PostgreSQL: un usuario solo lee o escribe filas de las empresas donde es miembro. El super admin tiene una regla aparte.
- Las reglas viven **en la base de datos**, no en las pantallas. Si una pantalla tiene un error, la base igual se niega a entregar datos ajenos.
- Los permisos finos (ver dinero, aprobar, ver todos los tickets, documentos solo para admin) también se aplican con RLS.
- Los archivos se guardan en Supabase Storage en rutas `empresa_id/...`, con reglas iguales; se entregan solo con enlaces firmados de 10 minutos.
- La clave maestra de Supabase (service role) solo se usa en el servidor para tareas programadas y nunca llega al navegador.
- **Cómo se prueba:** pruebas automáticas (Playwright + pruebas de base de datos) con dos empresas de prueba A y B: un usuario de A intenta leer, cambiar y descargar cosas de B por pantalla, por enlace directo y por la API. Todas deben fallar. Estas pruebas corren en cada cambio y no se pueden saltar.

## 5. Usuarios, roles y permisos

| Rol | Cómo se guarda | Notas |
|---|---|---|
| Super administrador | `perfiles.es_super_admin = true` | Solo lo asigna el dueño directamente en la base. Código adicional obligatorio |
| Administrador del cliente | `miembros.rol = admin_cliente` | Lo invita el super admin al crear la empresa |
| Equipo del cliente | `miembros.rol = equipo` + permisos | Lo invita el admin del cliente |

- Modo "ver como el cliente": el super admin ve las pantallas del cliente en **solo lectura**; cada uso queda en el registro.
- Una aprobación o aceptación siempre la hace un usuario del cliente; el super admin no puede aprobar en su nombre (bloqueado en la base).

## 6. Integraciones

| Sistema | Para qué | v1 |
|---|---|---|
| Supabase | Base de datos, usuarios, archivos, tareas programadas | Sí |
| Resend (correo transaccional) | Invitaciones, recuperar contraseña, códigos, avisos | Sí |
| GitHub | Código y revisiones; publicación automática en Render | Sí (no conectado al portal en v1) |
| Pasarela local / Stripe | Pago en línea | No (v2) |
| WhatsApp | Avisos | No (v2) |
| Facturación electrónica DIAN | — | No (las facturas se suben ya hechas) |

## 7. Seguridad

- **Accesos:** contraseña mínima de 10 caracteres, bloqueo de 15 minutos tras 5 fallos, código adicional obligatorio para super admin (correo o app de autenticación). Sesiones que vencen.
- **Cifrado:** todo viaja con HTTPS; Supabase cifra los datos guardados.
- **Claves:** en el gestor de secretos de Render y de Supabase. Nunca en el repositorio, la memoria ni documentos. Revisión automática de secretos en GitHub.
- **Copias de seguridad:** diarias (plan Pro de Supabase, 7 días). DevOps prueba una restauración antes de producción y la documenta.
- **Registro de actividad:** toda acción importante (aprobaciones, pagos, cambios de permisos, entradas del super admin, modo "ver como") queda en `registro_actividad`, que no se puede editar ni borrar.
- **Adjuntos:** límite de 50 MB, solo tipos permitidos (imágenes, PDF, video, audio, documentos de Office).
- **Marca:** ninguna pantalla, correo o archivo menciona IA, agentes ni herramientas; se firma "Equipo Websourcing · [área]". QA lo revisa en cada sprint.
- **Datos personales:** aviso y aceptación de la política de datos (Ley 1581) al activar la cuenta.
- **Ubicación de datos:** Supabase en la región São Paulo (la más cercana a Colombia).

## 8. Alojamiento y costo mensual

Con la opción recomendada (A). Precios aproximados en dólares; DevOps los confirma antes de contratar.

| Servicio | Proveedor | Costo mensual estimado |
|---|---|---|
| Aplicación web | Render (plan Starter o Standard) | USD 7 a 25 |
| Base de datos, usuarios, archivos y copias diarias | Supabase Pro | USD 25 |
| Correo transaccional | Resend (plan gratuito hasta ~3.000 correos/mes) | USD 0 a 20 |
| Dominio portal.websourcing.co | Registrador de dominios .co | ~USD 3 (≈ USD 30–40 al año) |
| **Total** | | **≈ USD 35 a 75** |

Con la opción B el total baja a ≈ USD 35 a 60, porque el servidor cuesta menos, pero DevOps lo mantiene.

> No se usa el plan gratuito de Supabase en producción: se pausa si nadie entra en una semana y no trae copias diarias.

## 9. Decisiones

Ver `memoria-del-proyecto/decisiones.md`. Nuevas en este documento, pendientes del control 2:
- D-010 · Alojamiento de la app: Render (opción A).
- D-011 · Correo transaccional: Resend.
- D-012 · Región de datos: São Paulo.

## 10. Revisión de QA y seguridad

Pendiente: QA revisa este plano antes de mostrarlo como definitivo.
