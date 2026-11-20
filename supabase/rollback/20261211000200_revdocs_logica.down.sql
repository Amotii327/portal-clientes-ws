-- Rollback del sprint 3 · logica de revisiones y documentos.
drop trigger if exists hitos_terminar_con_aprobacion on public.hitos;
drop trigger if exists sprints_terminar_con_aprobacion on public.sprints;
drop trigger if exists revision_versiones_fija on public.revision_versiones;
drop trigger if exists revision_versiones_sin_truncate on public.revision_versiones;
drop trigger if exists documento_permisos_sin_borrar on public.documento_permisos;
drop trigger if exists documento_permisos_sin_truncate on public.documento_permisos;
delete from public.configuracion where clave = 'revisiones';
drop function if exists private.agente_cliente();
drop function if exists private.trg_version_publicada_fija();
drop function if exists private.trg_terminar_solo_con_aprobacion();
drop function if exists private.exigir_aprobacion_para_terminar();
drop function if exists private.puede_subir_destino(text, uuid);
drop function if exists private.mi_miembro_id();
drop function if exists private.mi_miembro_real();
drop function if exists private.empresa_de_ruta(text);
drop function if exists private.extension_de_tipo(text);
drop function if exists private.tipos_de_captura();
drop function if exists private.tipos_permitidos();
