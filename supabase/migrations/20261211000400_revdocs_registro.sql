-- Sprint 3 · Registro de actividad e historial del proyecto para revisiones y documentos, escritos por
-- triggers (nunca por la pantalla). registro_actividad: todo, con IP y autor (solo el super admin lo lee).
-- historial_proyecto: la version apta para el cliente (sin IP, sin nombres del equipo).
-- Equipo Websourcing · Desarrollo

create function private.trg_registro_revdocs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.revisiones;
  v_doc public.documentos;
  v_visible boolean;
begin
  if tg_table_name = 'revisiones' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'revision_creada', 'revisiones', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'tipo', new.tipo, 'titulo', new.titulo));
      return null;
    end if;
    if new.estado is distinct from old.estado then
      perform private.registrar(new.empresa_id, 'revision_estado_cambiado', 'revisiones', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'tipo', new.tipo, 'antes', old.estado, 'despues', new.estado,
                           'version', new.version_actual));
      -- Lo que el cliente ve: publicada y reabierta las hace Websourcing; aprobada y cambios_pedidos las
      -- escribe el trigger de aprobaciones (con el actor "cliente").
      if new.estado in ('publicada', 'reabierta') then
        perform private.escribir_historial(new.empresa_id, new.proyecto_id,
          case new.estado when 'publicada' then 'revision_publicada' else 'revision_reabierta' end,
          jsonb_build_object('revision_id', new.id, 'tipo', new.tipo, 'titulo', new.titulo, 'version', new.version_actual,
                             'motivo', nullif(current_setting('portal.motivo_reapertura', true), '')),
          new.tipo <> 'documento');
      end if;
    end if;

  elsif tg_table_name = 'revision_versiones' then
    select * into v_rev from public.revisiones r where r.id = new.revision_id;
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'revision_version_creada', 'revisiones', new.revision_id::text,
        jsonb_build_object('proyecto_id', v_rev.proyecto_id, 'version', new.version));
    end if;

  elsif tg_table_name = 'aprobaciones' then
    select * into v_rev from public.revisiones r where r.id = new.revision_id;
    -- registrar() guarda la IP (private.ip_cliente()); el comentario completo vive en la propia fila.
    perform private.registrar(new.empresa_id, 'revision_respondida', 'revisiones', new.revision_id::text,
      jsonb_build_object('proyecto_id', v_rev.proyecto_id, 'version', new.version, 'decision', new.decision,
                         'aprobacion_id', new.id, 'miembro_id', new.miembro_id, 'user_agent', new.user_agent));
    insert into public.historial_proyecto (empresa_id, proyecto_id, tipo, actor_tipo, detalle, visible_cliente)
    values (new.empresa_id, v_rev.proyecto_id,
            case new.decision when 'apruebo' then 'revision_aprobada' else 'revision_cambios_pedidos' end,
            'cliente',
            jsonb_build_object('revision_id', v_rev.id, 'tipo', v_rev.tipo, 'titulo', v_rev.titulo, 'version', new.version),
            v_rev.tipo <> 'documento');

  elsif tg_table_name = 'documentos' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'documento_creado', 'documentos', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'categoria', new.categoria, 'titulo', new.titulo,
                           'visibilidad', new.visibilidad));
    elsif new.visibilidad is distinct from old.visibilidad then
      perform private.registrar(new.empresa_id, 'documento_visibilidad_cambiada', 'documentos', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'antes', old.visibilidad, 'despues', new.visibilidad));
    end if;

  elsif tg_table_name = 'documento_versiones' then
    select * into v_doc from public.documentos d where d.id = new.documento_id;
    perform private.registrar(new.empresa_id, 'documento_version_subida', 'documentos', new.documento_id::text,
      jsonb_build_object('proyecto_id', v_doc.proyecto_id, 'version', new.version, 'tamano_bytes', new.tamano_bytes,
                         'mime_type', new.mime_type));
    -- El historial del cliente solo anuncia documentos que ve todo el equipo (no revela los privados).
    if v_doc.proyecto_id is not null then
      perform private.escribir_historial(new.empresa_id, v_doc.proyecto_id, 'documento_publicado',
        jsonb_build_object('categoria', v_doc.categoria, 'titulo', v_doc.titulo, 'version', new.version),
        v_doc.visibilidad = 'todo_el_equipo');
    end if;

  elsif tg_table_name = 'documento_permisos' then
    select * into v_doc from public.documentos d where d.id = new.documento_id;
    if tg_op = 'INSERT' or (old.revocado_en is not null and new.revocado_en is null) then
      perform private.registrar(new.empresa_id, 'documento_compartido', 'documentos', new.documento_id::text,
        jsonb_build_object('proyecto_id', v_doc.proyecto_id, 'miembro_id', new.miembro_id));
    elsif new.revocado_en is not null and old.revocado_en is null then
      perform private.registrar(new.empresa_id, 'documento_acceso_revocado', 'documentos', new.documento_id::text,
        jsonb_build_object('proyecto_id', v_doc.proyecto_id, 'miembro_id', new.miembro_id));
    end if;

  elsif tg_table_name = 'archivos_cliente' then
    if tg_op = 'INSERT' then
      -- Este asiento es el "aviso al super admin": la bandeja lee archivos_cliente con estado = 'nuevo'.
      perform private.registrar(new.empresa_id, 'archivo_cliente_subido', 'archivos_cliente', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'tamano_bytes', new.tamano_bytes, 'mime_type', new.mime_type));
    else
      if new.estado is distinct from old.estado then
        perform private.registrar(new.empresa_id, 'archivo_cliente_recibido', 'archivos_cliente', new.id::text,
          jsonb_build_object('proyecto_id', new.proyecto_id));
      end if;
      if new.borrado_en is not null and old.borrado_en is null then
        perform private.registrar(new.empresa_id, 'archivo_cliente_borrado', 'archivos_cliente', new.id::text,
          jsonb_build_object('proyecto_id', new.proyecto_id, 'storage_path', new.storage_path));
      end if;
    end if;
  end if;
  return null;
end $$;

revoke all on function private.trg_registro_revdocs() from public, anon, authenticated, service_role;

create trigger revisiones_registro after insert or update on public.revisiones for each row execute function private.trg_registro_revdocs();
create trigger revision_versiones_registro after insert on public.revision_versiones for each row execute function private.trg_registro_revdocs();
create trigger aprobaciones_registro after insert on public.aprobaciones for each row execute function private.trg_registro_revdocs();
create trigger documentos_registro after insert or update on public.documentos for each row execute function private.trg_registro_revdocs();
create trigger documento_versiones_registro after insert on public.documento_versiones for each row execute function private.trg_registro_revdocs();
create trigger documento_permisos_registro after insert or update on public.documento_permisos for each row execute function private.trg_registro_revdocs();
create trigger archivos_cliente_registro after insert or update on public.archivos_cliente for each row execute function private.trg_registro_revdocs();
