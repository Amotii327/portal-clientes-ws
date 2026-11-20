# fabrica-base

La carpeta plantilla de la fábrica Websourcing. Es como la receta maestra de una cadena de restaurantes: cada sede (cada cliente) recibe una copia y cocina igual.

Cada proyecto de cliente nace como una copia de este repositorio. Ahí se llenan las plantillas y la memoria del proyecto; las reglas y los roles vienen ya listos.

## Qué hay adentro

| Carpeta o archivo | Qué es, en simple |
|---|---|
| `CLAUDE.md` | El reglamento de la fábrica. Todos los roles lo leen siempre: cómo se trabaja, qué está prohibido, cuándo hay que pedir aprobación al dueño, qué motor usa cada uno |
| `.claude/agents/` | Los 9 roles, un archivo por rol con su misión, pasos, lista de chequeo y entrega, más un ayudante rápido para tareas simples |
| `plantillas/` | Propuesta, cotización, requerimientos, arquitectura, solicitud de cambio, acta de sprint, informe de pruebas, acta de entrega, manuales, documentación técnica, reporte mensual, anexo del plan de mantenimiento e informe de auditoría |
| `listas-de-chequeo/` | Inicio de proyecto, revisión de pantallas, cierre de sprint, salida a producción, rutina de mantenimiento, auditoría y antes de enviar al cliente |
| `memoria-del-proyecto/` | El cuaderno de cada cliente: requerimientos aprobados, decisiones, cambios, aprobaciones, presupuesto de IA, mantenimiento y reglas de precio |

## Los 9 roles y su motor

| # | Rol | Área ante el cliente | Motor |
|---|---|---|---|
| 1 | Product Manager | Producto | Sonnet |
| 2 | Arquitecto | Arquitectura | Opus |
| 3 | Diseñador UX/UI | Diseño | Sonnet |
| 4 | Estudio de marca | Diseño | Sonnet |
| 5 | Frontend | Desarrollo | Sonnet |
| 6 | Backend | Desarrollo | Sonnet |
| 7 | QA y seguridad | Calidad | Sonnet por sprint, Opus antes de producción |
| 8 | DevOps | Operaciones | Sonnet |
| 9 | Auditor (independiente) | Calidad | Opus |
| – | Asistente rápido (herramienta, no rol) | – | Haiku |

## Cómo arrancar un proyecto
1. Crear el repositorio del cliente con "Use this template" desde `fabrica-base`.
2. Reemplazar `{{CLIENTE}}` y `{{PROYECTO}}`.
3. Recorrer `listas-de-chequeo/inicio-de-proyecto.md`.

## Pendientes antes del piloto
- Reglas de precio en `memoria-del-proyecto/reglas-de-precio.md`.
- Alojamiento (no Vercel).
- Crear la organización y este repositorio en GitHub.

## Prototipo del portal (etapa de diseño)

Prototipo navegable con datos de ejemplo (sin base de datos ni claves).

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # genera la página estática en out/ (se puede subir a cualquier carpeta)
```

Para verlo sin servidor, abre `out/index.html`. Mapa de pantallas: `docs/2026-11-20_diseno_mapa-de-pantallas_v1.md`.
