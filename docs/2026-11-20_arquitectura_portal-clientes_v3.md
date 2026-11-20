# Arquitectura · Portal de clientes Websourcing

**Uso interno.** Para el cliente se entrega el resumen de la sección 0.
Versión v3 · Estado: propuesta, pendiente del control 2 (aprobación del dueño)
Base: `memoria-del-proyecto/requerimientos-aprobados.md` (requerimientos v2, aprobados 2026-11-19) y `memoria-del-proyecto/decisiones.md`.
Cambio frente a v2: el dueño eligió su **VPS de Hostinger** (opción B) en lugar de Render, el dominio portal.websourcing.com.co y la copia de archivos en Hostinger. Siguen incorporados los 15 hallazgos de QA (sección 10).

## 0. Resumen para el cliente (una página, lenguaje simple)

El portal es una página web privada, como una sucursal virtual de Websourcing, donde cada empresa cliente entra con su usuario y ve solo lo suyo: en qué va su proyecto, qué tiene que aprobar, cuánto ha pagado, qué ha pedido y sus documentos.

- **Una sola casa, apartamentos con llave propia.** Todas las empresas usan el mismo portal, pero la base de datos tiene una cerradura en cada puerta: aunque alguien cambie un enlace, el sistema no le muestra datos de otra empresa.
- **Entrada segura:** contraseña y un código de verificación desde una app del celular para los administradores.
- **Archivos privados:** los documentos se descargan con enlaces que vencen en minutos; no quedan públicos en internet.
- **Copias de seguridad diarias** de la información y de los archivos, guardadas en dos lugares distintos, y registro de quién hizo qué y cuándo.
- **Funciona en computador y celular**, y se puede instalar como app desde el navegador.
- **Tus datos personales** se tratan según la Ley 1581 de Colombia. Usamos proveedores tecnológicos externos para guardar y procesar la información, y puedes pedir consultar, corregir o eliminar tus datos.

*Equipo Websourcing · Arquitectura*

## 1. Opciones evaluadas (máximo dos)

Las dos usan la misma base: Next.js + TypeScript + Tailwind + shadcn/ui (librería de componentes) para las pantallas y Supabase (PostgreSQL) para datos, usuarios y archivos. Lo único que cambia es **dónde vive** la aplicación web.

Analogía: la opción A es **arrendar un local amoblado** (llegas y abres). La opción B es **arrendar un local vacío y adecuarlo tú** (más barato al mes, pero hay que mantenerlo).

| | Opción A: plataforma administrada (Render) | Opción B: servidor propio (Hetzner o DigitalOcean + Coolify) |
|---|---|---|
| Cómo funciona | Se conecta el repositorio de GitHub; cada cambio aprobado se publica solo. La plataforma se encarga del servidor, el certificado de seguridad y los reinicios | Alquilamos un servidor virtual y le instalamos un panel (Coolify) que hace lo mismo: publicar desde GitHub, certificados y reinicios |
| Ventajas | Casi cero mantenimiento. Links de prueba por cada cambio, útiles para las demos de sprint. Fácil de entregar a otro equipo | Más barato. Un solo servidor puede alojar el portal y varios proyectos de clientes. Control total |
| Riesgos | Cuesta más al crecer. Dependemos de un proveedor (mitigado: el código es Next.js estándar y se puede mover) | Nosotros respondemos por actualizaciones de seguridad del servidor, caídas y espacio en disco. Más trabajo para DevOps |
| Costo mensual de servidores (solo la app, aprox.) | USD 7 a 25 | USD 6 a 15 |

**Elegida por el dueño: Opción B en su VPS de Hostinger** (ya lo tiene pagado). Se instala Coolify en el VPS: publica desde GitHub cada cambio aprobado, pone el certificado de seguridad, reinicia si algo falla y crea links de prueba por cada cambio para las demos de sprint. El mismo VPS servirá después para proyectos de otros clientes. A cambio, DevOps asume el cuidado del servidor (ver sección 7).

> Precios aproximados a noviembre de 2026, en dólares; DevOps los confirma antes de contratar.

**Región:** la base de datos (Supabase) se crea en la misma zona del VPS, para que cada pantalla no viaje entre países. Si el VPS está en Brasil, Supabase va en São Paulo; si está en EE. UU., en EE. UU. Este. DevOps lo confirma en el panel de Hostinger antes de crear la base.

