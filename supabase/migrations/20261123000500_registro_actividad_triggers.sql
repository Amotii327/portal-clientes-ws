-- Sprint 1 · El registro de actividad se escribe desde la base (triggers), no desde la pantalla.
-- Eventos: empresa creada/editada/pausada/reactivada, facturacion editada, miembro agregado/quitado/
-- bloqueado/desbloqueado, permisos cambiados, invitacion creada/aceptada/revocada, usuario bloqueado,
-- super admin agregado/quitado, politica aceptada, configuracion cambiada.
-- Los datos personales NO se copian al detalle salvo el correo invitado (lo necesita el super admin).
-- Equipo Websourcing · Desarrollo

create function private.trg_registro() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_accion text;
  v_empresa uuid;
  v_id text;
  v_detalle jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'empresas' then
    v_empresa := new.id; v_id := new.id::text;
    if tg_op = 'INSERT' then
      v_accion := 'empresa_creada'; v_detalle := jsonb_build_object('nombre', new.nombre);
    elsif new.estado is distinct from old.estado then
      v_accion := case new.estado when 'pausada' then 'empresa_pausada' else 'empresa_reactivada' end;
      v_detalle := jsonb_build_object('motivo', new.motivo_pausa);
    elsif (new.nombre, new.logo_path) is distinct from (old.nombre, old.logo_path) then
      v_accion := 'empresa_editada';
    else
      return null;
    end if;

  elsif tg_table_name = 'datos_facturacion' then
    v_empresa := new.empresa_id; v_id := new.empresa_id::text;
    if tg_op = 'INSERT' then
      v_accion := 'facturacion_creada';
    else
      v_accion := 'facturacion_editada';
      v_detalle := jsonb_build_object('campos', (
        select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
          from jsonb_object_keys(to_jsonb(new)) k
         where k not in ('actualizado_en', 'actualizado_por')
           and to_jsonb(new) -> k is distinct from to_jsonb(old) -> k));
    end if;

  elsif tg_table_name = 'miembros' then
    v_empresa := new.empresa_id; v_id := new.id::text;
    if tg_op = 'INSERT' then
      v_accion := 'miembro_agregado'; v_detalle := jsonb_build_object('rol', new.rol, 'user_id', new.user_id);
    elsif new.quitado_en is distinct from old.quitado_en then
      v_accion := 'miembro_quitado'; v_detalle := jsonb_build_object('user_id', new.user_id);
    elsif new.bloqueado is distinct from old.bloqueado then
      v_accion := case when new.bloqueado then 'miembro_bloqueado' else 'miembro_desbloqueado' end;
      v_detalle := jsonb_build_object('user_id', new.user_id);
    elsif (new.aprobar, new.ver_dinero, new.ver_todos_tickets, new.subir_archivos)
          is distinct from (old.aprobar, old.ver_dinero, old.ver_todos_tickets, old.subir_archivos) then
      v_accion := 'permisos_cambiados';
      v_detalle := jsonb_build_object('user_id', new.user_id,
        'antes', jsonb_build_object('aprobar', old.aprobar, 'ver_dinero', old.ver_dinero,
                 'ver_todos_tickets', old.ver_todos_tickets, 'subir_archivos', old.subir_archivos),
        'despues', jsonb_build_object('aprobar', new.aprobar, 'ver_dinero', new.ver_dinero,
                 'ver_todos_tickets', new.ver_todos_tickets, 'subir_archivos', new.subir_archivos));
    else
      return null;
    end if;

  elsif tg_table_name = 'invitaciones' then
    v_empresa := new.empresa_id; v_id := new.id::text;
    if tg_op = 'INSERT' then
      v_accion := 'invitacion_creada';
      v_detalle := jsonb_build_object('correo', new.correo, 'rol', new.rol, 'vence_en', new.vence_en);
    elsif new.usada_en is distinct from old.usada_en then
      v_accion := 'invitacion_aceptada'; v_detalle := jsonb_build_object('usada_por', new.usada_por);
    elsif new.revocada_en is distinct from old.revocada_en then
      v_accion := 'invitacion_revocada'; v_detalle := jsonb_build_object('correo', new.correo);
    else
      return null;
    end if;

  elsif tg_table_name = 'perfiles' then
    if new.bloqueado is distinct from old.bloqueado then
      v_accion := case when new.bloqueado then 'usuario_bloqueado' else 'usuario_desbloqueado' end;
      v_id := new.user_id::text;
      v_empresa := (select m.empresa_id from public.miembros m
                     where m.user_id = new.user_id order by m.creado_en desc limit 1);
    else
      return null;
    end if;

  elsif tg_table_name = 'super_admins' then
    v_id := coalesce(new.user_id, old.user_id)::text;
    v_accion := case tg_op when 'INSERT' then 'super_admin_agregado' else 'super_admin_quitado' end;

  elsif tg_table_name = 'aceptaciones_politica' then
    v_id := new.user_id::text; v_accion := 'politica_aceptada';
    v_empresa := (select m.empresa_id from public.miembros m
                   where m.user_id = new.user_id order by m.creado_en desc limit 1);
    v_detalle := jsonb_build_object('version', new.version);

  elsif tg_table_name = 'configuracion' then
    v_id := new.clave; v_accion := 'configuracion_cambiada';
    v_detalle := jsonb_build_object('clave', new.clave);
  end if;

  perform private.registrar(v_empresa, v_accion, tg_table_name::text, v_id, v_detalle);
  return null;
