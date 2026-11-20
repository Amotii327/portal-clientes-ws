# Requerimientos · Portal de clientes Websourcing

**Equipo Websourcing · Producto** · Versión v1 · Estado: borrador para revisión del dueño (2026-11-20)

> Proyecto interno: Websourcing es el cliente de sí misma. Por eso el dueño aprueba como dueño y como cliente.
> Fuentes: documento 3 "Portal de clientes: niveles de acceso, tickets y línea de tiempo" y el archivo de traspaso.

## 1. Objetivo del negocio

Hoy el seguimiento con cada cliente va por correo, WhatsApp y llamadas. El portal es la "vitrina de seguimiento" de cada proyecto, como el rastreo de un paquete: el cliente entra y ve en qué va, qué tiene que aprobar, cuánto ha pagado y qué ha pedido, sin preguntar.

**Cómo sabremos que funcionó (a los 3 meses de uso):**
- El 100 % de los proyectos activos tiene su línea de tiempo al día en el portal.
- Las aprobaciones de sprint y diseño quedan registradas en el portal (no por chat).
- Toda solicitud del cliente entra como ticket, con su primera respuesta dentro del tiempo pactado.
- El dueño dedica menos tiempo a "¿en qué va mi proyecto?" (meta: pocas o ninguna pregunta de ese tipo por fuera del portal).

## 2. Usuarios y roles

Como un edificio: el dueño tiene la llave maestra, cada cliente tiene la llave de su apartamento y decide a quién de su equipo le da copia y de qué puertas.

| Rol | Quién es | Qué puede hacer | Qué no puede hacer |
|---|---|---|---|
| Super administrador | El dueño de Websourcing | Ver y manejar todo, de todos los clientes. Crear clientes, proyectos, hitos, sprints, pagos, documentos. Responder tickets. Configurar marca y plantillas. Entrar en modo "ver como el cliente" | Aprobar en nombre del cliente |
| Administrador del cliente | Dueño o gerente de la empresa cliente | Ver todo lo de su empresa, incluido el dinero. Aprobar sprints y diseños. Crear y ver todos los tickets de su empresa. Invitar y quitar usuarios de su equipo y decidir qué ve cada uno. Ver documentos. Editar datos de facturación | Ver otras empresas. Cambiar fechas, pagos o documentos subidos por Websourcing |
| Equipo del cliente | Empleados que invita el administrador | Por defecto: ver avance y revisiones, crear tickets y ver los suyos. Con permiso del admin: aprobar, ver dinero, ver todos los tickets de la empresa, ver documentos compartidos | Invitar usuarios. Ver dinero o aprobar si el admin no lo permite |

**Permisos que el admin del cliente puede encender o apagar a cada miembro de su equipo:**
1. Aprobar sprints y diseños.
2. Ver contrato, pagos y facturas.
3. Ver todos los tickets de la empresa (si no, solo los suyos).
4. Ver cada documento (se comparte documento por documento).

## 3. Empresas (multi-empresa)

- Solo el super administrador crea una empresa cliente: nombre, razón social, NIT, correo de facturas, logo opcional, y su primer administrador (correo). El sistema le envía la invitación.
- Una empresa puede tener uno o varios proyectos.
- Todo lo de una empresa (proyectos, pagos, tickets, documentos, usuarios, historial) es **solo suyo**. Ningún usuario de una empresa puede ver datos de otra, ni por error ni cambiando un enlace. Es la regla más importante del portal.
- Lo único compartido es la marca de Websourcing (logo, colores, dominio) y los textos fijos del portal.
- El super administrador puede **pausar** una empresa: sus usuarios no pueden entrar y ven un mensaje amable. Nada se borra.

## 4. Módulos y funciones (versión 1)

Prioridades: **imprescindible** = sin esto no sale la v1 · **importante** = entra en v1 si no la retrasa · **deseable** = solo si sobra tiempo.

### Módulo 1: Entrada segura y usuarios
- **Historia:** Como usuario invitado quiero activar mi cuenta desde un correo y entrar con usuario y contraseña para ver mi proyecto de forma segura.
- **Criterios de aceptación:**
  - Dado que recibí una invitación, cuando abro el enlace, entonces creo mi contraseña y quedo dentro de mi empresa. El enlace vence a los 7 días.
  - Dado que olvidé mi contraseña, cuando la pido, entonces recibo un correo para cambiarla sin ayuda de nadie.
  - Dado que fallo la contraseña 5 veces seguidas, entonces la cuenta se frena 15 minutos.
  - Dado que soy super administrador, entonces debo usar además un código de un solo uso (correo o aplicación) al entrar.