## 2. Mapa de módulos

```
                 ┌──────────────────────────────────────────────┐
  Navegador ───▶ │  Portal web (Next.js, VPS Hostinger)          │
  (PC/celular)   │  - Zona cliente: inicio/línea de tiempo,      │
                 │    revisiones, dinero, tickets, documentos,   │
                 │    mi equipo, mi plan de mantenimiento        │
                 │  - Zona super admin: panel, clientes,         │
                 │    proyectos, bandeja de aprobaciones,        │
                 │    finanzas, tickets, mantenimiento, registro │
                 │  (usa siempre la sesión del usuario: RLS)     │
                 └──────┬───────────────────┬────────────────────┘
                        │                   │
           ┌────────────▼──────┐   ┌────────▼─────────┐
           │ Supabase           │   │ Correo (Resend)  │
           │ - PostgreSQL + RLS │   │ dominio propio,  │
           │ - Usuarios (Auth)  │   │ también para los │
           │ - Archivos privados│   │ correos de Auth  │
           │ - Tareas programadas (pg_cron), únicas con   │
           │   permiso de sistema: recordatorios, cierre  │
           │   de tickets, corte de bolsa, cuota mensual  │
           └────────┬───────────┘   └──────────────────┘
                    │ copia diaria cifrada de archivos
           ┌────────▼───────────┐
           │ VPS Hostinger      │
           │ (carpeta de copias │
           │ cifradas)          │
           └────────────────────┘
```

Módulos de código (carpetas del repositorio):
1. `auth` – entrada, invitaciones, recuperación, código adicional (2FA), bloqueo.
2. `empresas` y `usuarios` – empresas, miembros, permisos, datos de facturación.
3. `proyectos` – proyectos, hitos (13 estándar), sprints, retrasos, avance.
4. `revisiones` – revisiones de sprint/diseño, versiones y aprobaciones.
5. `dinero` – contratos, plan de pagos, abonos, facturas.
6. `tickets` – tickets, mensajes, adjuntos, estados, tiempos (horario hábil), calificación, solicitudes de cambio.
7. `documentos` – documentos con versiones y permisos por documento.
8. `mantenimiento` – planes por empresa, historial de cambios, bolsa mensual, horas.
9. `admin` – panel general, modo "ver como el cliente", registro de actividad, ingresos.
10. `notificaciones` – correos y tareas programadas. **Único módulo** que usa la clave de sistema (service role).

## 3. Modelo de datos

Toda tabla de datos de clientes lleva `empresa_id`. Las tablas hijas se enlazan con llaves compuestas `(empresa_id, id_padre)`, así un ticket de la empresa A nunca puede apuntar a un proyecto de la empresa B.

