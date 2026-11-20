-- Rollback de la solicitud de cambio 5 (ahorro de espacio). Quita cupos, enlaces de video, registro de archivados y resumen del
-- registro de actividad (esas tablas se pierden: son solo cuenta y registro, los archivos y el registro detallado no se tocan).
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists cupo_espacio_subir on storage.objects;
  end if;
end $$;
create or replace function public.preparar_adjunto_ticket(
  p_ticket_id uuid, p_nombre text, p_mime text, p_tamano_bytes bigint, p_mensaje_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, false);
  v_ext text;
  v_nombre text;
  v_ruta text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  v_ext := case p_mime
    when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' when 'image/gif' then 'gif'
    when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' when 'video/quicktime' then 'mov'
    when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a' when 'audio/x-m4a' then 'm4a'
    when 'audio/wav' then 'wav' when 'audio/ogg' then 'ogg' when 'audio/webm' then 'weba' end;
  if v_ext is null or p_tamano_bytes is null or p_tamano_bytes not between 1 and 52428800 then
    raise exception 'adjunto_invalido' using errcode = '22023';
  end if;
  v_nombre := left(regexp_replace(btrim(coalesce(p_nombre, '')), '[/\\[:cntrl:]]', '_', 'g'), 200);
  if v_nombre = '' then raise exception 'adjunto_invalido' using errcode = '22023'; end if;
  if (select count(*) from public.ticket_adjuntos a where a.ticket_id = t.id) >= 30 then
    raise exception 'demasiados_adjuntos' using errcode = 'P0001';
  end if;
  if p_mensaje_id is not null and not exists (
       select 1 from public.ticket_mensajes m
        where m.id = p_mensaje_id and m.ticket_id = t.id and m.empresa_id = t.empresa_id
          and (private.es_super_admin() or not m.interno)) then
    raise exception 'mensaje_no_encontrado' using errcode = 'P0001';
  end if;
  v_id := gen_random_uuid();
  v_ruta := t.empresa_id::text || '/tickets/' || t.id::text || '/' || gen_random_uuid()::text || '.' || v_ext;
  insert into public.ticket_adjuntos (id, empresa_id, ticket_id, mensaje_id, subido_por, nombre_original, mime, tamano_bytes, storage_path)
  values (v_id, t.empresa_id, t.id, p_mensaje_id, auth.uid(), v_nombre, p_mime, p_tamano_bytes, v_ruta);
  return jsonb_build_object('adjunto_id', v_id, 'bucket', 'portal-tickets', 'ruta', v_ruta);
end $$;

create or replace function public.reservar_subida(p_destino text, p_empresa_id uuid, p_nombre text, p_mime text, p_tamano bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nombre text;
  v_tope bigint := case when p_destino = 'captura' then 10485760 else 52428800 end;
  v_carpeta text;
  v_ruta text;
  v_id uuid;
  v_vence timestamptz := now() + interval '30 minutes';
  v_bucket text;
begin
  if auth.uid() is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_destino is null or p_destino not in ('documento', 'archivo_cliente', 'captura') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform private.exigir_no_ver_como();
  if not private.puede_subir_destino(p_destino, p_empresa_id) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa_id and e.estado = 'activa') then
    raise exception 'empresa_no_disponible' using errcode = 'P0001';
  end if;
  -- El nombre original solo se guarda para mostrarlo: sin separadores ni caracteres de control.
  v_nombre := btrim(regexp_replace(coalesce(p_nombre, ''), '[[:cntrl:]/\\]', '', 'g'));
  if char_length(v_nombre) not between 1 and 200 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if p_tamano is null or p_tamano < 1 or p_tamano > v_tope then
    raise exception 'archivo_demasiado_grande' using errcode = 'P0001';
  end if;
  if p_mime is null or not (p_mime = any (case when p_destino = 'captura' then private.tipos_de_captura() else private.tipos_permitidos() end)) then
    raise exception 'tipo_no_permitido' using errcode = 'P0001';
  end if;
  if (select count(*) from public.subidas_reservadas s where s.user_id = auth.uid() and s.creada_en > now() - interval '1 hour') >= 60 then
    raise exception 'demasiadas_subidas' using errcode = 'P0001';
  end if;
  v_bucket := case p_destino when 'documento' then 'documentos' when 'archivo_cliente' then 'archivos-empresa' else 'capturas-revisiones' end;
  v_carpeta := case p_destino when 'documento' then 'documentos' when 'archivo_cliente' then 'archivos' else 'capturas' end;
  v_ruta := p_empresa_id::text || '/' || v_carpeta || '/' || gen_random_uuid()::text || '.' || private.extension_de_tipo(p_mime);
  insert into public.subidas_reservadas (empresa_id, user_id, destino, bucket_id, ruta, nombre_original, mime_type, tamano_bytes, vence_en)
  values (p_empresa_id, auth.uid(), p_destino, v_bucket, v_ruta, v_nombre, p_mime, p_tamano, v_vence)
  returning id into v_id;
  return jsonb_build_object('reserva_id', v_id, 'bucket', v_bucket, 'ruta', v_ruta, 'vence_en', v_vence,
                            'tamano_maximo', v_tope);
end $$;

drop trigger if exists registro_actividad_solo_agregar on public.registro_actividad;
create trigger registro_actividad_solo_agregar before update or delete on public.registro_actividad
  for each row execute function private.solo_agregar();
drop function if exists private.registro_solo_agregar();

drop function if exists public.resumir_registro_actividad(integer);
drop table if exists public.registro_actividad_resumen;
drop function if exists public.pedir_recuperar_archivo(uuid);
drop function if exists public.archivo_con_error(uuid, text);
drop function if exists public.archivo_recuperado(uuid);
drop function if exists public.archivo_borrado_de_supabase(uuid);
drop function if exists public.archivo_trasladado(uuid, text, text);
drop function if exists public.archivos_por_borrar(integer);
drop function if exists public.archivos_por_trasladar(integer);
drop function if exists public.marcar_para_archivar(integer);
drop table if exists public.archivos_archivados;
drop trigger if exists proyectos_cerrado_en on public.proyectos;
drop function if exists private.trg_proyecto_cerrado_en();
alter table public.proyectos drop column if exists cerrado_en;
drop function if exists public.agregar_enlace_video_ticket(uuid, text, uuid);
drop table if exists public.ticket_enlaces_video;
drop function if exists public.espacio_por_empresas();
drop function if exists public.espacio_de_empresa(uuid);
drop function if exists public.fijar_cupo_espacio(uuid, bigint);
drop function if exists private.cupo_permite_subida(text, text);
drop trigger if exists documento_versiones_cupo on public.documento_versiones;
drop trigger if exists archivos_cliente_cupo on public.archivos_cliente;
drop trigger if exists ticket_adjuntos_cupo on public.ticket_adjuntos;
drop trigger if exists comprobantes_pago_cupo on public.comprobantes_pago;
drop trigger if exists facturas_cupo on public.facturas;
drop function if exists private.trg_revisar_cupo();
drop function if exists private.revisar_cupo(uuid);
drop function if exists private.exigir_cupo(uuid, bigint);
drop function if exists private.cupo_de(uuid);
drop table if exists public.cupos_espacio;
drop function if exists private.espacio_usado(uuid);
delete from public.avisos_salientes where modulo = 'archivos';
delete from public.configuracion where clave in ('cupo_espacio', 'archivo_externo', 'registro_resumen', 'videos_a_archivo_externo');
