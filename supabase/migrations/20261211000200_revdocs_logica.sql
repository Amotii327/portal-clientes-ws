-- Sprint 3 · Logica en la base: tipos de archivo permitidos, quien soy (miembro real), cerradura de
-- "terminado solo con aprobacion del cliente" y reglas de subida. Todo SECURITY DEFINER con search_path vacio.
-- Equipo Websourcing · Desarrollo

-- ---------- Tipos de archivo permitidos (imagenes, PDF, video, audio, Office sin macros, CSV, ZIP) ----------
-- Se excluyen a proposito: SVG (puede llevar scripts) y los formatos viejos de Office (.doc/.xls/.ppt, admiten macros).
create function private.tipos_permitidos() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv', 'text/plain',
    'application/zip', 'application/x-zip-compressed']::text[]
$$;

create function private.tipos_de_captura() returns text[]
language sql immutable set search_path = '' as $$
  select array['image/png', 'image/jpeg', 'image/webp']::text[]
$$;

-- Extension segura para la ruta: la pone el servidor segun el tipo, nunca la persona.
create function private.extension_de_tipo(p_mime text) returns text
language sql immutable set search_path = '' as $$
  select case p_mime
    when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/gif' then 'gif' when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
    when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' when 'video/webm' then 'webm'
    when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a' when 'audio/wav' then 'wav' when 'audio/ogg' then 'ogg'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
    when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
    when 'text/csv' then 'csv' when 'text/plain' then 'txt'
    when 'application/zip' then 'zip' when 'application/x-zip-compressed' then 'zip'
  end
$$;

-- Primera carpeta de una ruta de Storage, si es una empresa valida (uuid). Si no, null.
create function private.empresa_de_ruta(p_ruta text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_ruta, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_ruta, '/', 1)::uuid end
$$;

-- ---------- Quien soy ----------
-- Mi fila REAL de miembros (activa hoy). En "ver como" el miembro es simulado y no esta en la tabla:
-- aqui da null, asi el super admin nunca responde ni sube en nombre del cliente.
create function private.mi_miembro_real() returns public.miembros
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.miembros := private.miembro_activo();
  r public.miembros;
begin
  if a.id is null or private.ver_como_activa_de(auth.uid()) then return null; end if;
  select m.* into r from public.miembros m where m.id = a.id and m.user_id = auth.uid();
  return r;
end $$;

-- Para las politicas: mi miembro (uno solo por consulta, sin correlacion).
create function private.mi_miembro_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare a public.miembros := private.miembro_activo();
begin
  return a.id;
end $$;

-- Puede subir a ese destino en esa empresa? documento = super admin; archivo_cliente = admin o "subir archivos";
-- captura = "aprobar". Nunca en "ver como". Lo usan la funcion de reserva y la regla de Storage.
create function private.puede_subir_destino(p_destino text, p_empresa uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m public.miembros;
begin
  if p_destino = 'documento' then return private.es_super_admin(); end if;
  m := private.mi_miembro_real();
  if m.id is null or m.empresa_id is distinct from p_empresa then return false; end if;
  return case p_destino
           when 'archivo_cliente' then m.subir_archivos
           when 'captura' then m.aprobar
           else false end;
end $$;

-- ---------- Terminado solo con la aprobacion del cliente (hito 5 y sprints) ----------
-- Lo que dejo anotado el sprint 2: "en el sprint 3 se atara a la aprobacion del cliente".
--  * Si hay una revision del diseno / del sprint que NO esta aprobada, nadie puede marcarlo terminado a mano.
--  * Si configuracion('revisiones').exigir_aprobacion_para_terminar = true, ninguno se termina a mano.
-- Solo responder_revision (que enciende la marca portal.aprobacion_cliente dentro de su transaccion) lo termina.
create function private.exigir_aprobacion_para_terminar() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (c.valor ->> 'exigir_aprobacion_para_terminar')::boolean
                     from public.configuracion c where c.clave = 'revisiones'), false)
$$;

create function private.trg_terminar_solo_con_aprobacion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bloquea boolean;
begin
  if new.estado is distinct from 'terminado' or old.estado is not distinct from 'terminado' then return new; end if;
  if coalesce(current_setting('portal.aprobacion_cliente', true), '') = 'on' then return new; end if;
  if tg_table_name = 'hitos' then
    if new.numero <> 5 then return new; end if;
    v_bloquea := private.exigir_aprobacion_para_terminar()
      or exists (select 1 from public.revisiones r
                  where r.proyecto_id = new.proyecto_id and r.tipo = 'diseno' and r.estado <> 'aprobada');
  else
    v_bloquea := private.exigir_aprobacion_para_terminar()
      or exists (select 1 from public.revisiones r where r.sprint_id = new.id and r.estado <> 'aprobada');
  end if;
  if v_bloquea then
    raise exception 'terminado_requiere_aprobacion' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger hitos_terminar_con_aprobacion before update of estado on public.hitos
  for each row execute function private.trg_terminar_solo_con_aprobacion();
create trigger sprints_terminar_con_aprobacion before update of estado on public.sprints
  for each row execute function private.trg_terminar_solo_con_aprobacion();

-- Una version publicada ya no cambia ni se borra (el cliente aprobo ESA version).
create function private.trg_version_publicada_fija() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'tabla_solo_agregar: %', tg_table_name using errcode = '42501';
  end if;
  if old.publicada_en is not null then
    raise exception 'version_publicada_inmutable' using errcode = '23514';
  end if;
  if new.revision_id is distinct from old.revision_id or new.version is distinct from old.version
     or new.creada_en is distinct from old.creada_en then
    raise exception 'campo_inmutable: revision_id/version' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger revision_versiones_fija before update or delete on public.revision_versiones
  for each row execute function private.trg_version_publicada_fija();
create trigger revision_versiones_sin_truncate before truncate on public.revision_versiones
  for each statement execute function private.solo_agregar();
create trigger documento_permisos_sin_borrar before delete on public.documento_permisos
  for each row execute function private.solo_agregar();
create trigger documento_permisos_sin_truncate before truncate on public.documento_permisos
  for each statement execute function private.solo_agregar();

-- ---------- Datos de la peticion (evidencia de la aprobacion) ----------
create function private.agente_cliente() returns text
language plpgsql stable set search_path = '' as $$
declare v_headers text := nullif(current_setting('request.headers', true), '');
begin
  if v_headers is null then return null; end if;
  return left(nullif(btrim(coalesce((v_headers::jsonb) ->> 'user-agent', '')), ''), 300);
exception when others then
  return null;
end $$;

-- Configuracion inicial: por ahora NO se exige (los hitos de diseno y sprint que no tienen revision se
-- siguen moviendo a mano, como en el sprint 2). El dueño la enciende cuando todos los proyectos usen revisiones.
insert into public.configuracion (clave, valor)
values ('revisiones', '{"exigir_aprobacion_para_terminar": false}'::jsonb)
on conflict (clave) do nothing;

revoke all on function
  private.tipos_permitidos(), private.tipos_de_captura(), private.extension_de_tipo(text), private.empresa_de_ruta(text),
  private.mi_miembro_real(), private.mi_miembro_id(), private.puede_subir_destino(text, uuid),
  private.exigir_aprobacion_para_terminar(), private.trg_terminar_solo_con_aprobacion(),
  private.trg_version_publicada_fija(), private.agente_cliente()
  from public, anon, authenticated, service_role;
-- Las usan las politicas (RLS y Storage) con el rol del usuario.
grant execute on function private.mi_miembro_id(), private.puede_subir_destino(text, uuid), private.empresa_de_ruta(text)
  to authenticated;