| Tabla | Qué guarda | Relación |
|---|---|---|
| `empresas` | Nombre, logo, estado (activa/pausada). Solo la edita el super admin | — |
| `datos_facturacion` | Razón social, NIT, correo de facturas. La edita el admin del cliente | 1 a 1 con empresa |
| `perfiles` | Nombre, correo, celular, `bloqueado` | 1 a 1 con usuario de Supabase Auth |
| `super_admins` | Usuarios con llave maestra. Sin acceso desde la API; solo se cambia directo en la base | perfil |
| `miembros` | Usuario dentro de una empresa: rol (`admin_cliente` / `equipo`), permisos (aprobar, ver_dinero, ver_todos_tickets), `bloqueado` | perfil ↔ empresa |
| `invitaciones` | Correo, empresa, rol (nunca super admin), token de un solo uso guardado con hash, vence en 7 días, usada | empresa |
| `aceptaciones_politica` | Usuario, versión de la política de datos, fecha, IP | perfil |
| `proyectos` | Nombre, estado, fechas | empresa |
| `hitos` | Número (1–13), nombre, estado, fecha planeada, fecha real, pago asociado, visible | proyecto |
| `retrasos` | Fecha anterior, fecha nueva, motivo, lado (websourcing/cliente) | hito |
| `sprints` | Número, fechas, fecha de demo | proyecto (hito 6) |
| `revisiones` | Tipo (sprint/diseño), versión, link de prueba, video, acta, estado (`borrador` / `publicada` / `aprobada` / `cambios_pedidos` / `reabierta`) | proyecto / sprint |
| `aprobaciones` | Revisión y versión, decisión, comentario, captura, quién, cuándo, IP. Solo se agrega | revisión |
| `contratos` | Valor total, moneda (COP/USD), fecha de firma | proyecto |
| `pagos_programados` | Concepto, valor, vencimiento, hito asociado u origen (cuota de mantenimiento), estado | contrato o plan |
| `abonos` | Valor, fecha, medio, comprobante | contrato / pago programado |
| `facturas` | Número, valor, archivo PDF (a nombre de Amotii) | contrato |
| `tickets` | Tipo, prioridad propuesta y confirmada, estado, creado_por, vence_primera_respuesta, `fuera_de_plan`, decisión del dueño (cobrar/regalar/rechazar), calificación | empresa (y proyecto opcional) |
| `ticket_mensajes` | Texto, adjuntos, área que responde ("Equipo Websourcing · Desarrollo"), autor interno (nunca visible al cliente) | ticket |
| `propuestas_cambios` | Solicitud de cambio cotizada, valor, decisión del dueño, estado, aceptada_por (solo admin del cliente), cuándo, IP | ticket / proyecto |
| `documentos`, `documento_versiones` | Categoría, visibilidad (todo el equipo / solo admin / personas elegidas), versión, archivo | empresa / proyecto |
| `documento_permisos` | Documento, miembro (para compartir documento por documento) | documento |
| `planes_mantenimiento` | Activo, plan base, fecha de inicio, fecha de fin o renovación mensual, cuota, horas/mes, acumular, frecuencia por semana, días y horario, tiempos de respuesta por prioridad, qué incluye, valor hora extra, próxima revisión | empresa |
| `planes_mantenimiento_historial` | Parámetro, valor anterior y nuevo, efectivo desde (hoy o próximo mes), motivo, quién | plan |
| `bolsa_mensual` | Plan, mes, horas incluidas, arrastradas, usadas, extra, aviso del 80 % enviado | plan |
| `horas_registradas` | Ticket, horas, nota interna (no la ve el cliente), estado (`pendiente_dueno` / `aprobada` / `extra_pendiente_cliente` / `extra_aprobada`), mes | bolsa / ticket |
| `correos_enviados` | Tipo, destinatario, empresa, estado (enviado/falló), fecha | empresa |
| `registro_actividad` | Quién (o "sistema"), qué, sobre qué, cuándo, IP, empresa. Solo se agrega | empresa (o global) |
| `configuracion` | Marca de Websourcing, horario hábil, tiempos por defecto, versión vigente de la política de datos | global |

**Cálculos** (vistas creadas con `security_invoker = true`, que respetan las mismas cerraduras que las tablas):
- **Saldo** del contrato, **ingresos** por mes y por cliente (solo super admin) y **horas disponibles** del mes.
- **Avance del proyecto (propuesta para aprobar):** los hitos 1 a 5 y 7 a 12 valen lo mismo cada uno, y el hito 6 vale lo que sumen sus sprints (cada sprint igual). Ejemplo: con 3 sprints hay 14 partes; terminar el sprint 1 suma 1/14. El hito 13 (mantenimiento) no cuenta, porque es continuo.
- **Historial del proyecto** para el cliente: vista filtrada del registro, sin IP ni acciones internas.

## 4. Multi-empresa

- **Regla:** RLS (Row Level Security) activada en **todas** las tablas. Una prueba automática falla si alguna tabla queda sin RLS. Los roles anónimo y de servicio no tienen acceso por defecto.
- Cada regla de escritura lleva `WITH CHECK` y `empresa_id` no se puede cambiar después de creada la fila (trigger). Nadie puede "mudar" un dato a otra empresa.
- **Matriz de permisos:** el repositorio tendrá `docs/matriz-permisos.md` con cada tabla × rol × (leer, crear, editar, borrar). Las reglas RLS y las pruebas salen de esa matriz. Puntos clave:
  - El usuario no puede editar su rol, sus permisos ni volverse super admin.
  - El admin del cliente edita `datos_facturacion`, no `empresas` (no puede reactivar una empresa pausada ni cambiar su NIT de registro).
  - Ver dinero (contratos, pagos, abonos, facturas, saldo y el pago asociado de cada hito) exige `ver_dinero` o ser admin del cliente.
  - Las revisiones en `borrador` no las ve el cliente. Solo se publican cuando el super admin las marca listas (después de QA y del dueño).
  - `aprobaciones` y `registro_actividad` no aceptan cambios ni borrados de ningún rol de la aplicación. Reabrir una revisión es una función aparte, solo del super admin, que queda en el registro.
  - Con mantenimiento apagado, el hito 13 y el módulo de mantenimiento son invisibles para el cliente.
