-- Sprint 1 · Funciones auxiliares de las reglas (esquema private, fuera de la API).
-- Todas SECURITY DEFINER con search_path fijo. Permisos y estado se leen de la BASE en cada
-- consulta, nunca del token. Del token solo se toma el nivel de autenticacion (aal) y el usuario.
-- Equipo Websourcing · Desarrollo

-- Nivel de autenticacion de la sesion: 'aal2' = ya paso el codigo del celular (2FA).
create function private.nivel_sesion() returns text
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1')
$$;

-- Direccion IP del cliente, tomada de la cabecera que pone el proxy (PostgREST la expone en
-- request.headers). Si no hay cabecera o no es una IP valida, devuelve null.
create function private.ip_cliente() returns inet
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

-- Valor de un interruptor de seguridad en configuracion('seguridad').
create function private.exigir_2fa_admin_cliente() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (c.valor ->> 'exigir_2fa_admin_cliente')::boolean
                     from public.configuracion c where c.clave = 'seguridad'), false)
$$;

-- Super admin = esta en super_admins, su perfil no esta bloqueado Y la sesion tiene 2FA (aal2).
-- Toda politica del super admin pasa por aqui: sin 2FA completado no tiene ningun poder.
create function private.es_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.nivel_sesion() = 'aal2'
     and exists (select 1
                   from public.super_admins s
                   join public.perfiles p on p.user_id = s.user_id
                  where s.user_id = auth.uid() and not p.bloqueado)
$$;

-- Fila de miembros del usuario actual SOLO si hoy tiene acceso real:
-- no quitado, ni bloqueado (miembro o perfil), empresa activa y, si se exige, con 2FA el admin.
-- Devuelve null en cualquier otro caso.
create function private.miembro_activo() returns public.miembros
language sql stable security definer set search_path = '' as $$
  select m.*
    from public.miembros m
    join public.perfiles p on p.user_id = m.user_id
    join public.empresas e on e.id = m.empresa_id
   where m.user_id = auth.uid()
     and m.quitado_en is null
     and not m.bloqueado
     and not p.bloqueado
     and e.estado = 'activa'
     and (m.rol <> 'admin_cliente'
          or not private.exigir_2fa_admin_cliente()
          or private.nivel_sesion() = 'aal2')
$$;

create function private.mi_empresa_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select (private.miembro_activo()).empresa_id
$$;

create function private.es_admin_cliente(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((private.miembro_activo()).rol = 'admin_cliente'
                  and (private.miembro_activo()).empresa_id = p_empresa, false)
$$;

-- Permisos: aprobar, ver_dinero, ver_todos_tickets, subir_archivos. El admin los tiene todos
-- (lo garantiza un check en la tabla).
create function private.tiene_permiso(p_empresa uuid, p_permiso text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (private.miembro_activo()).empresa_id = p_empresa
    and case p_permiso
          when 'aprobar'           then (private.miembro_activo()).aprobar
          when 'ver_dinero'        then (private.miembro_activo()).ver_dinero
          when 'ver_todos_tickets' then (private.miembro_activo()).ver_todos_tickets
          when 'subir_archivos'    then (private.miembro_activo()).subir_archivos
          else false
        end, false)
$$;

-- Tiene acceso al portal ahora mismo (super admin con 2FA, o miembro activo).
create function private.tiene_acceso() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.es_super_admin() or private.mi_empresa_id() is not null
$$;

-- El usuario actual es admin del cliente de una empresa donde p_user tiene (o tuvo) una fila.
create function private.es_admin_de_usuario(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros m
     where m.user_id = p_user
       and private.es_admin_cliente(m.empresa_id))
$$;

-- Politica de datos vigente (configuracion).
create function private.version_politica_vigente() returns text
language sql stable security definer set search_path = '' as $$
  select c.valor ->> 'version' from public.configuracion c where c.clave = 'politica_datos'
$$;

-- Cierra todas las sesiones abiertas de un usuario (al quitar, bloquear o pausar).
create function private.cerrar_sesiones(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user
$$;

-- Escribe en el registro de actividad. Solo la llaman los triggers (no tiene permisos para nadie mas).
create function private.registrar(p_empresa uuid, p_accion text, p_entidad text, p_entidad_id text, p_detalle jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.registro_actividad (empresa_id, actor_id, actor_tipo, accion, entidad, entidad_id, detalle, ip)
  values (p_empresa, auth.uid(), case when auth.uid() is null then 'sistema' else 'usuario' end,
          p_accion, p_entidad, p_entidad_id, coalesce(p_detalle, '{}'::jsonb), private.ip_cliente())
$$;

-- Permisos de ejecucion: nadie por defecto; las que usan las politicas, solo authenticated.
revoke all on function
  private.nivel_sesion(), private.ip_cliente(), private.exigir_2fa_admin_cliente(), private.es_super_admin(),
  private.miembro_activo(), private.mi_empresa_id(), private.es_admin_cliente(uuid),
  private.tiene_permiso(uuid, text), private.tiene_acceso(), private.es_admin_de_usuario(uuid),
  private.version_politica_vigente(), private.cerrar_sesiones(uuid),
  private.registrar(uuid, text, text, text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function
  private.nivel_sesion(), private.es_super_admin(), private.miembro_activo(), private.mi_empresa_id(),
  private.es_admin_cliente(uuid), private.tiene_permiso(uuid, text), private.tiene_acceso(),
  private.es_admin_de_usuario(uuid)
  to authenticated;