- Prioridad: imprescindible
- **Historia:** Como admin del cliente quiero invitar y quitar personas de mi equipo y decidir qué ve cada una.
- **Criterios de aceptación:**
  - Dado que invito a alguien, cuando acepta, entonces entra como "Equipo del cliente" con los permisos por defecto.
  - Dado que quito a alguien, entonces pierde el acceso de inmediato y su historial se conserva.
  - Dado que enciendo "ver dinero" a un miembro, entonces en su próxima pantalla ve el módulo Dinero.
- Prioridad: imprescindible
- Código de verificación por correo para todos los usuarios (no solo el super admin): importante.

### Módulo 2: Línea de tiempo del proyecto (pantalla de inicio)
Es lo primero que ve el cliente al entrar.
- **Historia:** Como cliente quiero ver el recorrido completo de mi proyecto para saber en qué va y qué sigue.
- **Criterios de aceptación:**
  - Dado un proyecto nuevo, cuando el super admin lo crea, entonces nace con los 13 hitos estándar (ver Reglas, sección 5.1), que el super admin puede ajustar en fechas y nombre.
  - Cada hito muestra: estado (pendiente, en curso, esperando tu aprobación, terminado), fecha planeada, fecha real y el pago asociado si lo tiene.
  - Dado que un hito se retrasa, cuando el super admin cambia la fecha, entonces debe escribir el motivo y elegir si el retraso es "por Websourcing" o "esperando al cliente". El cliente ve la nueva fecha, el motivo y, si es su lado, un aviso claro de qué falta.
  - Se ve el porcentaje de avance, el sprint actual y la fecha de la próxima demo.
- Prioridad: imprescindible

### Módulo 3: Revisiones y aprobaciones
- **Historia:** Como admin del cliente quiero revisar cada sprint y el diseño con un link de prueba o video y decir "apruebo" o "pido cambios".
- **Criterios de aceptación:**
  - Dado que Websourcing publica una revisión (sprint o diseño) con link de prueba o video y acta, entonces el hito pasa a "esperando tu aprobación" y se avisa por correo a quienes pueden aprobar.
  - Dado que apruebo, entonces queda registrado quién, cuándo y qué versión, y el hito avanza.
  - Dado que pido cambios, entonces debo escribir qué cambiar (texto y opcionalmente una captura), y queda abierto para el dueño.
  - Una aprobación no se puede deshacer desde el portal; solo el super admin puede reabrir una revisión, y queda en el historial.
- Prioridad: imprescindible
- **Historia:** Como super admin quiero ver en una bandeja qué aprobó cada cliente, qué pidió cambiar y qué espera mi revisión.
- **Criterios de aceptación:** Dado que entro a la bandeja, entonces veo tres listas (aprobado, cambios pedidos, esperando a Websourcing) con filtros por cliente.
- Prioridad: imprescindible

### Módulo 4: Dinero
- **Historia:** Como admin del cliente quiero ver el valor del contrato, lo que he pagado, el saldo y los próximos pagos.
- **Criterios de aceptación:**
  - Dado un contrato, entonces veo: valor total, plan de pagos (con su hito asociado), abonos con fecha, saldo y próximos pagos con fecha de vencimiento.
  - Dado que el super admin registra un abono, entonces el saldo se recalcula solo.
  - Dado que un pago está vencido, entonces lo veo marcado y el super admin lo ve en su panel.
  - Puedo descargar las facturas que Websourcing suba (PDF). Las facturas salen a nombre de Amotii.
  - Puedo ver y editar los datos de facturación (razón social, NIT, correo de facturas).
- Prioridad: imprescindible
- Recordatorio automático por correo 3 días antes de cada pago y el día en que vence: importante.
- **No incluye** pago en línea (va en la versión 2).

### Módulo 5: Tickets
- **Historia:** Como cliente quiero crear una solicitud y seguir su avance hasta que se cierre.
- **Criterios de aceptación:**
  - Dado que creo un ticket, entonces elijo el tipo (error, solicitud de cambio, pregunta, acceso), escribo el detalle y puedo adjuntar pantallazo o video (máx. 50 MB) o audio.
  - El ticket recorre los estados: nuevo → clasificado → en progreso → esperando al cliente → resuelto → cerrado (ver Reglas, sección 5.3).
  - Dado que el ticket se resuelve, entonces veo qué se hizo y puedo confirmarlo; si no respondo en 3 días se cierra solo. Al cerrar puedo calificar la atención de 1 a 5.
  - Dado que soy del equipo del cliente, entonces veo solo mis tickets, salvo que el admin me dé permiso de ver todos.
  - Dado que es una "solicitud de cambio", entonces no se trabaja hasta que el dueño decida (cobrar, regalar o rechazar) y, si se cobra, el admin del cliente la acepte.
