-- Rollback del sprint 3 · registro e historial de revisiones y documentos.
drop trigger if exists revisiones_registro on public.revisiones;
drop trigger if exists revision_versiones_registro on public.revision_versiones;
drop trigger if exists aprobaciones_registro on public.aprobaciones;
drop trigger if exists documentos_registro on public.documentos;
drop trigger if exists documento_versiones_registro on public.documento_versiones;
drop trigger if exists documento_permisos_registro on public.documento_permisos;
drop trigger if exists archivos_cliente_registro on public.archivos_cliente;
drop function if exists private.trg_registro_revdocs();