- **Permisos y estado se leen de la base en cada consulta**, no del token de sesión. Al quitar, bloquear a alguien o pausar una empresa, el acceso se corta en la siguiente acción y se cierran sus sesiones.
- **Archivos:** bucket privado. Las rutas las genera el servidor (identificador aleatorio), no el usuario. La regla de Storage revisa la tabla dueña del archivo (documento y sus permisos, factura, abono, mensaje de ticket), no solo la carpeta de la empresa. El enlace firmado de 10 minutos se genera **con la sesión del usuario después de leer la fila**, nunca con la clave de sistema. Descarga siempre como archivo adjunto.
- **Tareas programadas:** son las únicas que usan la clave de sistema. Procesan empresa por empresa con filtro explícito, saltan empresas pausadas, usan hora de Colombia, no repiten trabajo si corren dos veces (sin doble aviso ni doble corte) y escriben en el registro como "sistema". Una revisión automática impide usar la clave de sistema fuera del módulo `notificaciones`.
- Las funciones auxiliares de las reglas (`SECURITY DEFINER`) viven fuera del esquema expuesto y con `search_path` fijo.
- **Cómo se prueba:** pruebas automáticas (Playwright y pruebas de base de datos) con dos empresas A y B y varios perfiles (admin, equipo sin dinero, equipo sin ver todos los tickets, usuario quitado, empresa pausada). Cada perfil intenta leer, cambiar y descargar lo que no le toca: por pantalla, por enlace directo, por la API, por las vistas y por los archivos. Todas deben fallar. También se prueba cada tarea programada con A y B. Estas pruebas corren en cada cambio y no se pueden saltar.

## 5. Usuarios, roles y permisos

| Rol | Cómo se guarda | Notas |
|---|---|---|
| Super administrador | Tabla `super_admins` | Solo se asigna directo en la base. Código adicional obligatorio: toda regla del super admin exige sesión con 2FA completado. Códigos de respaldo guardados por el dueño fuera del portal |
| Administrador del cliente | `miembros.rol = admin_cliente` | Lo invita el super admin. Código adicional (app del celular) obligatorio antes de producción, porque ve dinero y aprueba |
| Equipo del cliente | `miembros.rol = equipo` + permisos | Lo invita el admin del cliente. Código adicional opcional |

- **Entrada:** contraseña mínima de 10 caracteres y revisión contra contraseñas filtradas. Límite de intentos por IP y por cuenta con espera creciente y captcha; así nadie puede dejar al dueño por fuera a propósito fallando su clave. Sesiones que vencen.
- **Invitaciones:** enlace de un solo uso, atado al correo invitado, vence a los 7 días y nunca crea super admin.
- **Modo "ver como el cliente":** el super admin elige una empresa y la sesión queda marcada con esa empresa. Las reglas le dejan solo leer esa empresa, sin clave de sistema. Se registran el inicio, el fin y la empresa. La bandeja de aprobaciones y el panel general son pantallas distintas.
- **Aprobaciones:** siempre las hace un usuario del cliente con permiso; el super admin no puede aprobar en su nombre (bloqueado en la base). Aceptar una solicitud de cambio cotizada es solo del admin del cliente.

## 6. Integraciones

| Sistema | Para qué | v1 |
|---|---|---|
| Supabase | Base de datos, usuarios, archivos, tareas programadas | Sí |
| Resend (correo transaccional) | Invitaciones, recuperar contraseña, códigos, avisos. Todos los correos, incluidos los de entrada, salen con el dominio de Websourcing (SPF y DKIM) | Sí |
| VPS Hostinger | Aloja el portal (Coolify) y guarda la copia diaria cifrada de los archivos | Sí |
| GitHub | Código, revisiones y publicación automática en el VPS (Coolify) | Sí (no conectado al portal en v1) |
| Pasarela local / Stripe | Pago en línea | No (v2) |
| WhatsApp | Avisos | No (v2) |
| Facturación electrónica DIAN | — | No (las facturas se suben ya hechas) |

## 7. Seguridad