- Prioridad: imprescindible
- **Historia:** Como super admin quiero ver todos los tickets de todos los clientes con filtros por cliente, prioridad y estado, y el tiempo que falta para la primera respuesta.
- **Criterios de aceptación:** Dado un ticket urgente nuevo, entonces me llega un aviso por correo de inmediato. Cada ticket muestra un semáforo de tiempo de respuesta.
- Prioridad: imprescindible
- Aviso por correo al cliente en cada cambio de estado: importante.

### Módulo 6: Documentos
- **Historia:** Como cliente quiero encontrar en un solo lugar el contrato, la propuesta, los requerimientos, las actas, los manuales y los entregables.
- **Criterios de aceptación:**
  - Dado que el super admin sube un documento, entonces elige categoría (contrato, propuesta, requerimientos, arquitectura, acta, manual, entregable, otro) y si lo ve todo el equipo o solo el admin del cliente.
  - Los documentos se descargan con un enlace que vence (no quedan públicos en internet).
  - Cada documento conserva sus versiones (v1, v2...), nunca se reemplaza en silencio.
- Prioridad: imprescindible
- **Accesos (usuarios y claves de los sistemas entregados):** el portal **no guarda claves**. Solo muestra una nota con instrucciones de cómo se entregan (por ejemplo, por un gestor de claves). Ver Lo que no entra.

### Módulo 7: Zona del super administrador
- Panel general: proyectos activos, avance, retrasos, pagos vencidos y tickets abiertos. Prioridad: imprescindible.
- Clientes: crear, editar y pausar empresas; ver su historial; modo "ver como el cliente" (solo lectura, queda en el registro). Prioridad: imprescindible.
- Proyectos: crear proyecto, editar hitos, sprints, entregables y links de prueba. Prioridad: imprescindible.
- Finanzas: contratos, plan de pagos, abonos, facturas e ingresos por mes y por cliente. Prioridad: importante (los ingresos por mes y cliente).
- Registro de todo lo que se hizo (quién, qué, cuándo) y bloqueo de un usuario. Prioridad: imprescindible.

### Módulo 8: Marca propia y presentación
- **Criterios de aceptación:**
  - Dado que entro al portal, entonces veo el logo, los colores y el dominio de Websourcing (por ejemplo `portal.websourcing...`, por definir).
  - Todos los mensajes, actas y respuestas aparecen firmados como "Equipo Websourcing · [área]" (Producto, Arquitectura, Diseño, Desarrollo, Calidad, Operaciones).
  - En ninguna pantalla, correo o archivo aparecen IA, agentes, modelos, herramientas ni personas inventadas.
  - Se ve bien en computador y celular, y se puede instalar como app desde el navegador.
- Prioridad: imprescindible (logo, colores y textos); el cambio de marca desde una pantalla de configuración: deseable (en v1 se puede fijar en la configuración del sistema).

### Módulo 9: Historial y notificaciones
- Historial por proyecto: qué se aprobó, cuándo y quién. Prioridad: imprescindible.
- Avisos por correo: nueva revisión, aprobación, pago próximo, respuesta de ticket. Prioridad: importante.
- Cada usuario elige qué avisos recibe por correo. Prioridad: deseable.

## 5. Reglas del negocio

### 5.1 Los 13 hitos estándar
| # | Hito | Pago asociado (configurable) |
|---|---|---|
| 1 | Inicio del proyecto | Anticipo |
| 2 | Descubrimiento | — |
| 3 | Requerimientos aprobados | — |
| 4 | Arquitectura | — |
| 5 | Diseño y prototipo | Segundo pago |
| 6 | Sprints (1, 2, 3...: uno o varios) | Pagos por sprint, si se pactó |
| 7 | Pruebas finales | — |
| 8 | Pruebas del cliente | — |
| 9 | Capacitación | — |
| 10 | Salida a producción | — |
| 11 | Entrega final | Saldo final |
| 12 | Garantía (30 días) | — |
| 13 | Mantenimiento | Cuota mensual |

- El porcentaje de avance se calcula por hitos terminados; los sprints pesan según su número (regla exacta: la propone Arquitectura y la aprueba el dueño).
- Los montos y porcentajes de cada pago **no los fija el portal**: los escribe el super admin por contrato. Las reglas de precio siguen pendientes del dueño.

### 5.2 Aprobaciones
- Pueden aprobar: el admin del cliente y los miembros con permiso de aprobar.
- Cada aprobación guarda: persona, fecha y hora, revisión aprobada y comentario.
- Los puntos de control internos de la fábrica (QA → dueño → cliente) se reflejan así: una revisión solo se publica al cliente cuando el super admin la marca como lista.

