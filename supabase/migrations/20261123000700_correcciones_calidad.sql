-- Sprint 1 · Correcciones del informe de Calidad (docs/2026-11-20_informe_pruebas_sprint1-backend_v1.md).
-- I-1 sin p_ip · I-2 IP desde la derecha · I-3 gancho cerrado · I-5 bloqueo por intentos ·
-- I-7 sin revelar correos · M-1 rol nulo · M-2 mi_contexto para visitantes · M-3 invitaciones del que sale ·
-- M-4 revocar_invitacion · M-5 perfiles de quien se fue · M-6 validar configuracion.
-- Equipo Websourcing · Desarrollo

-- ---------- M-6: validacion de configuracion ----------
create function private.validar_configuracion() returns trigger
language plpgsql set search_path = '' as $$
declare v jsonb := new.valor;
  v_ok boolean;
begin
  if jsonb_typeof(v) is distinct from 'object' then
    raise exception 'configuracion_invalida: %', new.clave using errcode = '23514';
  end if;
  v_ok := case new.clave
       when 'seguridad' then
         not (v ? 'exigir_2fa_admin_cliente') or jsonb_typeof(v -> 'exigir_2fa_admin_cliente') = 'boolean'
       when 'politica_datos' then
         jsonb_typeof(v -> 'version') = 'string' and char_length(v ->> 'version') between 1 and 40
       when 'marca' then
         jsonb_typeof(v -> 'nombre') = 'string'
       when 'horario_habil' then
         jsonb_typeof(v -> 'dias') = 'array' and jsonb_typeof(v -> 'zona') = 'string'
         and coalesce(v ->> 'desde', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         and coalesce(v ->> 'hasta', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       when 'red' then
         jsonb_typeof(v -> 'proxies_de_confianza') = 'number' and coalesce(v ->> 'proxies_de_confianza', '') ~ '^[1-5]$'
       when 'intentos_acceso' then
         jsonb_typeof(v -> 'max_fallos') = 'number' and coalesce(v ->> 'max_fallos', '') ~ '^([2-9]|10)$'
         and jsonb_typeof(v -> 'minutos_bloqueo') = 'number' and coalesce(v ->> 'minutos_bloqueo', '') ~ '^([1-9]|[1-5][0-9]|60)$'
       else true
     end;
  if v_ok is not true then
    raise exception 'configuracion_invalida: %', new.clave using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.validar_configuracion() from public, anon, authenticated, service_role;
create trigger configuracion_validar before insert or update on public.configuracion
  for each row execute function private.validar_configuracion();

insert into public.configuracion (clave, valor) values
  -- Cuantos saltos desde la DERECHA de X-Forwarded-For son del proxy de confianza (1 = el ultimo).
  ('red', '{"proxies_de_confianza": 1}'),
  ('intentos_acceso', '{"max_fallos": 5, "minutos_bloqueo": 15}');

-- Ausente, null o con formato raro = 2FA EXIGIDO (falla hacia el lado seguro).
create or replace function private.exigir_2fa_admin_cliente() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(c.valor -> 'exigir_2fa_admin_cliente') = 'boolean'
                               then (c.valor ->> 'exigir_2fa_admin_cliente')::boolean else true end
                     from public.configuracion c where c.clave = 'seguridad'), true)
$$;

-- ---------- I-2: IP desde la derecha ----------
-- La cabecera X-Forwarded-For la puede escribir quien hace la peticion; cada proxy AGREGA su valor
-- a la derecha. Por eso se toma el salto de confianza contando desde la derecha (por defecto el
-- ultimo, el que agrega el proxy de Supabase). La IP es dato de apoyo, NO prueba unica, hasta
-- verificar con el proyecto real de Supabase que cabeceras llegan a la base.
create or replace function private.ip_cliente() returns inet
language plpgsql stable security definer set search_path = '' as $$
declare
  v_headers text := nullif(current_setting('request.headers', true), '');
  v_partes text[];
  v_n int;
  v_saltos int;
  v_ip text;
begin
  if v_headers is null then return null; end if;
  v_partes := string_to_array(coalesce((v_headers::jsonb) ->> 'x-forwarded-for', ''), ',');
  v_n := coalesce(array_length(v_partes, 1), 0);
  if v_n = 0 then return null; end if;
  v_saltos := coalesce((select (c.valor ->> 'proxies_de_confianza')::int from public.configuracion c where c.clave = 'red'), 1);
  v_ip := btrim(v_partes[greatest(v_n - v_saltos + 1, 1)]);
  if v_ip = '' then return null; end if;
  return v_ip::inet;
exception when others then
  return null;
end $$;

