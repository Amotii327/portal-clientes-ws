-- Sprint 3 · Funciones RPC de revisiones, aprobaciones, documentos y archivos de la empresa.
-- Las de escritura son SECURITY DEFINER con search_path vacio y comprueban QUIEN llama (permisos leidos de la
-- base). Las de lectura (bandeja, anotar_descarga) son SECURITY INVOKER: corren con las cerraduras (RLS) del usuario.
-- Errores: codigos estables en el mensaje (ver docs/2026-11-20_nota_backend-para-frontend_revisiones-docs_v1.md).
-- Equipo Websourcing · Desarrollo

-- ---------- Utilidades internas ----------
create function private.exigir_no_ver_como() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.ver_como_activa_de(auth.uid()) then
    raise exception 'ver_como_solo_lectura' using errcode = '42501';
  end if;
end $$;

-- Enlaces de prueba y video: solo https, sin espacios.
create function private.enlace(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(coalesce(p, ''));
begin
  if v = '' then return null; end if;
  if char_length(v) > 500 or v !~ '^https://[^[:space:]]+$' then
    raise exception 'enlace_invalido' using errcode = '22023';
  end if;
  return v;
end $$;

-- Confirma una reserva de subida: es mia, esta vigente, no se uso, y el archivo YA esta en Storage con el
-- tamano y el tipo que Storage midio (no los que diga la pantalla). Devuelve los datos reales y la marca usada.
create function private.confirmar_reserva(p_reserva uuid, p_destino text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.subidas_reservadas;
  o storage.objects;
  v_tam bigint;
  v_mime text;
  v_tope bigint := case when p_destino = 'captura' then 10485760 else 52428800 end;
begin
  select * into r from public.subidas_reservadas
   where id = p_reserva and user_id = auth.uid() and destino = p_destino for update;
  if not found or r.usada_en is not null then
    raise exception 'reserva_invalida' using errcode = 'P0001';
  end if;
  if r.vence_en <= now() then
    raise exception 'reserva_vencida' using errcode = 'P0001';
  end if;
  if not private.puede_subir_destino(p_destino, r.empresa_id) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  select * into o from storage.objects where bucket_id = r.bucket_id and name = r.ruta;
  if not found then
    raise exception 'archivo_no_subido' using errcode = 'P0001';
  end if;
  v_tam := coalesce((o.metadata ->> 'size')::bigint, 0);
  v_mime := o.metadata ->> 'mimetype';
  if v_tam < 1 or v_tam > v_tope then
    raise exception 'archivo_demasiado_grande' using errcode = 'P0001';
  end if;
  if v_mime is null or v_mime is distinct from r.mime_type
     or not (v_mime = any (case when p_destino = 'captura' then private.tipos_de_captura() else private.tipos_permitidos() end)) then
    raise exception 'tipo_no_permitido' using errcode = 'P0001';
  end if;
  update public.subidas_reservadas set usada_en = now() where id = r.id;
  return jsonb_build_object('empresa_id', r.empresa_id, 'bucket_id', r.bucket_id, 'ruta', r.ruta,
                            'nombre_original', r.nombre_original, 'mime_type', v_mime, 'tamano_bytes', v_tam);
end $$;

-- Deja los permisos "personas" de un documento exactamente como la lista (revocar = marcar, no borrar).
create function private.sincronizar_permisos_documento(p_doc uuid, p_empresa uuid, p_miembros uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_m uuid;
begin
  foreach v_m in array coalesce(p_miembros, '{}') loop
    if not exists (select 1 from public.miembros m
                    where m.id = v_m and m.empresa_id = p_empresa and m.quitado_en is null and not m.bloqueado) then
      raise exception 'miembro_invalido' using errcode = '22023';
    end if;
    insert into public.documento_permisos (empresa_id, documento_id, miembro_id)
    values (p_empresa, p_doc, v_m)
    on conflict (documento_id, miembro_id) do update set revocado_en = null
      where public.documento_permisos.revocado_en is not null;
  end loop;
  update public.documento_permisos set revocado_en = now()
   where documento_id = p_doc and revocado_en is null and miembro_id <> all (coalesce(p_miembros, '{}'));
end $$;

-- ---------- 1) Reservar una subida (la ruta la genera el servidor) ----------
create function public.reservar_subida(p_destino text, p_empresa_id uuid, p_nombre text, p_mime text, p_tamano bigint)
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

-- ---------- 2) Archivos de la empresa (los sube el cliente) ----------
create function public.confirmar_archivo_cliente(p_reserva_id uuid, p_nota text default null, p_proyecto_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.miembros;
  v jsonb;
  v_id uuid;
  v_nombre text;
begin
  perform private.exigir_no_ver_como();
  m := private.mi_miembro_real();
  if m.id is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  v := private.confirmar_reserva(p_reserva_id, 'archivo_cliente');
  if (v ->> 'empresa_id')::uuid is distinct from m.empresa_id then
    raise exception 'reserva_invalida' using errcode = 'P0001';
  end if;
  if p_proyecto_id is not null and not exists (select 1 from public.proyectos p where p.id = p_proyecto_id and p.empresa_id = m.empresa_id) then
    raise exception 'proyecto_no_encontrado' using errcode = 'P0001';
  end if;
  select pf.nombre into v_nombre from public.perfiles pf where pf.user_id = auth.uid();
  insert into public.archivos_cliente (empresa_id, proyecto_id, storage_path, nombre_original, mime_type, tamano_bytes,
                                       nota, subido_por, subido_por_nombre)
  values (m.empresa_id, p_proyecto_id, v ->> 'ruta', v ->> 'nombre_original', v ->> 'mime_type', (v ->> 'tamano_bytes')::bigint,
          case when p_nota is null or btrim(p_nota) = '' then null else private.texto(p_nota, 1, 500) end,
          auth.uid(), v_nombre)
  returning id into v_id;
  return jsonb_build_object('archivo_id', v_id);
end $$;

-- El cliente borra lo que subio mientras Websourcing no lo marque "recibido". Borrado suave: devuelve la ruta
-- para que el servidor quite el objeto de Storage con la sesion de la persona (la regla de Storage lo permite).
create function public.borrar_archivo_cliente(p_archivo_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.miembros; a public.archivos_cliente;
begin
  perform private.exigir_no_ver_como();
  m := private.mi_miembro_real();
  if m.id is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into a from public.archivos_cliente where id = p_archivo_id and empresa_id = m.empresa_id and borrado_en is null for update;
  if not found then raise exception 'archivo_no_encontrado' using errcode = 'P0001'; end if;
  if a.subido_por <> auth.uid() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if a.estado = 'recibido' then raise exception 'archivo_ya_recibido' using errcode = 'P0001'; end if;
  update public.archivos_cliente set borrado_en = now() where id = a.id;
  return jsonb_build_object('bucket', a.bucket_id, 'ruta', a.storage_path);
end $$;

create function public.marcar_archivo_recibido(p_archivo_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.archivos_cliente;
begin
  perform private.exigir_super_admin();
  select * into a from public.archivos_cliente where id = p_archivo_id and borrado_en is null for update;
  if not found then raise exception 'archivo_no_encontrado' using errcode = 'P0001'; end if;
  if a.estado = 'recibido' then raise exception 'archivo_ya_recibido' using errcode = 'P0001'; end if;
  update public.archivos_cliente set estado = 'recibido', recibido_en = now() where id = a.id;
end $$;

-- ---------- 3) Documentos de Websourcing ----------
create function public.crear_documento(
  p_empresa_id uuid, p_proyecto_id uuid, p_categoria text, p_titulo text, p_descripcion text,
  p_visibilidad text, p_miembros uuid[], p_reserva_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_id uuid;
begin
  perform private.exigir_super_admin();
  if not exists (select 1 from public.empresas e where e.id = p_empresa_id and e.estado = 'activa') then
    raise exception 'empresa_no_disponible' using errcode = 'P0001';
  end if;
  if p_categoria is null or p_categoria not in ('contrato', 'propuesta', 'requerimientos', 'arquitectura', 'acta', 'manual', 'entregable', 'otro')
     or p_visibilidad is null or p_visibilidad not in ('todo_el_equipo', 'solo_admin', 'personas')
     or (p_visibilidad = 'personas' and cardinality(coalesce(p_miembros, '{}')) = 0) then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if p_proyecto_id is not null and not exists (select 1 from public.proyectos p where p.id = p_proyecto_id and p.empresa_id = p_empresa_id) then
    raise exception 'proyecto_no_encontrado' using errcode = 'P0001';
  end if;
  v := private.confirmar_reserva(p_reserva_id, 'documento');
  if (v ->> 'empresa_id')::uuid is distinct from p_empresa_id then
    raise exception 'reserva_invalida' using errcode = 'P0001';
  end if;
  insert into public.documentos (empresa_id, proyecto_id, categoria, titulo, descripcion, visibilidad, version_actual)
  values (p_empresa_id, p_proyecto_id, p_categoria, private.texto(p_titulo, 2, 160),
          case when p_descripcion is null or btrim(p_descripcion) = '' then null else private.texto(p_descripcion, 1, 1000) end,
          p_visibilidad, 1)
  returning id into v_id;
  insert into public.documento_versiones (empresa_id, documento_id, version, storage_path, nombre_original, mime_type, tamano_bytes)
  values (p_empresa_id, v_id, 1, v ->> 'ruta', v ->> 'nombre_original', v ->> 'mime_type', (v ->> 'tamano_bytes')::bigint);
  if p_visibilidad = 'personas' then
    perform private.sincronizar_permisos_documento(v_id, p_empresa_id, p_miembros);
  end if;
  return jsonb_build_object('documento_id', v_id, 'version', 1);
end $$;

-- Cada subida nueva es una version nueva (v2, v3...). Nunca se reemplaza en silencio.
create function public.confirmar_version_documento(p_documento_id uuid, p_reserva_id uuid, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.documentos; v jsonb; v_n int;
begin
  perform private.exigir_super_admin();
  select * into d from public.documentos where id = p_documento_id for update;
  if not found then raise exception 'documento_no_encontrado' using errcode = 'P0001'; end if;
  v := private.confirmar_reserva(p_reserva_id, 'documento');
  if (v ->> 'empresa_id')::uuid is distinct from d.empresa_id then
    raise exception 'reserva_invalida' using errcode = 'P0001';
  end if;
  v_n := d.version_actual + 1;
  insert into public.documento_versiones (empresa_id, documento_id, version, storage_path, nombre_original, mime_type, tamano_bytes, nota)
  values (d.empresa_id, d.id, v_n, v ->> 'ruta', v ->> 'nombre_original', v ->> 'mime_type', (v ->> 'tamano_bytes')::bigint,
          case when p_nota is null or btrim(p_nota) = '' then null else private.texto(p_nota, 1, 500) end);
  update public.documentos set version_actual = v_n where id = d.id;
  return jsonb_build_object('documento_id', d.id, 'version', v_n);
end $$;

-- Quien ve el documento lo decide Websourcing: todo el equipo, solo el admin, o personas elegidas.
create function public.fijar_visibilidad_documento(p_documento_id uuid, p_visibilidad text, p_miembros uuid[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare d public.documentos;
begin
  perform private.exigir_super_admin();
  if p_visibilidad is null or p_visibilidad not in ('todo_el_equipo', 'solo_admin', 'personas')
     or (p_visibilidad = 'personas' and cardinality(coalesce(p_miembros, '{}')) = 0) then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into d from public.documentos where id = p_documento_id for update;
  if not found then raise exception 'documento_no_encontrado' using errcode = 'P0001'; end if;
  update public.documentos set visibilidad = p_visibilidad where id = d.id;
  perform private.sincronizar_permisos_documento(d.id, d.empresa_id, case when p_visibilidad = 'personas' then p_miembros else '{}' end);
end $$;

-- ---------- 4) Revisiones: Websourcing prepara y publica ----------
create function public.crear_revision(
  p_proyecto_id uuid, p_tipo text, p_titulo text, p_sprint_id uuid default null, p_documento_id uuid default null,
  p_link_prueba text default null, p_video_url text default null, p_acta_documento_id uuid default null,
  p_resumen text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.proyectos; v_id uuid;
begin
  perform private.exigir_super_admin();
  p := private.proyecto_para_cambio(p_proyecto_id);
  if p_tipo is null or p_tipo not in ('diseno', 'sprint', 'documento')
     or (p_tipo = 'sprint') <> (p_sprint_id is not null) or (p_tipo = 'documento') <> (p_documento_id is not null) then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if p_sprint_id is not null and not exists (select 1 from public.sprints s where s.id = p_sprint_id and s.proyecto_id = p.id) then
    raise exception 'sprint_no_encontrado' using errcode = 'P0001';
  end if;
  if p_documento_id is not null and not exists (select 1 from public.documentos d where d.id = p_documento_id and d.empresa_id = p.empresa_id) then
    raise exception 'documento_no_encontrado' using errcode = 'P0001';
  end if;
  if p_acta_documento_id is not null and not exists (
       select 1 from public.documentos d where d.id = p_acta_documento_id and d.empresa_id = p.empresa_id and d.categoria = 'acta') then
    raise exception 'acta_invalida' using errcode = 'P0001';
  end if;
  begin
    insert into public.revisiones (empresa_id, proyecto_id, tipo, sprint_id, documento_id, titulo)
    values (p.empresa_id, p.id, p_tipo, p_sprint_id, p_documento_id, private.texto(p_titulo, 3, 160))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'revision_ya_existe' using errcode = 'P0001';
  end;
  insert into public.revision_versiones (empresa_id, revision_id, version, link_prueba, video_url, acta_documento_id, resumen)
  values (p.empresa_id, v_id, 1, private.enlace(p_link_prueba), private.enlace(p_video_url), p_acta_documento_id,
          case when p_resumen is null or btrim(p_resumen) = '' then null else private.texto(p_resumen, 1, 2000) end);
  return jsonb_build_object('revision_id', v_id, 'version', 1);
end $$;

-- Cambia el borrador de la version (lo que llega nulo no cambia; texto vacio borra). Una version publicada no se toca.
create function public.editar_borrador_revision(
  p_revision_id uuid, p_titulo text default null, p_link_prueba text default null, p_video_url text default null,
  p_acta_documento_id uuid default null, p_resumen text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare rv public.revisiones; ver public.revision_versiones;
begin
  perform private.exigir_super_admin();
  select * into rv from public.revisiones where id = p_revision_id for update;
  if not found then raise exception 'revision_no_encontrada' using errcode = 'P0001'; end if;
  perform private.proyecto_para_cambio(rv.proyecto_id);
  select * into ver from public.revision_versiones where revision_id = rv.id order by version desc limit 1;
  if ver.publicada_en is not null then raise exception 'sin_borrador' using errcode = 'P0001'; end if;
  if p_acta_documento_id is not null and not exists (
       select 1 from public.documentos d where d.id = p_acta_documento_id and d.empresa_id = rv.empresa_id and d.categoria = 'acta') then
    raise exception 'acta_invalida' using errcode = 'P0001';
  end if;
  if p_titulo is not null then
    update public.revisiones set titulo = private.texto(p_titulo, 3, 160) where id = rv.id;
  end if;
  update public.revision_versiones
     set link_prueba = case when p_link_prueba is null then link_prueba else private.enlace(p_link_prueba) end,
         video_url = case when p_video_url is null then video_url else private.enlace(p_video_url) end,
         acta_documento_id = coalesce(p_acta_documento_id, acta_documento_id),
         resumen = case when p_resumen is null then resumen when btrim(p_resumen) = '' then null else private.texto(p_resumen, 1, 2000) end
   where id = ver.id;
end $$;

-- Publica la version en borrador: el cliente la ve y el hito / sprint pasa a "esperando aprobacion".
create function public.publicar_revision(p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare rv public.revisiones; ver public.revision_versiones; v_estado text;
begin
  perform private.exigir_super_admin();
  select * into rv from public.revisiones where id = p_revision_id for update;
  if not found then raise exception 'revision_no_encontrada' using errcode = 'P0001'; end if;
  perform private.proyecto_para_cambio(rv.proyecto_id);
  if rv.estado = 'aprobada' then raise exception 'revision_ya_aprobada' using errcode = 'P0001'; end if;
  if rv.estado = 'publicada' then raise exception 'revision_ya_publicada' using errcode = 'P0001'; end if;
  select * into ver from public.revision_versiones where revision_id = rv.id order by version desc limit 1;
  if ver.publicada_en is not null then raise exception 'sin_borrador' using errcode = 'P0001'; end if;
  if rv.tipo <> 'documento' and ver.link_prueba is null and ver.video_url is null then
    raise exception 'revision_sin_contenido' using errcode = 'P0001';
  end if;
  -- Atarla al avance: el sprint pasa a "en revision" y el hito 5 (diseno) a "esperando aprobacion".
  if rv.tipo = 'sprint' then
    select estado into v_estado from public.sprints where id = rv.sprint_id for update;
    if v_estado = 'terminado' then raise exception 'sprint_ya_terminado' using errcode = 'P0001'; end if;
    if v_estado = 'propuesto' then raise exception 'sprint_no_revisable' using errcode = 'P0001'; end if;
    update public.sprints set estado = 'en_revision' where id = rv.sprint_id and estado <> 'en_revision';
  elsif rv.tipo = 'diseno' then
    select estado into v_estado from public.hitos where proyecto_id = rv.proyecto_id and numero = 5 for update;
    if v_estado = 'terminado' then raise exception 'hito_ya_terminado' using errcode = 'P0001'; end if;
    update public.hitos set estado = 'esperando_aprobacion' where proyecto_id = rv.proyecto_id and numero = 5 and estado <> 'esperando_aprobacion';
  end if;
  update public.revision_versiones set publicada_en = now() where id = ver.id;
  update public.revisiones set estado = 'publicada', version_actual = ver.version where id = rv.id;
  return jsonb_build_object('revision_id', rv.id, 'version', ver.version);
end $$;

-- Tras "pido cambios" o una reapertura: abre el borrador de la version siguiente (copia la anterior).
create function public.nueva_version_revision(p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare rv public.revisiones; ult public.revision_versiones;
begin
  perform private.exigir_super_admin();
  select * into rv from public.revisiones where id = p_revision_id for update;
  if not found then raise exception 'revision_no_encontrada' using errcode = 'P0001'; end if;
  perform private.proyecto_para_cambio(rv.proyecto_id);
  if rv.estado not in ('cambios_pedidos', 'reabierta') then raise exception 'revision_no_editable' using errcode = 'P0001'; end if;
  select * into ult from public.revision_versiones where revision_id = rv.id order by version desc limit 1;
  if ult.publicada_en is null then raise exception 'ya_hay_borrador' using errcode = 'P0001'; end if;
  insert into public.revision_versiones (empresa_id, revision_id, version, link_prueba, video_url, acta_documento_id, resumen)
  values (rv.empresa_id, rv.id, ult.version + 1, ult.link_prueba, ult.video_url, ult.acta_documento_id, ult.resumen);
  return jsonb_build_object('revision_id', rv.id, 'version', ult.version + 1);
end $$;

-- Una aprobacion no se deshace desde el portal: solo el super admin la reabre, con motivo, y queda en el historial.
create function public.reabrir_revision(p_revision_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare rv public.revisiones; v_motivo text;
begin
  perform private.exigir_super_admin();
  select * into rv from public.revisiones where id = p_revision_id for update;
  if not found then raise exception 'revision_no_encontrada' using errcode = 'P0001'; end if;
  perform private.proyecto_para_cambio(rv.proyecto_id);
  if rv.estado <> 'aprobada' then raise exception 'revision_no_aprobada' using errcode = 'P0001'; end if;
  v_motivo := private.texto(p_motivo, 5, 1000);
  if rv.tipo = 'sprint' then
    update public.sprints set estado = 'en_curso', terminado_en = null where id = rv.sprint_id and estado = 'terminado';
  elsif rv.tipo = 'diseno' then
    update public.hitos set estado = 'en_curso', fecha_real = null where proyecto_id = rv.proyecto_id and numero = 5 and estado = 'terminado';
  end if;
  perform set_config('portal.motivo_reapertura', v_motivo, true);
  update public.revisiones set estado = 'reabierta' where id = rv.id;
  perform set_config('portal.motivo_reapertura', '', true);
end $$;

-- ---------- 5) El cliente responde: "apruebo" o "pido cambios" ----------
create function public.responder_revision(
  p_revision_id uuid, p_version integer, p_decision text, p_comentario text default null, p_captura_reserva_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.miembros; rv public.revisiones; v_com text; v_captura text; v jsonb; v_id uuid; v_nombre text;
begin
  perform private.exigir_no_ver_como();
  -- Solo una persona de la empresa (miembro real). Un super admin que no es miembro no entra aqui.
  m := private.mi_miembro_real();
  if m.id is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into rv from public.revisiones where id = p_revision_id and empresa_id = m.empresa_id and estado <> 'borrador' for update;
  if not found then raise exception 'revision_no_encontrada' using errcode = 'P0001'; end if;
  if not m.aprobar then raise exception 'sin_permiso_aprobar' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('apruebo', 'pido_cambios') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if rv.estado <> 'publicada' then raise exception 'revision_no_pendiente' using errcode = 'P0001'; end if;
  if p_version is distinct from rv.version_actual then raise exception 'version_desactualizada' using errcode = 'P0001'; end if;
  v_com := case when p_comentario is null or btrim(p_comentario) = '' then null else btrim(p_comentario) end;
  if p_decision = 'pido_cambios' and (v_com is null or char_length(v_com) < 5) then
    raise exception 'cambios_requiere_comentario' using errcode = '22023';
  end if;
  if v_com is not null and char_length(v_com) > 2000 then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  if p_captura_reserva_id is not null then
    if p_decision <> 'pido_cambios' then raise exception 'datos_invalidos' using errcode = '22023'; end if;
    v := private.confirmar_reserva(p_captura_reserva_id, 'captura');
    if (v ->> 'empresa_id')::uuid is distinct from m.empresa_id then raise exception 'reserva_invalida' using errcode = 'P0001'; end if;
    v_captura := v ->> 'ruta';
  end if;
  select pf.nombre into v_nombre from public.perfiles pf where pf.user_id = auth.uid();
  insert into public.aprobaciones (empresa_id, revision_id, version, decision, comentario, captura_path, miembro_id, persona,
                                   user_id, ip, user_agent)
  values (rv.empresa_id, rv.id, rv.version_actual, p_decision, v_com, v_captura, m.id, v_nombre,
          auth.uid(), private.ip_cliente(), private.agente_cliente())
  returning id into v_id;

  if p_decision = 'apruebo' then
    -- Solo esta funcion puede dar por terminado el hito de diseno o el sprint (ver trigger de la migracion 000200).
    perform set_config('portal.aprobacion_cliente', 'on', true);
    if rv.tipo = 'sprint' then
      update public.sprints set estado = 'terminado', terminado_en = coalesce(terminado_en, private.hoy()) where id = rv.sprint_id;
    elsif rv.tipo = 'diseno' then
      update public.hitos set estado = 'terminado', fecha_real = coalesce(fecha_real, private.hoy())
       where proyecto_id = rv.proyecto_id and numero = 5;
    end if;
    perform set_config('portal.aprobacion_cliente', 'off', true);
    update public.revisiones set estado = 'aprobada' where id = rv.id;
  else
    if rv.tipo = 'sprint' then
      update public.sprints set estado = 'en_curso' where id = rv.sprint_id and estado = 'en_revision';
    elsif rv.tipo = 'diseno' then
      update public.hitos set estado = 'en_curso' where proyecto_id = rv.proyecto_id and numero = 5 and estado = 'esperando_aprobacion';
    end if;
    update public.revisiones set estado = 'cambios_pedidos' where id = rv.id;
  end if;
  return jsonb_build_object('aprobacion_id', v_id, 'estado', case p_decision when 'apruebo' then 'aprobada' else 'cambios_pedidos' end);
end $$;

-- ---------- 6) Bandeja del super admin ----------
-- Lectura con las mismas cerraduras (SECURITY INVOKER). Cuatro listas, de a 200 como maximo, filtro por cliente.
create function public.bandeja_revisiones(p_empresa_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return (
    with v as (
      select r.id as revision_id, r.empresa_id, e.nombre as empresa_nombre, r.proyecto_id, p.nombre as proyecto_nombre,
             r.tipo, r.titulo, r.estado, r.version_actual as version, r.actualizado_en
        from public.revisiones r
        join public.empresas e on e.id = r.empresa_id
        join public.proyectos p on p.id = r.proyecto_id
       where p_empresa_id is null or r.empresa_id = p_empresa_id)
    select jsonb_build_object(
      'aprobado', coalesce((select jsonb_agg(to_jsonb(x) order by x.actualizado_en desc)
                              from (select * from v where estado = 'aprobada' order by actualizado_en desc limit 200) x), '[]'::jsonb),
      'cambios_pedidos', coalesce((select jsonb_agg(to_jsonb(x) order by x.actualizado_en desc)
                              from (select * from v where estado = 'cambios_pedidos' order by actualizado_en desc limit 200) x), '[]'::jsonb),
      'esperando_a_websourcing', coalesce((select jsonb_agg(to_jsonb(x) order by x.actualizado_en desc)
                              from (select * from v where estado in ('borrador', 'reabierta') order by actualizado_en desc limit 200) x), '[]'::jsonb),
      'esperando_al_cliente', coalesce((select jsonb_agg(to_jsonb(x) order by x.actualizado_en desc)
                              from (select * from v where estado = 'publicada' order by actualizado_en desc limit 200) x), '[]'::jsonb)));
end $$;

-- ---------- 7) Descargas: quedan en el registro (arquitectura, seccion 7) ----------
create function private.registrar_descarga(p_tipo text, p_id uuid, p_empresa uuid, p_ref uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.registro_actividad r
       where r.actor_id = auth.uid() and r.accion = 'descarga' and r.creado_en > now() - interval '1 minute') >= 60 then
    return;
  end if;
  perform private.registrar(p_empresa, 'descarga', case p_tipo when 'documento' then 'documentos' else 'archivos_cliente' end,
    p_ref::text, jsonb_build_object('tipo', p_tipo, 'version_id', p_id));
end $$;

-- El servidor la llama justo antes de dar el enlace firmado. Solo anota si la persona ya puede VER esa fila.
create function public.anotar_descarga(p_tipo text, p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_empresa uuid; v_ref uuid;
begin
  if p_tipo = 'documento' then
    select dv.empresa_id, dv.documento_id into v_empresa, v_ref from public.documento_versiones dv where dv.id = p_id;
  elsif p_tipo = 'archivo' then
    select a.empresa_id, a.id into v_empresa, v_ref from public.archivos_cliente a where a.id = p_id;
  else
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if v_empresa is null then raise exception 'archivo_no_encontrado' using errcode = 'P0001'; end if;
  perform private.registrar_descarga(p_tipo, p_id, v_empresa, v_ref);
end $$;

-- ---------- Permisos de ejecucion ----------
revoke all on function
  private.exigir_no_ver_como(), private.enlace(text), private.confirmar_reserva(uuid, text),
  private.sincronizar_permisos_documento(uuid, uuid, uuid[]), private.registrar_descarga(text, uuid, uuid, uuid),
  public.reservar_subida(text, uuid, text, text, bigint), public.confirmar_archivo_cliente(uuid, text, uuid),
  public.borrar_archivo_cliente(uuid), public.marcar_archivo_recibido(uuid),
  public.crear_documento(uuid, uuid, text, text, text, text, uuid[], uuid),
  public.confirmar_version_documento(uuid, uuid, text), public.fijar_visibilidad_documento(uuid, text, uuid[]),
  public.crear_revision(uuid, text, text, uuid, uuid, text, text, uuid, text),
  public.editar_borrador_revision(uuid, text, text, text, uuid, text), public.publicar_revision(uuid),
  public.nueva_version_revision(uuid), public.reabrir_revision(uuid, text),
  public.responder_revision(uuid, integer, text, text, uuid), public.bandeja_revisiones(uuid),
  public.anotar_descarga(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.reservar_subida(text, uuid, text, text, bigint), public.confirmar_archivo_cliente(uuid, text, uuid),
  public.borrar_archivo_cliente(uuid), public.marcar_archivo_recibido(uuid),
  public.crear_documento(uuid, uuid, text, text, text, text, uuid[], uuid),
  public.confirmar_version_documento(uuid, uuid, text), public.fijar_visibilidad_documento(uuid, text, uuid[]),
  public.crear_revision(uuid, text, text, uuid, uuid, text, text, uuid, text),
  public.editar_borrador_revision(uuid, text, text, text, uuid, text), public.publicar_revision(uuid),
  public.nueva_version_revision(uuid), public.reabrir_revision(uuid, text),
  public.responder_revision(uuid, integer, text, text, uuid), public.bandeja_revisiones(uuid),
  public.anotar_descarga(text, uuid)
  to authenticated;
-- anotar_descarga e invocadores: las auxiliares que llaman con el rol del usuario.
grant execute on function private.registrar_descarga(text, uuid, uuid, uuid) to authenticated;
