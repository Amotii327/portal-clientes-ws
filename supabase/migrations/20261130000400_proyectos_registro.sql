-- Sprint 2 · Registro de actividad e historial del proyecto, escritos por triggers (nunca por la pantalla).
--  * registro_actividad: todo, con IP y autor (solo el super admin lo lee).
--  * historial_proyecto: la version "apta para el cliente": sin IP, sin nombres del equipo, sin acciones
--    internas, y con visible_cliente = false para borradores del plan y para el hito 13 oculto.
-- Equipo Websourcing · Desarrollo

create function private.escribir_historial(
  p_empresa uuid, p_proyecto uuid, p_tipo text, p_detalle jsonb, p_visible boolean) returns void
language sql security definer set search_path = '' as $$
  insert into public.historial_proyecto (empresa_id, proyecto_id, tipo, actor_tipo, detalle, visible_cliente)
  values (p_empresa, p_proyecto, p_tipo,
          case when auth.uid() is null then 'sistema'
               when exists (select 1 from public.super_admins s where s.user_id = auth.uid()) then 'equipo_websourcing'
               else 'cliente' end,
          coalesce(p_detalle, '{}'::jsonb), p_visible)
$$;

-- Columnas que cambiaron entre dos filas (sin las de control).
create function private.campos_cambiados(p_nuevo jsonb, p_viejo jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
    from jsonb_object_keys(p_nuevo) k
   where k not in ('actualizado_en', 'avance_pct', 'avance_partes_hechas', 'avance_partes_total')
     and p_nuevo -> k is distinct from p_viejo -> k
$$;

create function private.trg_registro_proyectos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_plan_ok boolean;
  v_hito public.hitos;
  v_campos jsonb;
begin
  if tg_table_name = 'proyectos' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'proyecto_creado', 'proyectos', new.id::text,
        jsonb_build_object('proyecto_id', new.id, 'nombre', new.nombre));
      perform private.escribir_historial(new.empresa_id, new.id, 'proyecto_creado', jsonb_build_object('nombre', new.nombre), true);
      return null;
    end if;
    if new.estado is distinct from old.estado then
      perform private.registrar(new.empresa_id, 'proyecto_estado_cambiado', 'proyectos', new.id::text,
        jsonb_build_object('proyecto_id', new.id, 'antes', old.estado, 'despues', new.estado));
      perform private.escribir_historial(new.empresa_id, new.id, 'proyecto_estado_cambiado',
        jsonb_build_object('antes', old.estado, 'despues', new.estado), true);
    end if;
    if new.plan_estado is distinct from old.plan_estado then
      perform private.registrar(new.empresa_id, 'plan_sprints_aprobado', 'proyectos', new.id::text,
        jsonb_build_object('proyecto_id', new.id));
      perform private.escribir_historial(new.empresa_id, new.id, 'plan_sprints_aprobado', '{}'::jsonb, true);
    end if;
    v_campos := private.campos_cambiados(to_jsonb(new), to_jsonb(old)) - 'estado' - 'plan_estado' - 'plan_aprobado_en';
    if jsonb_array_length(v_campos) > 0 then
      perform private.registrar(new.empresa_id, 'proyecto_editado', 'proyectos', new.id::text,
        jsonb_build_object('proyecto_id', new.id, 'campos', v_campos));
    end if;

  elsif tg_table_name = 'hitos' then
    if tg_op = 'INSERT' then return null; end if;   -- los 13 nacen con el proyecto (ya anotado)
    if new.estado is distinct from old.estado then
      perform private.registrar(new.empresa_id, 'hito_estado_cambiado', 'hitos', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'numero', new.numero, 'antes', old.estado, 'despues', new.estado));
      perform private.escribir_historial(new.empresa_id, new.proyecto_id, 'hito_estado_cambiado',
        jsonb_build_object('numero', new.numero, 'nombre', new.nombre, 'antes', old.estado, 'despues', new.estado), new.visible);
    end if;
    if new.fecha_planeada is distinct from old.fecha_planeada then
      perform private.registrar(new.empresa_id, 'hito_fecha_cambiada', 'hitos', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'numero', new.numero, 'antes', old.fecha_planeada, 'despues', new.fecha_planeada));
      -- Cambiar una fecha ya fijada genera un "retraso" (con motivo), que es lo que ve el cliente.
      if old.fecha_planeada is null then
        perform private.escribir_historial(new.empresa_id, new.proyecto_id, 'hito_fecha_fijada',
          jsonb_build_object('numero', new.numero, 'nombre', new.nombre, 'fecha', new.fecha_planeada), new.visible);
      end if;
    end if;
    if new.visible is distinct from old.visible then
      perform private.registrar(new.empresa_id, 'hito_visibilidad_cambiada', 'hitos', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'numero', new.numero, 'visible', new.visible));
    end if;
    if new.nombre is distinct from old.nombre then
      perform private.registrar(new.empresa_id, 'hito_editado', 'hitos', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'numero', new.numero, 'campos', jsonb_build_array('nombre')));
    end if;

  elsif tg_table_name = 'sprints' then
    if tg_op = 'DELETE' then
      perform private.registrar(old.empresa_id, 'sprint_quitado', 'sprints', old.id::text,
        jsonb_build_object('proyecto_id', old.proyecto_id, 'numero', old.numero, 'nombre', old.nombre, 'estado', old.estado));
      return null;
    end if;
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'sprint_agregado', 'sprints', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'numero', new.numero, 'nombre', new.nombre));
      return null;
    end if;
    select (p.plan_estado = 'aprobado') into v_plan_ok from public.proyectos p where p.id = new.proyecto_id;
    if new.estado is distinct from old.estado then
      perform private.registrar(new.empresa_id, 'sprint_estado_cambiado', 'sprints', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'numero', new.numero, 'antes', old.estado, 'despues', new.estado));
      -- Aprobar el plan pasa todos de propuesto a aprobado: eso ya queda como "plan aprobado".
      if not (old.estado = 'propuesto' and new.estado = 'aprobado') then
        perform private.escribir_historial(new.empresa_id, new.proyecto_id, 'sprint_estado_cambiado',
          jsonb_build_object('numero', new.numero, 'nombre', new.nombre, 'antes', old.estado, 'despues', new.estado), coalesce(v_plan_ok, false));
      end if;
    end if;
    if (new.fecha_inicio, new.fecha_fin, new.fecha_demo) is distinct from (old.fecha_inicio, old.fecha_fin, old.fecha_demo) then
      perform private.registrar(new.empresa_id, 'sprint_fechas_cambiadas', 'sprints', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'numero', new.numero,
          'antes', jsonb_build_object('inicio', old.fecha_inicio, 'fin', old.fecha_fin, 'demo', old.fecha_demo),
          'despues', jsonb_build_object('inicio', new.fecha_inicio, 'fin', new.fecha_fin, 'demo', new.fecha_demo)));
    end if;
    if (new.nombre, new.incluye) is distinct from (old.nombre, old.incluye) then
      perform private.registrar(new.empresa_id, 'sprint_editado', 'sprints', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'numero', new.numero));
    end if;

  elsif tg_table_name = 'retrasos' then
    select * into v_hito from public.hitos h where h.id = new.hito_id;
    perform private.registrar(new.empresa_id, 'retraso_registrado', 'hitos', new.hito_id::text,
      jsonb_build_object('proyecto_id', new.proyecto_id, 'numero', v_hito.numero, 'antes', new.fecha_anterior,
                         'despues', new.fecha_nueva, 'lado', new.lado, 'motivo', new.motivo));
    perform private.escribir_historial(new.empresa_id, new.proyecto_id, 'retraso_registrado',
      jsonb_build_object('numero', v_hito.numero, 'nombre', v_hito.nombre, 'fecha_anterior', new.fecha_anterior,
                         'fecha_nueva', new.fecha_nueva, 'lado', new.lado, 'motivo', new.motivo, 'que_falta', new.que_falta),
      v_hito.visible);

  elsif tg_table_name = 'cambios_plan' then
    perform private.registrar(new.empresa_id, 'plan_sprints_modificado', 'proyectos', new.proyecto_id::text,
      jsonb_build_object('proyecto_id', new.proyecto_id, 'tipo', new.tipo, 'motivo', new.motivo));
    perform private.escribir_historial(new.empresa_id, new.proyecto_id, 'plan_sprints_modificado',
      jsonb_build_object('tipo', new.tipo, 'motivo', new.motivo), true);

  elsif tg_table_name = 'hitos_pago_asociado' then
    select * into v_hito from public.hitos h where h.id = coalesce(new.hito_id, old.hito_id);
    perform private.registrar(coalesce(new.empresa_id, old.empresa_id), 'pago_hito_cambiado', 'hitos',
      coalesce(new.hito_id, old.hito_id)::text,
      jsonb_build_object('proyecto_id', v_hito.proyecto_id, 'numero', v_hito.numero,
                         'concepto', case when tg_op = 'DELETE' then null else new.concepto end));

  elsif tg_table_name = 'sesiones_ver_como' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'ver_como_iniciado', 'sesiones_ver_como', new.id::text,
        jsonb_build_object('rol', new.rol, 'vence_en', new.vence_en));
    elsif new.terminada_en is not null and old.terminada_en is null then
      perform private.registrar(new.empresa_id, 'ver_como_terminado', 'sesiones_ver_como', new.id::text,
        jsonb_build_object('motivo', new.motivo_cierre));
    end if;
  end if;
  return null;