### 5.3 Tickets: tipos, prioridades y tiempos (ejemplo para ajustar)
| Prioridad | Cuándo | Primera respuesta |
|---|---|---|
| Urgente | La app está caída o no se puede vender o cobrar | 2 horas hábiles |
| Alta | Algo importante falla, pero se puede seguir trabajando | 1 día hábil |
| Normal | Errores menores, preguntas | 2 días hábiles |
| Baja | Ideas y mejoras | Siguiente planeación |

- El cliente propone la prioridad; Websourcing la confirma al clasificar.
- Horario hábil: por definir (pregunta pendiente).
- Los tiempos pueden variar por plan de mantenimiento; en v1 hay un solo juego de tiempos.
- Error dentro de la garantía o del plan de mantenimiento: sin costo. Solicitud de cambio: pasa por mini cotización.
- Cierre automático: 3 días después de "resuelto" sin respuesta del cliente.

### 5.4 Estados de un hito
Pendiente → En curso → Esperando tu aprobación → Terminado. Un retraso siempre lleva fecha nueva, motivo y lado (Websourcing o cliente).

## 6. Integraciones

| Sistema | Para qué | Quién da el acceso |
|---|---|---|
| Supabase (base de datos, usuarios y archivos) | Guardar la información, las cuentas y los documentos, separados por empresa | El dueño crea la cuenta |
| Servicio de correo transaccional (por definir) | Invitaciones, recuperar contraseña, avisos | El dueño |
| Alojamiento (por definir, no Vercel) | Publicar el portal | El dueño |
| GitHub | v1: ninguna conexión automática; el dueño pasa los pedidos aprobados a tareas con ayuda del equipo | — |

## 7. Datos que se manejan

- **Tipo:** normal + financiera (valores de contratos, pagos y facturas). No se guardan tarjetas ni datos bancarios.
- **Datos personales:** nombre, correo, celular opcional y empresa de cada usuario; datos de facturación (razón social, NIT, correo). Se tratan según la Ley 1581 de Colombia, con política de datos visible al activar la cuenta, que menciona el uso de proveedores tecnológicos externos.
- Los archivos adjuntos (capturas, videos, audios, documentos) son privados de cada empresa.
- Copias de seguridad diarias (detalle en arquitectura).

## 8. Lo que no entra (versión 1)

- Pago en línea (pasarela local o Stripe). Versión 2.
- Firma digital de propuestas y cambios. Versión 2 (en v1 se aceptan con un botón y queda registrado).
- Avisos por WhatsApp. Versión 2.
- Asistente de IA del proyecto, clasificación automática de tickets con IA y respuestas sugeridas. Versión 2 (en v1 el dueño clasifica).
- Módulo de Ventas (subir conversaciones, generar propuestas, saber si el cliente abrió la propuesta, convertirla en proyecto con un clic). Versión 2.
- Costos y rentabilidad por proyecto (gasto en IA y herramientas). Versión 2.
- Reportes avanzados (proyectos a tiempo, clientes más rentables, propuestas ganadas). Versión 2.
- Reporte mensual automático de tickets al cliente. Versión 2.
- Conexión automática portal → GitHub → equipo. Versión 2.
- Tiempos de respuesta distintos por plan de mantenimiento. Versión 2.
- Guardar claves o accesos de los sistemas entregados. Nunca: van en un gestor de secretos.
- Marca propia por cliente (que cada cliente vea el portal con su logo). No pedido.
- Facturación electrónica ante la DIAN desde el portal. No pedido: las facturas se suben ya hechas.

## 9. Preguntas pendientes

| Pregunta | Responsable | Fecha |
|---|---|---|
| ¿Cuál será el dominio del portal (por ejemplo portal.websourcing.co)? | Dueño | Antes de arquitectura |
| ¿Qué alojamiento usamos (no Vercel)? Arquitectura llevará 2 opciones con costo | Dueño + Arquitectura | En arquitectura |
| ¿Horario hábil para contar los tiempos de respuesta (ej. lunes a viernes, 8 a. m. a 6 p. m., hora Colombia)? | Dueño | Antes de arquitectura |
| ¿Los tiempos de respuesta del ejemplo quedan así para la v1? | Dueño | Antes de arquitectura |
| ¿En v1 basta con aceptar propuestas y cambios con un botón (sin firma digital)? | Dueño | Antes de arquitectura |
| ¿Logo y colores de Websourcing ya existen o los propone el Estudio de marca? | Dueño | Antes de diseño |
| ¿El primer cliente real que se cargará en el portal (para probar con datos reales)? | Dueño | Antes del sprint 1 |
| Reglas de precio y forma de pago estándar (anticipo, hitos, saldo) | Dueño | Antes de la primera venta |

## Aprobación
Aprobado por: ___ (dueño, como dueño y como cliente) · Fecha: ___