-- ---------- M-3: revocar invitaciones pendientes de quien sale ----------
create function private.revocar_invitaciones_de(p_user uuid, p_empresa uuid) returns void
language sql security definer set search_path = '' as $$
  update public.invitaciones set revocada_en = now()
   where invitada_por = p_user and (p_empresa is null or empresa_id = p_empresa)
     and usada_en is null and revocada_en is null
$$;
revoke all on function private.revocar_invitaciones_de(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------- I-7 y M-1: crear_invitacion ----------
create or replace function private.crear_invitacion(
  p_empresa uuid, p_correo text, p_rol text,
  p_aprobar boolean, p_ver_dinero boolean, p_ver_todos_tickets boolean, p_subir_archivos boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_correo text := private.normalizar_correo(p_correo);
  v_token text;
  v_id uuid;
  v_vence timestamptz := now() + interval '7 days';
  v_todos boolean := coalesce(p_rol = 'admin_cliente', false);
begin
  if p_rol is null or p_rol not in ('admin_cliente', 'equipo') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa and e.estado = 'activa') then
    raise exception 'empresa_no_disponible' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.perfiles p join public.miembros m on m.user_id = p.user_id
              where p.correo = v_correo and m.empresa_id = p_empresa and m.quitado_en is null) then
    raise exception 'correo_ya_es_miembro' using errcode = 'P0001';
  end if;
  -- Solo el super admin recibe el detalle. Al admin del cliente no se le revela quien existe en el
  -- portal: la invitacion se acepta y el rechazo ocurre al activarla (aceptar_invitacion).
  if private.es_super_admin() and (
       exists (select 1 from public.perfiles p join public.super_admins s on s.user_id = p.user_id where p.correo = v_correo)
       or exists (select 1 from public.perfiles p join public.miembros m on m.user_id = p.user_id
                   where p.correo = v_correo and m.quitado_en is null)) then
    raise exception 'correo_no_invitable' using errcode = 'P0001';
  end if;

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
  if not (private.es_super_admin() or (private.es_admin_cliente(p_empresa_id) and p_rol is not distinct from 'equipo')) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  return private.crear_invitacion(p_empresa_id, p_correo, p_rol, p_aprobar, p_ver_dinero,
                                  p_ver_todos_tickets, p_subir_archivos);
end $$;

-- ---------- I-1: aceptar_invitacion sin p_ip ----------
drop function public.aceptar_invitacion(text, text, text, text, inet);
create function public.aceptar_invitacion(
  p_token text, p_version_politica text, p_nombre text default null, p_celular text default null)
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
  -- La IP la pone la base (private.ip_cliente), nunca el usuario.
  insert into public.aceptaciones_politica (user_id, version, ip)
  values (v_uid, p_version_politica, private.ip_cliente());
  insert into public.preferencias_usuario (user_id) values (v_uid) on conflict do nothing;

  return jsonb_build_object('empresa_id', v_inv.empresa_id, 'miembro_id', v_miembro, 'rol', v_inv.rol);
