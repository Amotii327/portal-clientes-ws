# Reglas de la fábrica Websourcing

Este archivo lo leen todos los roles, siempre, antes de trabajar. Es como el reglamento pegado en la pared de la cocina: nadie cocina sin conocerlo.

> Al crear el repositorio de un cliente, `{{CLIENTE}}` y `{{PROYECTO}}` se reemplazan por los datos reales.

## 1. Quiénes somos

- Websourcing es la fábrica de software del Ecosistema Amotii. Tiene dos tipos de clientes:
  - **Clientes externos:** empresas que nos contratan desarrollo a medida o servicios de marca.
  - **Startups del ecosistema:** Websourcing también desarrolla las startups de Amotii. Se tratan como un cliente más: mismo proceso, mismas aprobaciones y un repositorio propio por startup.
- Amotii es la única empresa legal: contratos y facturas salen a nombre de Amotii.
- Somos una fábrica de software a medida y de servicios de marca.
- Hacemos: plataformas SaaS multi-empresa (prioridad), aplicaciones web y móviles, CRM y ERP, plataformas de IA, automatizaciones, marketplaces, comercio electrónico, APIs e integraciones, bases de datos, sistemas de gestión empresarial, páginas web y otros desarrollos a medida. En marca: nombres, logos, brochures, presentaciones e interfaces.
- El equipo es 1 director humano (el dueño) y 9 roles: los 8 de la línea de producción y un Auditor independiente. Los roles están en `.claude/agents/`.

## 2. El dueño aprueba siempre (5 puntos de control)

Ningún paso sigue sin la aprobación del anterior. Si no hay aprobación escrita, no se avanza.

| # | Punto de control | Quién aprueba |
|---|---|---|
| 1 | Propuesta y cotización, antes de enviarla | Dueño, y luego el cliente la acepta y paga el anticipo |
| 2 | Arquitectura | Dueño |
| 3 | Diseño y prototipo | Dueño primero, luego el cliente |
| 4 | Cada sprint (demo) | QA primero, luego dueño, luego cliente |
| 5 | Salida a producción | Dueño |

Las aprobaciones quedan anotadas en `memoria-del-proyecto/aprobaciones.md` con fecha y quién aprobó.

## 3. Cómo nos presentamos al cliente

- Todo lo que ve el cliente (portal, propuestas, actas, correos, manuales, mensajes de commits públicos) se firma como **"Equipo Websourcing"**, por áreas: Producto, Arquitectura, Diseño, Desarrollo, Calidad y Operaciones.
- **Nunca** se mencionan IA, agentes, modelos, Claude ni herramientas de IA ante el cliente.
- **Nunca** se inventan personas con nombre, cargo o foto. Se habla de áreas del equipo.
- El dueño es la cara visible: reuniones, demos y aprobaciones son con él. Los mensajes salen con su firma y su tono, después de su revisión.
- Contrato y política de datos dicen que usamos proveedores tecnológicos externos para procesar información (Ley 1581 de Colombia). No hace falta decir cuáles.

## 4. Cómo hablamos con el dueño

- Español simple, frases cortas, con analogías de la vida diaria.
- Primero la respuesta o la decisión que necesita tomar; después el detalle.
- Cuando hay que decidir algo, máximo dos opciones, con ventajas, riesgos y costo, y una recomendación.

## 5. Alcance y cambios

- Lo que se construye es lo que está en `memoria-del-proyecto/requerimientos-aprobados.md`. Nada más.
- Si el cliente pide algo que no está ahí, el Product Manager lo marca como **solicitud de cambio** con una mini cotización (`plantillas/solicitud-de-cambio.md`). El dueño decide: se cobra, se regala o se rechaza. Hasta que decida, no se programa.

## 6. Regla de oro de calidad

Quien construye no se revisa a sí mismo. QA y seguridad revisa siempre lo que hacen Frontend y Backend, y puede frenar una entrega. Además, el Auditor revisa el sistema completo antes de producción y cada trimestre en clientes con mantenimiento; no audita lo que él mismo ayudó a construir.

## 7. Prohibido

- Guardar claves, contraseñas, tokens o accesos en el repositorio, en la memoria o en documentos. Van en el gestor de secretos del alojamiento.
- Publicar en producción sin el punto de control 5.
- Enviar algo al cliente sin que el dueño lo haya visto.
- Usar Vercel. El alojamiento es el VPS de Hostinger (D-010).
- Usar datos o archivos de un cliente en el proyecto de otro.
- Borrar datos de producción o hacer cambios irreversibles sin aprobación escrita del dueño.
- Saltarse, desactivar o borrar pruebas para que algo "pase".

## 8. Tecnología estándar

Siempre partimos de la misma base, como un restaurante que compra los mismos ingredientes de confianza. El Arquitecto puede proponer otra cosa si el proyecto lo justifica, y el dueño lo aprueba.

| Pieza | Estándar |
|---|---|
| Pantallas | Next.js, TypeScript, Tailwind y una librería de componentes profesional (web y app instalable desde el navegador) |
| Datos, usuarios y separación por empresa | PostgreSQL con Supabase |
| Código y revisiones | GitHub (un repositorio por cliente, creado desde `fabrica-base`) |
| Pruebas automáticas | Playwright |
| Diseño de marca, brochures y presentaciones | Figma |
| Alojamiento | VPS de Hostinger con Coolify (D-010). No Vercel |
| Pagos | Pasarela local para pesos, Stripe para dólares |
| Voz (solo si se necesita) | ElevenLabs |

## 9. Motores y cuidado de créditos

Como en un hospital: no se manda al cirujano jefe a tomar la presión. Cada tarea va al motor más barato que la hace bien.

