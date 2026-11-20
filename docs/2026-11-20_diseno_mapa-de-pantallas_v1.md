# Diseño · Mapa de pantallas y sistema de diseño · Portal de clientes

**Equipo Websourcing · Diseño** · Versión v1 · Estado: aprobado por el dueño el 2026-11-19 (control 3), con los dos temas: Clara por defecto y Oscura (D-017).
Base: `memoria-del-proyecto/requerimientos-aprobados.md` (v3), arquitectura v4 y decisión D-016 (shadcn/ui).

## 0. Resumen para el dueño

- El prototipo es la aplicación con botones que funcionan y datos de ejemplo. Se abre como página web, sin servidor (`out/index.html`).
- Hay **dos propuestas visuales con el mismo contenido**, que se cambian con el selector **Propuesta: A Clara / B Oscura**:
  - **A Clara**: fondo gris muy claro, tarjetas blancas con sombra suave y esquinas muy redondeadas, mucho espacio, títulos negros grandes, íconos de línea, resumen arriba con tarjetas tipo "saldo" y listas limpias. El verde #99F100 solo se usa como relleno (botones con texto negro), nunca como texto sobre blanco.
  - **B Oscura**: la línea de la web de Websourcing (fondo #050608, tarjetas oscuras, verde de acento, títulos grandes).
- **Decisión que necesito de ti:** elegir A o B (o una mezcla) para la v1. Mientras tanto no se cambia nada del código.
- El selector **Ver como: Super admin / Admin del cliente / Equipo del cliente** cambia de rol. El botón de opciones permite ver los estados vacío, cargando, error y empresa pausada.
- Las referencias de apps que el dueño aún no ha enviado siguen pendientes; el estilo A parte de la referencia que indicó el dueño (solo el estilo, sin marca, colores ni textos de terceros).
- Todos los montos (COP) y datos son de ejemplo.

## 1. Mapa de pantallas

Ruta = lo que aparece después de `#` en la dirección del prototipo.

### 1.1 Entrada (todos los roles)

| Pantalla | Ruta | Para qué |
|---|---|---|
| Iniciar sesión | `/entrada/login` | Correo y contraseña. Muestra el frenado de 15 minutos tras 5 fallos |
| Activar invitación | `/entrada/invitacion` | Crear contraseña (10+ caracteres), aceptar política de datos (Ley 1581). Estado "enlace vencido" a los 7 días |
| Recuperar contraseña | `/entrada/recuperar` | Pedir el correo de cambio y confirmación "revisa tu correo" |
| Código de verificación | `/entrada/codigo` | 6 dígitos. Obligatorio para super admin y admin del cliente; para el equipo, código por correo |

### 1.2 Zona del cliente (admin del cliente y equipo)

| Pantalla | Ruta | Admin | Equipo (por defecto) |
|---|---|---|---|
| Inicio y línea de tiempo (13 hitos) | `/cliente/inicio` | Todo, incluido el pago de cada hito | Igual, pero sin el pago asociado y sin saldo ni próximo pago |
| Revisiones | `/cliente/revisiones` | Aprueba o pide cambios | Solo mira (aprueba solo con permiso) |
| Dinero | `/cliente/dinero` | Contrato, plan de pagos, abonos, saldo, facturas, subir comprobante, datos de facturación | "Sin permiso" (con permiso "ver dinero" lo ve; subir comprobante exige además "subir archivos") |
| Tickets (lista) | `/cliente/tickets` | Todos los de la empresa | Solo los suyos (o todos con permiso) |
| Nuevo ticket | `/cliente/tickets/nuevo` | Tipo, prioridad, adjuntos, aviso en "acceso" | Igual |
| Detalle de ticket | `/cliente/tickets/:id` | Conversación firmada "Equipo Websourcing · Área", confirmar resuelto, calificar, aceptar cotización | Igual en sus tickets; no acepta cotizaciones |
| Documentos | `/cliente/documentos` | Categorías, versiones, documentos solo-admin, "Archivos de la empresa" | Ve los compartidos con todo el equipo; sube archivos solo con permiso |
| Mi equipo | `/cliente/equipo` | Invitar, 4 permisos por persona, bloquear, quitar | "Sin permiso" |
| Mi plan de mantenimiento | `/cliente/mantenimiento` | Horas usadas y disponibles, qué incluye, tiempos, cuota | Igual, sin la cuota si no ve dinero. Solo existe si el super admin lo activó |

### 1.3 Zona del super administrador

| Pantalla | Ruta | Para qué |
|---|---|---|
| Panel general | `/admin/panel` | Proyectos activos, retrasos, pagos vencidos, tickets abiertos y lo que requiere atención |
| Clientes | `/admin/clientes` | Lista y crear empresa |
| Detalle de cliente | `/admin/clientes/:id` | Pausar, "ver como el cliente" (solo lectura, queda registrado), bloquear personas, historial |
| Detalle de proyecto | `/admin/proyectos/:empresa/:proyecto` | Editar los 13 hitos; un cambio de fecha pide motivo y lado (Websourcing o cliente) |
| Bandeja de aprobaciones | `/admin/aprobaciones` | Esperando tu revisión (publicar), cambios pedidos, aprobado (reabrir con motivo), publicadas |
| Finanzas | `/admin/finanzas` | Confirmar o rechazar comprobantes, registrar abonos, ingresos por mes y por cliente, subir facturas |
| Tickets de todos | `/admin/tickets` y `/admin/tickets/:id` | Filtros por cliente, prioridad y estado; semáforo; responder por área, nota interna, horas, decisión en solicitudes de cambio |
| Mantenimiento | `/admin/mantenimiento` y `/admin/mantenimiento/:id` | Activar o apagar por empresa; configurar plan, bolsa, tiempos, qué incluye; historial de cambios; aprobar horas |
| Registro de actividad | `/admin/registro` | Quién, qué, cuándo, empresa e IP; búsqueda |

### 1.4 Estados especiales

Vacío, cargando y error se aplican a cualquier pantalla de datos desde **Opciones → Estado de la pantalla**. "Sin permiso" aparece solo (equipo en Dinero y Mi equipo; cliente que entra a `/admin/...`). "Empresa pausada" se activa en Opciones o desde el detalle del cliente (Servicios Demo ya viene pausada).

## 2. Recorridos por rol

**Super administrador:** entra con contraseña y código → Panel general → ve un pago vencido y un comprobante por confirmar → Finanzas: confirma → Bandeja: publica el Sprint 3 al cliente → Proyecto: mueve una fecha con motivo y lado → Tickets: responde firmando como el área → Mantenimiento: activa y configura una empresa → Registro: verifica que todo quedó anotado.

**Administrador del cliente:** invitación → activa cuenta y código → Inicio: ve el aviso "tienes una revisión" y lo que falta de su lado → Revisiones: "apruebo" o "pido cambios" → Dinero: sube el comprobante del pago vencido (queda "en revisión") → Tickets: crea un error o solicitud de cambio y luego acepta la cotización → Documentos: sube el catálogo y las fotos → Mi equipo: invita a alguien y enciende "ver dinero" → Mi plan de mantenimiento: revisa horas usadas.

**Equipo del cliente:** invitación → Inicio (avance y línea de tiempo, sin dinero) → Revisiones (solo lectura si no puede aprobar) → Tickets: crea y sigue los suyos → Documentos: ve lo compartido.

## 3. Sistema de diseño

Todo está en variables (tokens) en `app/globals.css` y se conecta a Tailwind en `tailwind.config.ts`. Ninguna pantalla usa colores sueltos. Cada propuesta es un tema: A es `data-theme="light"`; B es el tema por defecto del archivo (oscuro).

| Token | A Clara | B Oscura |
|---|---|---|
| Fondo | #F3F4F6 | #050608 |
| Tarjeta | #FFFFFF | #0D1015 |
| Tarjeta interna | #F5F6F8 | #151A22 |
| Texto | #0D1015 | #F4F6F8 |
| Texto secundario | #576170 | #9AA4B2 |
| Verde de marca (relleno de botones) | #99F100, texto #0D1015 | #99F100, texto #0D1015 |
| Texto de acento | negro (nunca verde sobre blanco) | #99F100 |
| Esquinas de tarjeta | 24 px | 16 px |
| Sombra de tarjeta | suave y amplia | borde fino |

- **Tipografía:** Poppins (500, 600, 700) para títulos e Inter para texto, con `next/font`. Tamaños: títulos grandes fluidos (`display-xl`, `display-lg`, `display-md`) y 15 px para texto.
- **Espacios:** gutter de 16 px en celular, 24 px en tableta y 32 px en computador. Menú lateral en computador (1024 px o más) y menú desplegable en celular.
- **Componentes (shadcn/ui):** botón (6 variantes, 4 tamaños), tarjeta, campo de texto, texto largo, lista, casilla, interruptor, ventana (diálogo y menú lateral), tabla (con scroll lateral solo dentro de su caja), alerta (4 tonos), insignia (6 tonos), barra de progreso, pestañas.
- **Componentes propios del portal:** línea de tiempo de hitos, insignias de estado (hito, pago, revisión, ticket, prioridad, lado del retraso), semáforo de tiempo de respuesta (verde, amarillo, rojo, gris), tarjeta de cifra, estados vacío, cargando, error, sin permiso y empresa pausada.
- **Accesibilidad:** contraste AA verificado con una revisión automática en ambas propuestas (computador y celular) en las pantallas principales; foco visible; los íconos van acompañados de texto.
- La pantalla `/sistema-de-diseno` muestra todo lo anterior en vivo.

## 4. Limitaciones y pendientes

- Datos solo en memoria: al recargar vuelve todo al inicio. No hay Supabase, correos ni descargas reales.
- Las rutas usan `#` para que el sitio exportado funcione en cualquier carpeta; en la aplicación real serán rutas normales.
- Pendiente del dueño: elegir propuesta A o B, enviar 3 a 5 apps de referencia, y aprobar el control 3. Hasta que el cliente apruebe, todo cambio es una solicitud de cambio.
- Figma: no se ha pasado a Figma porque el cliente (interno) no lo exige.
