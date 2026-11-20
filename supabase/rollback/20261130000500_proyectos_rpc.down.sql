-- Rollback del sprint 2 · funciones RPC. Restaura mi_contexto (000600) y el gancho de intentos (000700).
drop function if exists public.anotar_rechazo(text, text);
drop function if exists public.linea_de_tiempo(uuid);
drop function if exists public.inicio_cliente();
drop function if exists public.panel_super_admin();
drop view if exists public.v_proyectos_resumen;
drop function if exists public.terminar_ver_como();
drop function if exists public.iniciar_ver_como(uuid, text, boolean, boolean, boolean, boolean);
drop function if exists public.aprobar_plan_sprints(uuid);
drop function if exists public.reordenar_sprints(uuid, uuid[], text);
drop function if exists public.quitar_sprint(uuid, text);
drop function if exists public.editar_sprint(uuid, text, date, date, date, text[], text, text, boolean);
drop function if exists public.agregar_sprint(uuid, text, date, date, date, text[], text);
drop function if exists public.cargar_plan_sprints(uuid, jsonb);
drop function if exists public.fijar_pago_hito(uuid, text);
drop function if exists public.editar_hito(uuid, text, text, date, text, text, text, boolean, date);
drop function if exists public.editar_proyecto(uuid, text, text, text, date, date, date);
drop function if exists public.crear_proyecto(uuid, text, text, date, date);
drop function if exists private.validar_sprint(text, date, date, date, text[]);
drop function if exists private.proyecto_para_cambio(uuid, boolean);
drop function if exists private.exigir_super_admin();
drop function if exists private.texto(text, int, int);

create or replace function public.mi_contexto() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_aal text := private.nivel_sesion();
  p public.perfiles;
  m public.miembros;
  e public.empresas;
  v_estado text;
  v_tema text;
begin
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_sesion');
  end if;
  select * into p from public.perfiles where user_id = v_uid;
  if not found then
    return jsonb_build_object('estado', 'sin_perfil', 'user_id', v_uid, 'aal', v_aal);
  end if;
  select pu.tema into v_tema from public.preferencias_usuario pu where pu.user_id = v_uid;
  v_tema := coalesce(v_tema, 'clara');

  if p.bloqueado then
    v_estado := 'usuario_bloqueado';
  elsif exists (select 1 from public.super_admins s where s.user_id = v_uid) then
    v_estado := case when v_aal = 'aal2' then 'super_admin' else 'super_admin_requiere_2fa' end;
  else
    select * into m from public.miembros x where x.user_id = v_uid
     order by (x.quitado_en is null) desc, x.creado_en desc limit 1;
    if not found then
      v_estado := 'sin_membresia';
    else
      select * into e from public.empresas where id = m.empresa_id;
      v_estado := case
        when m.quitado_en is not null then 'miembro_quitado'
        when m.bloqueado then 'miembro_bloqueado'
        when e.estado = 'pausada' then 'empresa_pausada'
        when m.rol = 'admin_cliente' and private.exigir_2fa_admin_cliente() and v_aal <> 'aal2' then 'requiere_2fa'
        else 'activo' end;
    end if;
  end if;

  return jsonb_build_object(
    'estado', v_estado, 'user_id', v_uid, 'aal', v_aal, 'nombre', p.nombre, 'tema', v_tema,
    'es_super_admin', v_estado in ('super_admin', 'super_admin_requiere_2fa'),
    'empresa', case when e.id is null then null else jsonb_build_object('id', e.id, 'nombre', e.nombre, 'estado', e.estado) end,
    'rol', m.rol,
    'permisos', case when m.id is null or v_estado <> 'activo' then null else jsonb_build_object(
        'aprobar', m.aprobar, 'ver_dinero', m.ver_dinero,
        'ver_todos_tickets', m.ver_todos_tickets, 'subir_archivos', m.subir_archivos) end);
end $$;

create or replace function private.gancho_intento_de_acceso(event jsonb) returns jsonb
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
  if r.bloqueado_hasta is not null and r.bloqueado_hasta > now() then
    return v_rechazo;
  end if;
  if v_valido then
    update public.intentos_acceso set fallos = 0, ultimo_fallo = null, bloqueado_hasta = null where user_id = v_uid;
    return jsonb_build_object('decision', 'continue');
  end if;
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