end $$;

revoke all on function private.escribir_historial(uuid, uuid, text, jsonb, boolean),
  private.campos_cambiados(jsonb, jsonb), private.trg_registro_proyectos()
  from public, anon, authenticated, service_role;

create trigger proyectos_registro after insert or update on public.proyectos for each row execute function private.trg_registro_proyectos();
create trigger hitos_registro after insert or update on public.hitos for each row execute function private.trg_registro_proyectos();
create trigger sprints_registro after insert or update or delete on public.sprints for each row execute function private.trg_registro_proyectos();
create trigger retrasos_registro after insert on public.retrasos for each row execute function private.trg_registro_proyectos();
create trigger cambios_plan_registro after insert on public.cambios_plan for each row execute function private.trg_registro_proyectos();
create trigger hitos_pago_registro after insert or update or delete on public.hitos_pago_asociado for each row execute function private.trg_registro_proyectos();
create trigger sesiones_ver_como_registro after insert or update on public.sesiones_ver_como for each row execute function private.trg_registro_proyectos();

-- Para filtrar el registro de un proyecto (super admin) y el rastro de rechazos (M-7).
create index registro_actividad_proyecto_idx on public.registro_actividad ((detalle ->> 'proyecto_id'), id desc)
  where detalle ? 'proyecto_id';
create index registro_actividad_rechazos_idx on public.registro_actividad (actor_id, creado_en desc)
  where accion = 'accion_rechazada';
