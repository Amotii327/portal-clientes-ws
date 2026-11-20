-- Rollback del sprint 3 · tablas de revisiones y documentos (en orden inverso de dependencias).
-- Solo borra la estructura de ESTE sprint; los archivos de Storage no se tocan (ver el rollback 000600).
drop table if exists public.subidas_reservadas;
drop table if exists public.archivos_cliente;
drop table if exists public.documento_permisos;
drop table if exists public.aprobaciones;
drop table if exists public.revision_versiones;
drop table if exists public.revisiones;
drop table if exists public.documento_versiones;
drop table if exists public.documentos;
