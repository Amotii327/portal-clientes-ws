# Diseño · Copia diaria de archivos a Hostinger

**Equipo Websourcing · Desarrollo** · v1 · 2026-12-11. Uso interno. Estado: **diseño y script listos, SIN ejecutar** (todavía no hay VPS). Lo ejecuta y lo vigila Operaciones (DevOps). Decisión de origen: D-015; metas y retención: arquitectura v4, sección 7.

## 1. Por qué existe

Las copias diarias de Supabase Pro cubren la **base de datos**, pero **no los archivos** de Storage. Como un edificio con dos bodegas: la bodega de documentos del cliente necesita su propia copia, en otra casa. D-015: esa copia vive en el VPS de Hostinger, fuera de Supabase.

Metas (arquitectura v4): perder como máximo **24 horas** de archivos y volver a estar en línea en menos de **4 horas**. Retención: **30 días**.

## 2. Qué se copia

Los tres buckets privados del sprint 3: `documentos`, `archivos-empresa` y `capturas-revisiones`. Las rutas ya traen la empresa (`empresa_id/carpeta/uuid.ext`), así que la copia conserva la separación por empresa. Los nombres originales viven en la base (`documento_versiones`, `archivos_cliente`); la copia de la base los trae.

## 3. Cómo funciona (`scripts/copia-archivos-hostinger.sh`)

1. **Origen:** el protocolo S3 de Supabase Storage, con unas claves S3 creadas en el panel de Supabase para esto (solo lectura si el plan lo permite). No se usa la llave de sistema (`service_role`) del portal.
2. **Herramienta:** `rclone`, configurado **solo con variables de entorno** (nada en disco ni en el repositorio).
3. **Cifrado en reposo:** el destino es un remoto `crypt` de rclone: nombres de archivo y contenido cifrados en el disco del VPS. Las dos contraseñas viven en el gestor de secretos y **también en la bóveda del dueño** (sin ellas la copia no se puede abrir).
4. **Espejo + histórico:** `rclone sync` deja `espejo/<bucket>` igual al origen; lo que cambia o desaparece va a `historico/AAAA-MM-DD/<bucket>` y no se borra durante 30 días. Un archivo que el cliente borró (o un documento reemplazado) sigue disponible 30 días.
5. **Verificación:** `rclone check --one-way --size-only` confirma que nada del origen falta en la copia. Si algo falla, el script termina con error y llama a `AVISO_FALLO_URL` (monitoreo que avisa al dueño).
6. **Una a la vez** (`flock`), registro en `copia-AAAA-MM-DD.log` sin claves, y `DRY_RUN=1` para ensayar sin copiar.

## 4. Cómo se programa (cuando haya VPS)

Un cron del usuario de servicio (no root) a las 3:15 a. m. hora de Colombia, con el archivo de variables en modo 0600 fuera del repositorio:

```
15 3 * * *  /opt/portal/copia-archivos-hostinger.sh   # con las variables cargadas desde el gestor de secretos
```

Además se activan las copias semanales del propio VPS en Hostinger (arquitectura v4, sección 7).

## 5. Secretos que hay que crear (nunca en el repositorio)

| Variable | Dónde se guarda |
|---|---|
| `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION` | Gestor de secretos de Coolify (no son secretos, pero van con el resto) |
| `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | Gestor de secretos de Coolify |
| `RCLONE_CRYPT_PASSWORD`, `RCLONE_CRYPT_PASSWORD2` | Gestor de secretos + bóveda del dueño |
| `DESTINO_COPIAS`, `AVISO_URL`, `AVISO_FALLO_URL` | Gestor de secretos de Coolify |

Es la **excepción conocida** de la arquitectura: esta copia corre en la infraestructura de DevOps con sus propias credenciales, no dentro del portal.

## 6. Restauración (se prueba antes de producción y cada trimestre)

1. Elegir qué restaurar: el espejo (estado de hoy) o `historico/<fecha>` (un archivo borrado o reemplazado).
2. `rclone copy CIFRADO:espejo/<bucket> SUPABASE:<bucket>` (o solo la carpeta de una empresa: `.../<empresa_id>`).
3. Restaurar **primero la base** (copias de Supabase) y **después** los archivos, para que cada fila encuentre su archivo.
4. Comprobar con un documento y un archivo de cliente reales: la descarga con enlace firmado funciona y la ruta coincide.
5. Anotar la fecha, la duración y quién lo hizo en `memoria-del-proyecto/` (meta: menos de 4 horas).

## 7. Limpieza de archivos huérfanos (tarea de Operaciones, sprint 6)

Una persona puede reservar y subir un archivo y no confirmarlo (cierra la ventana). El objeto queda en Storage sin fila. Esta consulta, ejecutada por DevOps con permisos de base, los lista para borrarlos con la API de Storage (nunca con SQL; Supabase lo prohíbe):

```sql
select o.bucket_id, o.name, o.created_at
  from storage.objects o
 where o.created_at < now() - interval '2 days'
   and not exists (select 1 from public.documento_versiones d where d.storage_path = o.name)
   and not exists (select 1 from public.archivos_cliente a where a.storage_path = o.name)
   and not exists (select 1 from public.aprobaciones p where p.captura_path = o.name);
```

## 8. Pendiente (no probado)

- No se ejecutó nada: sin VPS ni claves S3 no se pudo probar contra Supabase real. Se probó solo la sintaxis (`bash -n`).
- DevOps confirma: región del VPS y de Supabase, espacio en disco (retención de 30 días del histórico), y que el plan de Supabase permite claves S3 de solo lectura.
- Si el volumen crece, evaluar copias incrementales de la base y de archivos al mismo tiempo para que ambas queden coherentes.
