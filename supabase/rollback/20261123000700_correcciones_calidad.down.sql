-- Vuelve al estado de la migracion 000600.
drop trigger if exists configuracion_validar on public.configuracion;
drop function if exists private.validar_configuracion();
delete from public.configuracion where clave in ('red', 'intentos_acceso');
drop function if exists private.gancho_intento_de_acceso(jsonb);
drop table if exists public.intentos_acceso;
drop function if exists public.revocar_invitacion(uuid);
revoke execute on function public.mi_contexto() from anon;
drop function if exists public.aceptar_invitacion(text, text, text, text);
create function public.aceptar_invitacion(
  p_token text, p_version_politica text, p_nombre text default null, p_celular text default null,
  p_ip inet default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitaciones;
  v_correo text;
  v_confirmado timestamptz;
  v_perfil public.perfiles;
  v_miembro uuid;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '28000';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invitacion_invalida' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invitaciones
   where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex') for update;
  select lower(btrim(u.email)), u.email_confirmed_at into v_correo, v_confirmado
    from auth.users u where u.id = v_uid;

  if not found or v_inv.id is null or v_inv.usada_en is not null or v_inv.revocada_en is not null
     or v_inv.vence_en <= now() or v_correo is distinct from v_inv.correo
     or exists (select 1 from public.super_admins s where s.user_id = v_uid) then
    raise exception 'invitacion_invalida' using errcode = 'P0001';
  end if;
  if v_confirmado is null then
    raise exception 'correo_sin_confirmar' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.empresas e where e.id = v_inv.empresa_id and e.estado = 'activa') then
    raise exception 'empresa_no_disponible' using errcode = 'P0001';
  end if;
  if p_version_politica is distinct from private.version_politica_vigente() then
    raise exception 'politica_version_invalida' using errcode = 'P0001';
  end if;

  select * into v_perfil from public.perfiles where user_id = v_uid;
  if found then
    if v_perfil.bloqueado then
      raise exception 'usuario_bloqueado' using errcode = 'P0001';
    end if;
  else
    if p_nombre is null or char_length(btrim(p_nombre)) not between 2 and 120 then
      raise exception 'datos_invalidos' using errcode = '22023';
    end if;
    insert into public.perfiles (user_id, nombre, correo, celular)
    values (v_uid, btrim(p_nombre), v_correo, nullif(btrim(p_celular), ''));
  end if;

  begin
    insert into public.miembros (empresa_id, user_id, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos)
    values (v_inv.empresa_id, v_uid, v_inv.rol, v_inv.aprobar, v_inv.ver_dinero, v_inv.ver_todos_tickets, v_inv.subir_archivos)
    returning id into v_miembro;
  exception when unique_violation then
    raise exception 'ya_es_miembro' using errcode = 'P0001';
  end;

  update public.invitaciones set usada_en = now(), usada_por = v_uid, miembro_id = v_miembro where id = v_inv.id;
  insert into public.aceptaciones_politica (user_id, version, ip)
  values (v_uid, p_version_politica, coalesce(p_ip, private.ip_cliente()));
  insert into public.preferencias_usuario (user_id) values (v_uid) on conflict do nothing;

  return jsonb_build_object('empresa_id', v_inv.empresa_id, 'miembro_id', v_miembro, 'rol', v_inv.rol);
end $$;
revoke all on function public.aceptar_invitacion(text, text, text, text, inet) from public, anon, authenticated, service_role;
grant execute on function public.aceptar_invitacion(text, text, text, text, inet) to authenticated;
create or replace function private.crear_invitacion(
  p_empresa uuid, p_correo text, p_rol text,
  p_aprobar boolean, p_ver_dinero boolean, p_ver_todos_tickets boolean, p_subir_archivos boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_correo text := private.normalizar_correo(p_correo);
  v_token text;
  v_id uuid;
  v_vence timestamptz := now() + interval '7 days';
  v_todos boolean := (p_rol = 'admin_cliente');
begin
  if p_rol not in ('admin_cliente', 'equipo') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa and e.estado = 'activa') then
    raise exception 'empresa_no_disponible' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.perfiles p join public.miembros m on m.user_id = p.user_id
              where p.correo = v_correo and m.empresa_id = p_empresa and m.quitado_en is null) then
    raise exception 'correo_ya_es_miembro' using errcode = 'P0001';
  end if;
  -- Super admin o miembro de otra empresa: mismo mensaje, para no revelar quien existe.
  if exists (select 1 from public.perfiles p join public.super_admins s on s.user_id = p.user_id where p.correo = v_correo)
     or exists (select 1 from public.perfiles p join public.miembros m on m.user_id = p.user_id
                 where p.correo = v_correo and m.quitado_en is null) then
    raise exception 'correo_no_invitable' using errcode = 'P0001';
  end if;

  -- Si ya habia una pendiente para ese correo, se reemplaza.
  update public.invitaciones set revocada_en = now()
   where empresa_id = p_empresa and correo = v_correo and usada_en is null and revocada_en is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitaciones (empresa_id, correo, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos,
                                   token_hash, vence_en, invitada_por)
  values (p_empresa, v_correo, p_rol,
          v_todos or coalesce(p_aprobar, false), v_todos or coalesce(p_ver_dinero, false),
          v_todos or coalesce(p_ver_todos_tickets, false), v_todos or coalesce(p_subir_archivos, false),
          encode(sha256(convert_to(v_token, 'utf8')), 'hex'), v_vence, auth.uid())
  returning id into v_id;

  return jsonb_build_object('invitacion_id', v_id, 'correo', v_correo, 'token', v_token, 'vence_en', v_vence);