end $$;
revoke all on function public.aceptar_invitacion(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.aceptar_invitacion(text, text, text, text) to authenticated;

-- ---------- M-3: quitar / bloquear revocan las invitaciones pendientes ----------
create or replace function public.quitar_miembro(p_miembro_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.miembros := private.miembro_gestionable(p_miembro_id);
begin
  if m.quitado_en is not null then
    raise exception 'miembro_ya_quitado' using errcode = 'P0001';
  end if;
  update public.miembros set quitado_en = now() where id = m.id;
  perform private.revocar_invitaciones_de(m.user_id, m.empresa_id);
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
    perform private.revocar_invitaciones_de(m.user_id, m.empresa_id);
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
  if coalesce(p_bloqueado, true) then
    perform private.revocar_invitaciones_de(p_user_id, null);
    perform private.cerrar_sesiones(p_user_id);
  end if;
end $$;

-- ---------- M-4: revocar_invitacion ----------
create function public.revocar_invitacion(p_invitacion_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invitaciones;
begin
  select * into i from public.invitaciones where id = p_invitacion_id for update;
  -- Mismo error si no existe o no es suya. El admin del cliente solo revoca las de rol "equipo".
  if not found or not (private.es_super_admin() or (private.es_admin_cliente(i.empresa_id) and i.rol = 'equipo')) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if i.usada_en is not null or i.revocada_en is not null then
    raise exception 'invitacion_no_pendiente' using errcode = 'P0001';
  end if;
  update public.invitaciones set revocada_en = now() where id = i.id;
end $$;
revoke all on function public.revocar_invitacion(uuid) from public, anon, authenticated, service_role;
grant execute on function public.revocar_invitacion(uuid) to authenticated;

-- ---------- M-2: mi_contexto para visitantes (responde sin_sesion, no revela nada) ----------
grant execute on function public.mi_contexto() to anon;

-- ---------- I-3: el gancho de registro ya no se abre si super_admins esta vacia ----------
-- El primer super admin se crea a mano (listas-de-chequeo/salida-a-produccion.md).
create or replace function private.gancho_antes_de_crear_usuario(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_correo text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if exists (select 1 from public.invitaciones i
              where i.correo = v_correo and i.usada_en is null and i.revocada_en is null and i.vence_en > now()) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('message', 'registro_solo_por_invitacion', 'http_code', 403));
end $$;

-- ---------- M-5: el admin lee perfiles solo de quien esta activo en su empresa ----------
-- (o de quien ya salio y no esta activo en otra: se conserva el historial).
create or replace function private.es_admin_de_usuario(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros m
     where m.user_id = p_user
       and private.es_admin_cliente(m.empresa_id)
       and (m.quitado_en is null
            or not exists (select 1 from public.miembros m2
                            where m2.user_id = p_user and m2.quitado_en is null and m2.empresa_id <> m.empresa_id)))
$$;

-- ---------- I-5: bloqueo a los 5 intentos fallidos / 15 minutos ----------
-- Pensado para el gancho "password_verification_attempt" de Supabase Auth (plan Pro).
-- Entrada: {"user_id": "...", "valid": true|false}. Salida: {"decision": "continue"|"reject", "message": "..."}.
-- Los parametros viven en configuracion('intentos_acceso'). Mientras el gancho no este activo en el
-- panel (config.toml lo deja apagado) esta logica no se ejecuta: ver plan B en la nota para Frontend.
create table public.intentos_acceso (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  fallos         integer not null default 0 check (fallos >= 0),
  ultimo_fallo   timestamptz,
  bloqueado_hasta timestamptz
);
alter table public.intentos_acceso enable row level security;
revoke all on public.intentos_acceso from anon, authenticated, service_role;
-- Sin politicas ni permisos: invisible desde la API, como super_admins. Solo la funcion del gancho la toca.

create function private.gancho_intento_de_acceso(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := nullif(event ->> 'user_id', '')::uuid;
  v_valido boolean := coalesce((event ->> 'valid')::boolean, false);
  v_max int := coalesce((select (c.valor ->> 'max_fallos')::int from public.configuracion c where c.clave = 'intentos_acceso'), 5);
  v_min int := coalesce((select (c.valor ->> 'minutos_bloqueo')::int from public.configuracion c where c.clave = 'intentos_acceso'), 15);
  r public.intentos_acceso;
  v_rechazo jsonb := jsonb_build_object('decision', 'reject', 'message', 'cuenta_frenada_temporalmente');
begin
  if v_uid is null then
    return jsonb_build_object('decision', 'continue');
  end if;
  insert into public.intentos_acceso (user_id) values (v_uid) on conflict do nothing;
  select * into r from public.intentos_acceso where user_id = v_uid for update;

  -- Con la cuenta frenada no entra nadie, ni con la clave correcta (si no, el freno no sirve contra fuerza bruta).
  if r.bloqueado_hasta is not null and r.bloqueado_hasta > now() then
    return v_rechazo;
  end if;
  if v_valido then
    update public.intentos_acceso set fallos = 0, ultimo_fallo = null, bloqueado_hasta = null where user_id = v_uid;
    return jsonb_build_object('decision', 'continue');
  end if;

  -- Solo cuentan los fallos "seguidos": si el anterior fue hace mas del tiempo de freno, se empieza de cero.
  if r.ultimo_fallo is not null and r.ultimo_fallo < now() - make_interval(mins => v_min) then
    r.fallos := 0;
  end if;
  r.fallos := r.fallos + 1;
  if r.fallos >= v_max then
    update public.intentos_acceso set fallos = 0, ultimo_fallo = now(),
           bloqueado_hasta = now() + make_interval(mins => v_min) where user_id = v_uid;
    perform private.registrar(
      (select m.empresa_id from public.miembros m where m.user_id = v_uid and m.quitado_en is null),
      'cuenta_frenada_por_intentos', 'intentos_acceso', v_uid::text, jsonb_build_object('minutos', v_min));
    return v_rechazo;
  end if;
  update public.intentos_acceso set fallos = r.fallos, ultimo_fallo = now() where user_id = v_uid;
  return jsonb_build_object('decision', 'continue');
end $$;
revoke all on function private.gancho_intento_de_acceso(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.gancho_intento_de_acceso(jsonb) to supabase_auth_admin;
