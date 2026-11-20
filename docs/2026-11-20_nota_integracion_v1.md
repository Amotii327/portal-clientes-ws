# Nota de integración (sprints 3, 4, 5 y SC-5 en la rama `integracion`)

**Equipo Websourcing · Desarrollo.** Uso interno. Sin push: nada de esto está en `main` ni toca Supabase.

## 1. Qué se unió

Con `git merge` (sin rebase), en este orden: `s3-revisiones-docs`, `s4-dinero`, `s5-tickets-mant`; después se volvieron a unir los commits de Calidad (`ea284f5`, `3499822`, `16e29ce`) y la solicitud de cambio 5 (ahorro de espacio, `710d135`) con la decisión D-021 (archivo externo = disco del VPS de Hostinger).

## 2. Conflictos y cómo se resolvieron

| Conflicto | Solución |
|---|---|
| Conteo de tablas en `01_estructura` | Se puso la suma real: 50 tablas. |
| `panel_super_admin()` e `inicio_cliente()` definidos por tres módulos | Migración de integración `20270120000200`: una sola definición con `pagos_vencidos`, `comprobantes_en_revision` y `tickets_abiertos` (estado distinto de cerrado). |
| Dos colas de correo (`outbox_correos` y `avisos_salientes`) | Una sola cola `avisos_salientes` (migración `20270120000100`): solo identificadores, tipo y referencia; nunca texto libre del cliente. Los triggers de dinero y tickets usan el ayudante `private.encolar_correo`. Pruebas 15, 30, 33, 35, 37, 40 y 41 a 49 ajustadas. |
| Dos simulados de Storage | Queda uno solo (`mock_supabase.sql`); se borró `mock_extra_storage_tickets.sql`. `ayudas_dinero.sql` inserta el objeto de Storage real. |
| Tipos | `lib/supabase/database.types.ts` junta los tres; los `tipos-*.ts` por módulo solo re-exportan. |
| Acciones y errores | `lib/portal/acciones.ts` y `lib/portal/errores.ts` unidos (los de cada módulo re-exportan). |
| Matrices de permisos | Fundidas en `docs/matriz-permisos.md`; se borraron las tres por módulo. |
| Frontend (`components/`, `app/`, `screens/`) | No hubo conflictos que resolver. Solo se tocaron `components/portal/entrada.tsx` y `activar.tsx` para llamar a la acción de entrar del servidor (ver 3c). |

## 3. Sprint 6 hecho

a. **Despachador de avisos** (`lib/servidor/avisos/`): llave de sistema solo en `sistema.ts`; plantillas en español firmadas "Equipo Websourcing"; Resend si existe `RESEND_API_KEY`, si no quedan en `pendiente_sin_proveedor`; reintentos con espera (5), reclamo con `for update skip locked` y arrendamiento de 10 minutos; marcas de enviado y error (solo códigos, nunca texto del proveedor). Los destinatarios se resuelven al enviar. Cubre invitación (token solo en el servidor), recuperar contraseña, revisiones pendientes, comprobantes, recordatorios de pago, tickets y aviso de bolsa al 80 %.
b. **Rutas de cron** protegidas con secreto en variable de entorno: `/api/avisos/despachar` y `/api/tareas/diarias`. `service_role` tiene solo select y update de seis columnas sobre la cola; la prueba 01 se ajustó solo para esa tabla.
c. **Freno de 5 intentos (plan B)** en el servidor: `entrarServidor` consulta y anota con `freno_acceso_consultar/anotar` antes y después de `signInWithPassword`; mantiene el código `cuenta_frenada_temporalmente` (`lib/app/auth-errores.ts`). En producción sin llave de sistema, la entrada se cierra (no queda sin freno). Prueba Playwright nueva en `tests/e2e/entrada.spec.ts` y simulado ampliado.
d. **SC-5 ahorro de espacio** (`20270120000400`): cuota por empresa (1 GB por defecto, la cambia el super admin, aviso al 80 %, bloqueo al 100 %, cuenta todos los buckets; política restrictiva en `storage.objects`); videos de ticket hasta 20 MB o enlace; registro de archivados con función que marca los de proyectos cerrados hace más de 30 días; resumen del registro de actividad a 12 meses (mantiene la regla de solo agregar); interruptor `videos_a_archivo_externo` apagado. Traslado real: `scripts/archivo-externo-hostinger.sh`, **sin ejecutar**, mismo diseño que la copia diaria (frenos, retención por carpeta, `BORRAR_DE_SUPABASE=0`).
e. Avisos de revisiones (`20270120000500`) y recordatorios de revisiones.

## 4. Verificación

- `npm run test:db`: todo en verde ("TODO BIEN"), con concurrencia, reversa (rollback) y re-aplicación. Pruebas nuevas: 50 (cola única y freno), 51 (ahorro de espacio), 52 (avisos de revisiones).
- `npx tsc --noEmit`: limpio al momento de cerrar esta nota.
- Playwright (`entrada.spec.ts`, incluida la prueba del freno): ver el informe de entrega.

## 5. Lo que falta

1. **Resend real**: falta la cuenta, el dominio verificado y los valores de `RESEND_API_KEY`, `CORREO_REMITENTE`, `CRON_SECRETO` y `SUPABASE_SERVICE_ROLE_KEY` en el gestor de secretos (Coolify). Hasta entonces los avisos quedan `pendiente_sin_proveedor`.
2. **Programar el cron** en el VPS (despachar cada pocos minutos, tareas diarias una vez al día).
3. **VPS de Hostinger**: preparar el disco y la configuración de rclone para el script de archivo; después encender `videos_a_archivo_externo`. Probar el script primero con `BORRAR_DE_SUPABASE=0`. Borrar de Supabase exige aprobación escrita del dueño.
4. **Límite del freno**: quien llame a Auth directo se salta el freno del servidor. Conviene encender el gancho de Auth si el plan lo permite.
5. **Revisión de QA y seguridad** de esta rama (quien construyó no se revisa) y del Auditor antes de producción; punto de control 4 y 5 del dueño.
6. **Pantallas de Frontend** para: cuota de espacio, archivados y enlace de video en tickets (los tipos y acciones ya están en `lib/portal/`).
7. **Pruebas de navegador** del resto de pantallas con el simulado: solo se ejecutó la de entrada/freno desde Backend.
8. Antes de subir a `main`: un push a `main` aplica migraciones a Supabase por `.github/workflows/base-de-datos.yml`; requiere la aprobación del dueño.