end $$;
create or replace function public.invitar_miembro(
  p_empresa_id uuid, p_correo text, p_rol text default 'equipo',
  p_aprobar boolean default false, p_ver_dinero boolean default false,
  p_ver_todos_tickets boolean default false, p_subir_archivos boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (private.es_super_admin() or (private.es_admin_cliente(p_empresa_id) and p_rol = 'equipo')) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  return private.crear_invitacion(p_empresa_id, p_correo, p_rol, p_aprobar, p_ver_dinero,
                                  p_ver_todos_tickets, p_subir_archivos);
end $$;
create or replace function public.quitar_miembro(p_miembro_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.miembros := private.miembro_gestionable(p_miembro_id);
begin
  if m.quitado_en is not null then
    raise exception 'miembro_ya_quitado' using errcode = 'P0001';
  end if;
  update public.miembros set quitado_en = now() where id = m.id;
  perform private.cerrar_sesiones(m.user_id);
end $$;
create or replace function public.bloquear_miembro(p_miembro_id uuid, p_bloqueado boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.miembros := private.miembro_gestionable(p_miembro_id);
begin
  if m.quitado_en is not null then
    raise exception 'miembro_ya_quitado' using errcode = 'P0001';
  end if;
  update public.miembros
     set bloqueado = coalesce(p_bloqueado, true),
         bloqueado_en = case when coalesce(p_bloqueado, true) then now() else null end
   where id = m.id;
  if coalesce(p_bloqueado, true) then
    perform private.cerrar_sesiones(m.user_id);
  end if;
end $$;
create or replace function public.bloquear_usuario(p_user_id uuid, p_bloqueado boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.es_super_admin() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if exists (select 1 from public.super_admins s where s.user_id = p_user_id) then
    raise exception 'no_se_puede_bloquear_super_admin' using errcode = 'P0001';
  end if;
  update public.perfiles
     set bloqueado = coalesce(p_bloqueado, true),
         bloqueado_en = case when coalesce(p_bloqueado, true) then now() else null end
   where user_id = p_user_id;
  if not found then raise exception 'usuario_no_encontrado' using errcode = 'P0001'; end if;
  if coalesce(p_bloqueado, true) then perform private.cerrar_sesiones(p_user_id); end if;
end $$;
create or replace function private.gancho_antes_de_crear_usuario(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_correo text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if not exists (select 1 from public.super_admins) then
    return '{}'::jsonb;
  end if;
  if exists (select 1 from public.invitaciones i
              where i.correo = v_correo and i.usada_en is null and i.revocada_en is null and i.vence_en > now()) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('message', 'registro_solo_por_invitacion', 'http_code', 403));
end $$;
create or replace function private.exigir_2fa_admin_cliente() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (c.valor ->> 'exigir_2fa_admin_cliente')::boolean
                     from public.configuracion c where c.clave = 'seguridad'), false)
$$;
create or replace function private.es_admin_de_usuario(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros m
     where m.user_id = p_user
       and private.es_admin_cliente(m.empresa_id))
$$;
create or replace function private.ip_cliente() returns inet
language plpgsql stable set search_path = '' as $$
declare
  v_headers text := nullif(current_setting('request.headers', true), '');
  v_ip text;
begin
  if v_headers is null then return null; end if;
  v_ip := btrim(split_part(coalesce((v_headers::jsonb) ->> 'x-forwarded-for', ''), ',', 1));
  if v_ip = '' then return null; end if;
  return v_ip::inet;
exception when others then
  return null;
end $$;
drop function if exists private.revocar_invitaciones_de(uuid, uuid);