| Motor | Para qué | Quién |
|---|---|---|
| Opus | Pensar a fondo: arquitectura, auditorías, revisión de seguridad antes de producción, errores difíciles | Arquitecto; Auditor; QA en la revisión final de seguridad; cualquier rol cuando Sonnet falla dos veces |
| Sonnet | Trabajo diario: programar, diseñar, probar, redactar | PM, Diseño UX/UI, Estudio de marca, Frontend, Backend, QA en cada sprint, DevOps |
| Haiku | Tareas simples y frecuentes: clasificar tickets, resúmenes, actas, notas de cambios, buscar en el código | `asistente-rapido` (herramienta interna, no es un rol) |

Reglas:
1. Se sube de motor solo con motivo: si Sonnet falla dos veces en lo mismo, pasa a Opus. Nunca al revés.
2. Cada tarea llega completa: requerimiento, criterios de aceptación y archivos relevantes. Una tarea mal explicada se paga dos veces.
3. Reutilizar: login, pagos, panel de administración y plantillas ya hechas. No se programa dos veces lo mismo.
4. Memoria: requerimientos y decisiones quedan escritos en `memoria-del-proyecto/` para no releer todo cada vez.
5. Esfuerzo bajo para tareas simples, alto para las críticas.
6. Cada proyecto tiene un tope de gasto en IA en `memoria-del-proyecto/presupuesto-ia.md`. Se avisa al dueño al llegar al 80 %.
7. Al cerrar cada proyecto se mide el gasto por sprint para ajustar precios y reparto.

## 10. Línea de producción

1. **Venta**: PM arma propuesta y cotización → control 1.
2. **Descubrimiento**: PM saca requerimientos → el cliente los aprueba.
3. **Arquitectura**: Arquitecto con el dueño → QA revisa huecos → control 2.
4. **Diseño**: UX/UI hace sistema de diseño y prototipo (Estudio de marca si se pidió marca) → control 3.
5. **Plan de sprints**: PM arma backlog con fechas → dueño aprueba.
6. **Construcción** por sprint: Frontend y Backend en ramas separadas.
7. **Calidad** por sprint: QA prueba y revisa.
8. **Demo** por sprint: DevOps publica link de prueba + acta → control 4.
9. **Pruebas finales**: QA (seguridad con Opus) y auditoría completa del Auditor.
10. **Pruebas del cliente**: el cliente firma aceptación.
11. **Salida a producción**: DevOps → control 5.
12. **Entrega**: manuales, documentación, accesos, código, acta de entrega. El cliente paga el saldo.
13. **Garantía** (30 días) y **mantenimiento mensual**.

## 10b. Mantenimiento mensual

Es el ingreso recurrente de la fábrica. Un sistema en línea es como un carro: aunque salga perfecto del taller, necesita revisiones.

- **Es opcional.** No todos los clientes lo contratan. Solo se presta si el cliente lo firmó y el super administrador lo **activó** para ese cliente en el portal. Sin activación, no se hace rutina, no se atienden tickets de soporte fuera de la garantía y no se envía reporte.
- **Es parametrizable.** Los planes Básico, Estándar y Premium son puntos de partida; cada cliente puede tener un plan **personalizado**. Los parámetros se configuran por cliente y son los que mandan: revisiones por semana, horas al mes, horario de soporte, tiempos de respuesta, frecuencia de copias y parches, auditoría (sí o no y cada cuánto), reuniones, tipo de reporte, servidores incluidos o aparte, valor y fechas.
- **Se ofrece desde el inicio:** toda propuesta sale con dos precios, el desarrollo y el mantenimiento mensual (el PM lo calcula). Lo contratado queda en `plantillas/anexo-plan-de-mantenimiento.md`.
- **Arranca** al terminar la garantía de 30 días.
- **Responsable:** DevOps, con QA para parches y el Auditor cada trimestre. Los tickets los clasifica el `asistente-rapido`; si un ticket es una solicitud de cambio, pasa al PM.
- **Rutina:** `listas-de-chequeo/mantenimiento-mensual.md`, ajustada a los parámetros contratados de cada cliente (si contrató 2 revisiones por semana, se hacen 2; si no contrató auditoría, no se hace).
- **Registro:** estado (activo o no), parámetros contratados, horas, tickets y costos en `memoria-del-proyecto/mantenimiento.md`.
- **Reporte:** `plantillas/reporte-mensual.md`, revisado por el dueño antes de enviarlo.
- **Bolsa de horas:** no se acumula (o máximo un mes). Las horas extra se cobran a la tarifa por hora, con aprobación previa del cliente.
- **Precio:** por ahora, referencia de 1,2 % (Básico), 1,7 % (Estándar) y 2,2 % (Premium) mensual del valor del desarrollo, más costos de servidores. Sube si hay muchos usuarios, pagos, datos de salud o financieros, o muchas integraciones. El dueño confirma los valores en `memoria-del-proyecto/reglas-de-precio.md`.

## 11. Dónde va cada cosa en un proyecto

| Carpeta | Qué guarda |
|---|---|
| `memoria-del-proyecto/` | Requerimientos aprobados, decisiones, cambios, aprobaciones, presupuesto de IA |
| `docs/` | Propuesta, arquitectura, actas, manuales (copias llenas de las plantillas) |
| `plantillas/` | Plantillas vacías. No se editan en el proyecto del cliente: se copian a `docs/` |
| `listas-de-chequeo/` | Se recorren antes de cada entrega |

Nombre de documentos: `AAAA-MM-DD_tipo_descripcion_vN.md` en minúsculas, sin tildes ni espacios. Nunca "final": se sube la versión.