- **Accesos:** ver sección 5.
- **Cifrado:** todo viaja con HTTPS (con HSTS); Supabase cifra los datos guardados.
- **Claves:** en el gestor de secretos de Coolify y de Supabase. Nunca en el repositorio, la memoria ni documentos. Revisión automática de secretos y de dependencias (Dependabot) en GitHub.
- **Copias de seguridad:**
  - Base de datos: copias diarias de Supabase Pro (7 días).
  - Archivos: las copias de Supabase no incluyen los archivos, así que se copia el bucket cada día, cifrado, al VPS de Hostinger, con 30 días de retención. Además se activan las copias semanales del propio VPS en Hostinger.
  - Meta: perder como máximo 24 horas de información y volver a estar en línea en menos de 4 horas.
  - DevOps prueba una restauración completa (base y archivos) antes de producción y luego cada trimestre.
- **Registro de actividad:** se escribe desde la base (triggers), no desde la pantalla. Incluye entradas y fallos, invitar, quitar o bloquear usuarios, pausar empresas, cambios de permisos, aprobaciones, pagos, descargas de documentos y facturas, cambios del plan de mantenimiento, modo "ver como" y lo que hacen las tareas programadas. La IP se toma de la cabecera de confianza del proxy del VPS (Coolify). Retención: 2 años.
- **Adjuntos y texto:** tamaño (50 MB) y tipo validados en el servidor por el contenido real, no por la extensión. Documentos de Office sin macros. Todo texto de usuarios se muestra escapado. Encabezados de seguridad (CSP) y límite de peticiones por usuario y por IP en la API.
- **Tickets de tipo "acceso":** aviso fijo "No escribas claves aquí; te indicaremos cómo entregarlas de forma segura". El equipo revisa y borra cualquier clave pegada por error.
- **Cuidado del VPS (lo asume DevOps):** actualizaciones de seguridad automáticas del sistema, firewall con solo los puertos web y SSH abiertos, entrada SSH solo con llave (sin contraseña), fail2ban, monitoreo de caída y de disco lleno con aviso al dueño, y revisión mensual en el reporte de mantenimiento.
- **Marca:** ninguna pantalla, correo, enlace ni archivo menciona IA, agentes ni herramientas; se firma "Equipo Websourcing · [área]". Los links de prueba usan el dominio propio (por ejemplo `demo.portal.websourcing.com.co`) y nombres de rama neutros. Se limpian los metadatos de los archivos que sube Websourcing. QA lo revisa en cada sprint.
- **Ley 1581:**
  - Aceptación de la política de datos al activar la cuenta, guardada con versión, fecha e IP.
  - Responsable: Amotii. Canal para consultar, corregir o eliminar datos: un correo de Websourcing, con respuesta en el plazo legal. Una solicitud de eliminación anonimiza los datos personales y conserva los registros contables.
  - Los datos se procesan fuera de Colombia (Hostinger, Supabase y Resend), así que se firman los acuerdos de tratamiento de datos con cada proveedor. Antes de producción, una asesoría legal valida la transferencia internacional.

## 8. Alojamiento y costo mensual

Con la opción elegida (B, VPS de Hostinger). Precios aproximados en dólares; DevOps los confirma antes de contratar.

| Servicio | Proveedor | Costo mensual estimado |
|---|---|---|
| Aplicación web, Coolify y copia diaria de archivos | VPS de Hostinger (ya pagado por el dueño) | USD 0 adicional (el VPS ya existe) |
| Base de datos, usuarios, archivos y copias diarias de la base | Supabase Pro | USD 25 |
| Correo transaccional | Resend (plan gratuito hasta ~3.000 correos/mes) | USD 0 a 20 |
| Dominio portal.websourcing.com.co | Ya existe | USD 0 adicional |
| **Total adicional** | | **≈ USD 25 a 45** |

> No se usa el plan gratuito de Supabase en producción: se pausa si nadie entra en una semana y no trae copias diarias.
> Si más adelante el VPS se queda corto (memoria o disco), se sube de plan en Hostinger; DevOps lo vigila.

## 9. Decisiones

Ver `memoria-del-proyecto/decisiones.md`. Aprobadas por el dueño el 2026-11-19: D-001 dominio portal.websourcing.com.co, D-010 VPS de Hostinger con Coolify, D-013 fórmula de avance, D-014 código adicional para el admin del cliente, D-015 copia de archivos en Hostinger.
Nuevas en este documento, entran con el control 2:
- D-011 · Correo transaccional: Resend, con dominio propio.
- D-012 · Región de Supabase: la misma del VPS.
- D-016 · Librería de componentes: shadcn/ui.