end $$;
revoke all on function private.trg_registro() from public, anon, authenticated, service_role;

create trigger empresas_registro after insert or update on public.empresas
  for each row execute function private.trg_registro();
create trigger datos_facturacion_registro after insert or update on public.datos_facturacion
  for each row execute function private.trg_registro();
create trigger miembros_registro after insert or update on public.miembros
  for each row execute function private.trg_registro();
create trigger invitaciones_registro after insert or update on public.invitaciones
  for each row execute function private.trg_registro();
create trigger perfiles_registro after update on public.perfiles
  for each row execute function private.trg_registro();
create trigger super_admins_registro after insert or delete on public.super_admins
  for each row execute function private.trg_registro();
create trigger aceptaciones_politica_registro after insert on public.aceptaciones_politica
  for each row execute function private.trg_registro();
create trigger configuracion_registro after insert or update on public.configuracion
  for each row execute function private.trg_registro();

-- Quien hizo el cambio (columnas "por")
create function private.poner_actualizado_por() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_por := auth.uid();
  return new;
end $$;
revoke all on function private.poner_actualizado_por() from public, anon, authenticated, service_role;
create trigger datos_facturacion_autor before insert or update on public.datos_facturacion
  for each row execute function private.poner_actualizado_por();
create trigger configuracion_autor before insert or update on public.configuracion
  for each row execute function private.poner_actualizado_por();

-- Configuracion inicial (valores ya aprobados: D-002 horario habil, D-003 tiempos de respuesta).
insert into public.configuracion (clave, valor) values
  ('marca', '{"nombre": "Websourcing"}'),
  ('horario_habil', '{"dias": [1,2,3,4,5], "desde": "08:00", "hasta": "18:00", "zona": "America/Bogota", "festivos": false}'),
  ('tiempos_respuesta', '{"urgente": {"horas_habiles": 2}, "alta": {"dias_habiles": 1}, "normal": {"dias_habiles": 2}, "baja": "siguiente_planeacion"}'),
  ('politica_datos', '{"version": "v1"}'),
  -- D-014: el codigo adicional del admin del cliente es obligatorio ANTES de produccion.
  -- DevOps/Backend lo pone en true al activar produccion (control 5).
  ('seguridad', '{"exigir_2fa_admin_cliente": false}');
