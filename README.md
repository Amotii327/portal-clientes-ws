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

## Backend (sprint 1)

Base de datos en `supabase/` (migraciones versionadas, reglas por empresa y pruebas). Quién puede qué: `docs/matriz-permisos.md`. Qué debe usar cada pantalla: `docs/2026-11-23_nota_backend-para-frontend_v1.md`.

- Pruebas de base de datos: `npm run test:db` (PostgreSQL local temporal + pgTAP; con Docker y la CLI de Supabase, el equivalente es `supabase db reset && supabase test db`).
- Variables de entorno: copiar `.env.example` a `.env.local` (nunca se sube al repositorio).
- **Primer super admin (a mano, una sola vez).** El registro está cerrado: solo se crea cuenta con una invitación vigente. Para el primero: (1) en el panel de Supabase, Authentication > Users > Add user, con el correo del dueño y correo confirmado (si el gancho de registro bloquea esa creación, apagarlo un momento en Authentication > Hooks); (2) en el editor SQL: `insert into public.perfiles (user_id, nombre, correo) values ('<id>', '<nombre>', '<correo en minusculas>'); insert into public.super_admins (user_id) values ('<id>');`; (3) entrar y activar el código del celular (2FA): sin él no tiene ningún permiso; (4) guardar los códigos de respaldo fuera del portal; (5) volver a encender el gancho. Ver `listas-de-chequeo/salida-a-produccion.md`.
- App con servidor (necesaria para el middleware de sesión): `npm run build:servidor` y `npm start`. `npm run build` sigue exportando el prototipo.