## 10. Revisión de QA y seguridad

Revisión del plano v1 hecha el 2026-11-20 por Calidad: 4 hallazgos bloqueantes, 8 importantes y 3 menores. Todos quedaron incorporados en esta v2.

| # | Gravedad | Hallazgo | Cómo se resolvió |
|---|---|---|---|
| 1 | Bloqueante | Las vistas de saldo y avance podían saltarse las cerraduras | Vistas con `security_invoker`; el dinero exige `ver_dinero`, también en la línea de tiempo (sec. 3 y 4) |
| 2 | Bloqueante | Permisos de escritura sin definir (riesgo de volverse super admin o de mover datos a otra empresa) | Tabla `super_admins`, `datos_facturacion` aparte, `WITH CHECK`, `empresa_id` fijo, llaves compuestas, matriz de permisos y prueba de RLS en todas las tablas |
| 3 | Bloqueante | 2FA del super admin solo en la pantalla; modo "ver como" sin definir | Reglas exigen 2FA completado; "ver como" de solo lectura y registrado (sec. 5) |
| 4 | Bloqueante | Archivos protegidos solo por carpeta | Regla de Storage contra la tabla dueña, `documento_permisos`, enlace firmado con la sesión del usuario (sec. 4) |
| 5 | Importante | Tareas programadas con clave de sistema | Filtro por empresa, sin repetir trabajo, registro como "sistema", clave solo en `notificaciones` |
| 6 | Importante | Huecos del Módulo 10 | Historial de cambios del plan, `bolsa_mensual`, horas extra con aprobación del cliente, `fuera_de_plan`, cuota mensual generada, hito 13 oculto si está apagado |
| 7 | Importante | Entrada: 2FA del admin del cliente, bloqueos, sesiones abiertas, invitaciones | Sección 5 y D-014 |
| 8 | Importante | Revisiones: sin versión ni borrador | Versión, estado `borrador`, aprobaciones solo se agregan, reapertura del super admin, cambios cotizados solo los acepta el admin del cliente |
| 9 | Importante | Registro de actividad sin garantía técnica | Triggers, sin editar ni borrar, lista completa de eventos, vista del cliente sin IP, 2 años de retención |
| 10 | Importante | Las copias no cubrían los archivos | Copia diaria a un segundo proveedor, metas de 24 h y 4 h, prueba trimestral |
| 11 | Importante | Ley 1581 sin evidencias | `aceptaciones_politica`, canal de derechos, anonimización, acuerdos con proveedores, validación legal |
| 12 | Importante | Requerimientos sin cubrir | Fórmula de avance, `bloqueado`, vista de ingresos, `correos_enviados`, decisión del dueño en cambios, sin festivos, shadcn/ui |
| 13 | Menor | Herramientas visibles en enlaces, correos y metadatos | Dominio propio para demos, correos por Resend, limpieza de metadatos, autor interno oculto |
| 14 | Menor | Adjuntos y texto libre | Validación en servidor, sin macros, texto escapado, aviso en tickets de acceso |
| 15 | Menor | Endurecimiento general | CSP, HSTS, límite de peticiones, Dependabot, funciones fuera del esquema expuesto |

Puntos que DevOps confirma antes de contratar: que las copias de Supabase no incluyen los archivos, la región de cada proveedor y los precios.

**Verificación de la v2 (Calidad, 2026-11-20): pasa.** Los 4 bloqueantes quedaron resueltos y no hay bloqueantes nuevos. Quedan 4 detalles para la matriz de permisos o el sprint 1:
- El historial del cliente se arma con una tabla o vista aparte, para que el cliente no tenga lectura sobre `registro_actividad` (IP y acciones internas).
- La marca de "ver como" se guarda en el servidor (tabla de sesiones "ver como"); ningún usuario edita su propio `bloqueado`.
- La copia diaria de archivos corre en la infraestructura de DevOps, con sus credenciales en el gestor de secretos, documentada como excepción conocida.
- Las tareas de `pg_cron` que envían correos llaman a una función del módulo `notificaciones` protegida con secreto, sin sacar la clave de sistema de ese módulo.
