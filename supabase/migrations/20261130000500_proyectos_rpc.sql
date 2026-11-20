-- Sprint 2 · Funciones RPC de proyectos, hitos, plan de sprints, "ver como", panel y rechazos (M-7).
-- Las de escritura son SECURITY DEFINER con search_path vacio y comprueban QUIEN llama.
-- Las de lectura (panel, inicio, linea de tiempo) son SECURITY INVOKER: corren con las mismas
-- cerraduras (RLS) que el usuario, asi el cliente nunca recibe borradores ni el hito 13 oculto.
-- Errores: codigos estables en el mensaje (ver docs/2026-11-27_nota_backend-para-frontend_sprint2_v1.md).
-- Equipo Websourcing · Desarrollo

-- ---------- Utilidades internas ----------
create function private.texto(p text, p_min int, p_max int) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(coalesce(p, ''));
begin
  if char_length(v) not between p_min and p_max then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  return v;
end $$;

-- Solo el super admin con 2FA y SIN sesion "ver como" abierta. En "ver como" todo es solo lectura.
create function private.exigir_super_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.es_super_admin() then return; end if;
  if private.es_super_admin_real() then
    raise exception 'ver_como_solo_lectura' using errcode = '42501';
  end if;
  raise exception 'no_autorizado' using errcode = '42501';
end $$;

-- Bloquea el proyecto para cambiarlo. Un proyecto terminado o cancelado no se toca (se reabre con editar_proyecto).
create function private.proyecto_para_cambio(p_id uuid, p_permitir_cerrado boolean default false) returns public.proyectos
language plpgsql security definer set search_path = '' as $$
declare p public.proyectos;
begin
  select * into p from public.proyectos where id = p_id for update;
  if not found then raise exception 'proyecto_no_encontrado' using errcode = 'P0001'; end if;
  if not p_permitir_cerrado and p.estado in ('terminado', 'cancelado') then
    raise exception 'proyecto_cerrado' using errcode = 'P0001';
  end if;
  return p;
end $$;

create function private.validar_sprint(p_nombre text, p_inicio date, p_fin date, p_demo date, p_incluye text[])
returns text[] language plpgsql immutable set search_path = '' as $$
declare v_item text; v_res text[] := '{}';
begin
  perform private.texto(p_nombre, 2, 120);
  if p_inicio is null or p_fin is null or p_fin < p_inicio or (p_demo is not null and p_demo < p_inicio) then
    raise exception 'fechas_invalidas' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_incluye, '{}')) > 30 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  foreach v_item in array coalesce(p_incluye, '{}') loop
    v_res := v_res || private.texto(v_item, 1, 300);
  end loop;
  return v_res;
end $$;

-- ---------- 1) Crear proyecto con sus 13 hitos ----------
create function public.crear_proyecto(
  p_empresa_id uuid, p_nombre text, p_descripcion text default null,
  p_fecha_inicio date default null, p_fecha_fin_planeada date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nombres text[] := array['Inicio del proyecto', 'Descubrimiento', 'Requerimientos aprobados', 'Arquitectura',
    'Diseño y prototipo', 'Sprints', 'Pruebas finales', 'Pruebas del cliente', 'Capacitación',
    'Salida a producción', 'Entrega final', 'Garantía (30 días)', 'Mantenimiento'];
  v_pagos jsonb := '{"1": "Anticipo", "5": "Segundo pago", "11": "Saldo final", "13": "Cuota mensual"}';
  v_hito_id uuid;
  i int;
begin
  perform private.exigir_super_admin();
  if not exists (select 1 from public.empresas e where e.id = p_empresa_id and e.estado = 'activa') then
    raise exception 'empresa_no_disponible' using errcode = 'P0001';
  end if;
  if p_fecha_inicio is not null and p_fecha_fin_planeada is not null and p_fecha_fin_planeada < p_fecha_inicio then
    raise exception 'fechas_invalidas' using errcode = '22023';
  end if;
  insert into public.proyectos (empresa_id, nombre, descripcion, fecha_inicio, fecha_fin_planeada)
  values (p_empresa_id, private.texto(p_nombre, 2, 160),
          case when p_descripcion is null then null else private.texto(p_descripcion, 0, 1000) end,
          p_fecha_inicio, p_fecha_fin_planeada)
  returning id into v_id;
  for i in 1..13 loop
    insert into public.hitos (empresa_id, proyecto_id, numero, nombre, visible)
    values (p_empresa_id, v_id, i, v_nombres[i], i <> 13)
    returning id into v_hito_id;
    if v_pagos ? i::text then
      insert into public.hitos_pago_asociado (hito_id, empresa_id, concepto) values (v_hito_id, p_empresa_id, v_pagos ->> i::text);
    end if;
  end loop;
  return jsonb_build_object('proyecto_id', v_id);
end $$;

-- ---------- 2) Editar proyecto (lo que llega nulo no cambia) ----------
create function public.editar_proyecto(
  p_proyecto_id uuid, p_nombre text default null, p_descripcion text default null, p_estado text default null,
  p_fecha_inicio date default null, p_fecha_fin_planeada date default null, p_fecha_fin_real date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.proyectos; v_estado text; v_inicio date; v_fin date; v_real date;
begin
  perform private.exigir_super_admin();
  p := private.proyecto_para_cambio(p_proyecto_id, true);
  v_estado := coalesce(p_estado, p.estado);
  if v_estado not in ('activo', 'pausado', 'terminado', 'cancelado') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_inicio := coalesce(p_fecha_inicio, p.fecha_inicio);
  v_fin := coalesce(p_fecha_fin_planeada, p.fecha_fin_planeada);
  if v_inicio is not null and v_fin is not null and v_fin < v_inicio then
    raise exception 'fechas_invalidas' using errcode = '22023';
  end if;
  v_real := case when v_estado = 'terminado' then coalesce(p_fecha_fin_real, p.fecha_fin_real, private.hoy())
                 else null end;
  if p_fecha_fin_real is not null and v_estado <> 'terminado' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  update public.proyectos
     set nombre = case when p_nombre is null then nombre else private.texto(p_nombre, 2, 160) end,
         descripcion = case when p_descripcion is null then descripcion else nullif(private.texto(p_descripcion, 0, 1000), '') end,
         estado = v_estado, fecha_inicio = v_inicio, fecha_fin_planeada = v_fin, fecha_fin_real = v_real
   where id = p.id;
end $$;

-- ---------- 3) Editar hito: estado, nombre, fechas (con motivo y lado si ya habia fecha) ----------
create function public.editar_hito(
  p_hito_id uuid, p_nombre text default null, p_estado text default null, p_fecha_planeada date default null,
  p_motivo text default null, p_lado text default null, p_que_falta text default null,
  p_visible boolean default null, p_fecha_real date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h public.hitos; p public.proyectos;
  v_estado text; v_real date; v_nombre text; v_visible boolean; v_retraso boolean := false;
begin
  perform private.exigir_super_admin();
  select * into h from public.hitos where id = p_hito_id;
  if not found then raise exception 'hito_no_encontrado' using errcode = 'P0001'; end if;
  p := private.proyecto_para_cambio(h.proyecto_id);
  select * into h from public.hitos where id = p_hito_id for update;

  v_nombre := case when p_nombre is null then h.nombre else private.texto(p_nombre, 2, 120) end;
  v_estado := coalesce(p_estado, h.estado);
  if v_estado not in ('pendiente', 'en_curso', 'esperando_aprobacion', 'terminado') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  -- El hito 6 sale de sus sprints: no se cambia a mano.
  if h.numero = 6 and (v_estado <> h.estado or p_fecha_real is not null) then
    raise exception 'hito_derivado' using errcode = 'P0001';
  end if;
  if p_fecha_real is not null and v_estado <> 'terminado' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_real := case when v_estado = 'terminado'
                 then coalesce(p_fecha_real, case when h.estado = 'terminado' then h.fecha_real end, private.hoy())
                 else null end;
  if v_real > private.hoy() then
    raise exception 'fechas_invalidas' using errcode = '22023';
  end if;

  v_visible := coalesce(p_visible, h.visible);
  if v_visible is distinct from h.visible and h.numero <> 13 then
    raise exception 'hito_no_ocultable' using errcode = 'P0001';
  end if;

  -- Cambiar una fecha ya fijada exige motivo y lado; si es del cliente, tambien que falta.
  if p_fecha_planeada is not null and h.fecha_planeada is not null and p_fecha_planeada <> h.fecha_planeada then
    if p_lado is null or p_lado not in ('websourcing', 'cliente') then
      raise exception 'retraso_requiere_lado' using errcode = '22023';
    end if;
    if p_motivo is null or char_length(btrim(p_motivo)) < 5 then
      raise exception 'retraso_requiere_motivo' using errcode = '22023';
    end if;
    if p_lado = 'cliente' and (p_que_falta is null or char_length(btrim(p_que_falta)) < 3) then
      raise exception 'retraso_requiere_que_falta' using errcode = '22023';
    end if;
    insert into public.retrasos (empresa_id, proyecto_id, hito_id, fecha_anterior, fecha_nueva, motivo, lado, que_falta)
    values (h.empresa_id, h.proyecto_id, h.id, h.fecha_planeada, p_fecha_planeada,
            private.texto(p_motivo, 5, 1000), p_lado,
            case when p_lado = 'cliente' then private.texto(p_que_falta, 3, 500) end);
    v_retraso := true;
  end if;

  update public.hitos
     set nombre = v_nombre, estado = v_estado, fecha_real = v_real, visible = v_visible,
         fecha_planeada = coalesce(p_fecha_planeada, fecha_planeada)
   where id = h.id;
  return jsonb_build_object('hito_id', h.id, 'retraso_registrado', v_retraso);
end $$;

-- ---------- 4) Pago asociado de un hito (solo la etiqueta; vacio la quita) ----------
create function public.fijar_pago_hito(p_hito_id uuid, p_concepto text) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.hitos;
begin
  perform private.exigir_super_admin();
  select * into h from public.hitos where id = p_hito_id;
  if not found then raise exception 'hito_no_encontrado' using errcode = 'P0001'; end if;
  perform private.proyecto_para_cambio(h.proyecto_id);
  if p_concepto is null or btrim(p_concepto) = '' then
    delete from public.hitos_pago_asociado where hito_id = h.id;
  else
    insert into public.hitos_pago_asociado (hito_id, empresa_id, concepto)
    values (h.id, h.empresa_id, private.texto(p_concepto, 2, 120))
    on conflict (hito_id) do update set concepto = excluded.concepto;
  end if;
end $$;

-- ---------- Plan de sprints ----------
-- 5) Cargar la propuesta completa (la deja el Equipo). Solo mientras el plan sea propuesta.
create function public.cargar_plan_sprints(p_proyecto_id uuid, p_sprints jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.proyectos; e jsonb; n int := 0; v_incluye text[];
begin
  perform private.exigir_super_admin();
  p := private.proyecto_para_cambio(p_proyecto_id);
  if p.plan_estado = 'aprobado' then raise exception 'plan_ya_aprobado' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_sprints) is distinct from 'array' or jsonb_array_length(p_sprints) not between 1 and 30 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  delete from public.sprints where proyecto_id = p.id;
  for e in select * from jsonb_array_elements(p_sprints) loop
    begin
      v_incluye := case when jsonb_typeof(e -> 'incluye') = 'array'
                        then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(e -> 'incluye') x)
                        else '{}' end;
      n := n + 1;
      insert into public.sprints (empresa_id, proyecto_id, numero, nombre, fecha_inicio, fecha_fin, fecha_demo, incluye)
      values (p.empresa_id, p.id, n, btrim(e ->> 'nombre'), (e ->> 'fecha_inicio')::date, (e ->> 'fecha_fin')::date,
              (e ->> 'fecha_demo')::date,
              private.validar_sprint(e ->> 'nombre', (e ->> 'fecha_inicio')::date, (e ->> 'fecha_fin')::date,
                                     (e ->> 'fecha_demo')::date, v_incluye));
    exception
      when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or not_null_violation then
        raise exception 'datos_invalidos' using errcode = '22023';
    end;
  end loop;
  return jsonb_build_object('sprints', n, 'avisos', private.avisos_plan(p.id));
end $$;

-- 6) Agregar un sprint al final.
create function public.agregar_sprint(
  p_proyecto_id uuid, p_nombre text, p_fecha_inicio date, p_fecha_fin date, p_fecha_demo date default null,
  p_incluye text[] default '{}', p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.proyectos; v_inc text[]; v_num int; v_id uuid; v_aprobado boolean;
begin
  perform private.exigir_super_admin();
  p := private.proyecto_para_cambio(p_proyecto_id);
  v_aprobado := p.plan_estado = 'aprobado';
  v_inc := private.validar_sprint(p_nombre, p_fecha_inicio, p_fecha_fin, p_fecha_demo, p_incluye);
  if v_aprobado and (p_motivo is null or char_length(btrim(p_motivo)) < 5) then
    raise exception 'plan_requiere_motivo' using errcode = '22023';
  end if;
  select coalesce(max(numero), 0) + 1 into v_num from public.sprints where proyecto_id = p.id;
  insert into public.sprints (empresa_id, proyecto_id, numero, nombre, estado, fecha_inicio, fecha_fin, fecha_demo, incluye)
  values (p.empresa_id, p.id, v_num, btrim(p_nombre), case when v_aprobado then 'aprobado' else 'propuesto' end,
          p_fecha_inicio, p_fecha_fin, p_fecha_demo, v_inc)
  returning id into v_id;
  if v_aprobado then
    insert into public.cambios_plan (empresa_id, proyecto_id, tipo, motivo, detalle)
    values (p.empresa_id, p.id, 'sprint_agregado', private.texto(p_motivo, 5, 1000),
            jsonb_build_object('numero', v_num, 'nombre', btrim(p_nombre), 'fecha_inicio', p_fecha_inicio,
                               'fecha_fin', p_fecha_fin, 'fecha_demo', p_fecha_demo));
  end if;
  return jsonb_build_object('sprint_id', v_id, 'numero', v_num, 'avisos', private.avisos_plan(p.id));
end $$;

-- 7) Editar un sprint (lo nulo no cambia). Con plan aprobado, cambiar fechas o contenido pide motivo.
-- p_correr_siguientes: los sprints que siguen se corren los mismos dias que se movio el FIN de este
-- (si el fin no cambia, lo que se movio el inicio), con la misma duracion.
create function public.editar_sprint(
  p_sprint_id uuid, p_nombre text default null, p_fecha_inicio date default null, p_fecha_fin date default null,
  p_fecha_demo date default null, p_incluye text[] default null, p_estado text default null,
  p_motivo text default null, p_correr_siguientes boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sprints; p public.proyectos;
  v_nombre text; v_ini date; v_fin date; v_demo date; v_inc text[]; v_estado text;
  v_aprobado boolean; v_cambia_plan boolean; v_delta int := 0; v_fechas boolean;
begin
  perform private.exigir_super_admin();
  select * into s from public.sprints where id = p_sprint_id;
  if not found then raise exception 'sprint_no_encontrado' using errcode = 'P0001'; end if;
  p := private.proyecto_para_cambio(s.proyecto_id);
  select * into s from public.sprints where id = p_sprint_id for update;
  v_aprobado := p.plan_estado = 'aprobado';

  v_nombre := coalesce(p_nombre, s.nombre);
  v_ini := coalesce(p_fecha_inicio, s.fecha_inicio);
  v_fin := coalesce(p_fecha_fin, s.fecha_fin);
  v_demo := coalesce(p_fecha_demo, s.fecha_demo);
  v_inc := coalesce(p_incluye, s.incluye);
  v_inc := private.validar_sprint(v_nombre, v_ini, v_fin, v_demo, v_inc);
  v_nombre := btrim(v_nombre);

  v_estado := coalesce(p_estado, s.estado);
  if v_estado not in ('propuesto', 'aprobado', 'en_curso', 'en_revision', 'terminado') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if v_estado <> s.estado then
    if not v_aprobado then raise exception 'plan_no_aprobado' using errcode = 'P0001'; end if;
    if v_estado = 'propuesto' then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  end if;

  v_fechas := (v_ini, v_fin, v_demo) is distinct from (s.fecha_inicio, s.fecha_fin, s.fecha_demo);
  v_cambia_plan := v_fechas or v_nombre <> s.nombre or v_inc is distinct from s.incluye;
  if v_aprobado and v_cambia_plan and (p_motivo is null or char_length(btrim(p_motivo)) < 5) then
    raise exception 'plan_requiere_motivo' using errcode = '22023';
  end if;

  update public.sprints
     set nombre = v_nombre, fecha_inicio = v_ini, fecha_fin = v_fin, fecha_demo = v_demo, incluye = v_inc,
         estado = v_estado, terminado_en = case when v_estado = 'terminado' then coalesce(s.terminado_en, private.hoy()) else null end
   where id = s.id;

  if coalesce(p_correr_siguientes, false) then
    v_delta := case when v_fin <> s.fecha_fin then v_fin - s.fecha_fin else v_ini - s.fecha_inicio end;
    if v_delta <> 0 then
      update public.sprints
         set fecha_inicio = fecha_inicio + v_delta, fecha_fin = fecha_fin + v_delta,
             fecha_demo = fecha_demo + v_delta
       where proyecto_id = s.proyecto_id and numero > s.numero;
    end if;
  end if;

  if v_aprobado and v_cambia_plan then
    insert into public.cambios_plan (empresa_id, proyecto_id, tipo, motivo, detalle)
    values (s.empresa_id, s.proyecto_id, case when v_delta <> 0 then 'fechas_corridas' else 'sprint_editado' end,
            private.texto(p_motivo, 5, 1000),
            jsonb_build_object('numero', s.numero, 'nombre', v_nombre,
              'antes', jsonb_build_object('fecha_inicio', s.fecha_inicio, 'fecha_fin', s.fecha_fin, 'fecha_demo', s.fecha_demo),
              'despues', jsonb_build_object('fecha_inicio', v_ini, 'fecha_fin', v_fin, 'fecha_demo', v_demo),
              'dias_corridos_a_los_siguientes', v_delta));
  end if;
  return jsonb_build_object('sprint_id', s.id, 'avisos', private.avisos_plan(s.proyecto_id));
end $$;

-- 8) Quitar un sprint que aun no empezo; los demas se renumeran.
create function public.quitar_sprint(p_sprint_id uuid, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.sprints; p public.proyectos;
begin
  perform private.exigir_super_admin();
  select * into s from public.sprints where id = p_sprint_id;
  if not found then raise exception 'sprint_no_encontrado' using errcode = 'P0001'; end if;
  p := private.proyecto_para_cambio(s.proyecto_id);
  select * into s from public.sprints where id = p_sprint_id for update;
  if s.estado not in ('propuesto', 'aprobado') then
    raise exception 'sprint_ya_iniciado' using errcode = 'P0001';
  end if;
  if p.plan_estado = 'aprobado' then
    insert into public.cambios_plan (empresa_id, proyecto_id, tipo, motivo, detalle)
    values (s.empresa_id, s.proyecto_id, 'sprint_quitado', private.texto(p_motivo, 5, 1000),
            jsonb_build_object('numero', s.numero, 'nombre', s.nombre));
  end if;
  delete from public.sprints where id = s.id;
  update public.sprints x set numero = r.rn
    from (select id, row_number() over (order by numero) rn from public.sprints where proyecto_id = s.proyecto_id) r
   where x.id = r.id and x.numero <> r.rn;
  return jsonb_build_object('avisos', private.avisos_plan(s.proyecto_id));
end $$;

-- 9) Reordenar: p_orden trae TODOS los ids de sprint en el orden nuevo. Los que ya empezaron no se mueven.
create function public.reordenar_sprints(p_proyecto_id uuid, p_orden uuid[], p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.proyectos; v_n int;
begin
  perform private.exigir_super_admin();
  p := private.proyecto_para_cambio(p_proyecto_id);
  select count(*) into v_n from public.sprints where proyecto_id = p.id;
  if p_orden is null or cardinality(p_orden) <> v_n
     or (select count(distinct x) from unnest(p_orden) x) <> v_n
     or exists (select 1 from unnest(p_orden) x where not exists (select 1 from public.sprints s where s.id = x and s.proyecto_id = p.id)) then
    raise exception 'orden_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.sprints s
               join unnest(p_orden) with ordinality o(id, ord) on o.id = s.id
              where s.estado in ('en_curso', 'en_revision', 'terminado') and s.numero <> o.ord) then
    raise exception 'orden_invalido' using errcode = '22023';
  end if;
  if p.plan_estado = 'aprobado' and (p_motivo is null or char_length(btrim(p_motivo)) < 5) then
    raise exception 'plan_requiere_motivo' using errcode = '22023';
  end if;
  if p.plan_estado = 'aprobado' then
    insert into public.cambios_plan (empresa_id, proyecto_id, tipo, motivo, detalle)
    values (p.empresa_id, p.id, 'sprints_reordenados', private.texto(p_motivo, 5, 1000),
            jsonb_build_object('antes', (select jsonb_agg(s.nombre order by s.numero) from public.sprints s where s.proyecto_id = p.id),
                               'despues', (select jsonb_agg(s.nombre order by o.ord) from public.sprints s
                                             join unnest(p_orden) with ordinality o(id, ord) on o.id = s.id where s.proyecto_id = p.id)));
  end if;
  update public.sprints s set numero = o.ord
    from unnest(p_orden) with ordinality o(id, ord) where s.id = o.id and s.numero <> o.ord;
  return jsonb_build_object('avisos', private.avisos_plan(p.id));
end $$;

-- 10) Aprobar el plan = publicarlo al cliente (hito 6). NO es una aprobacion del cliente.
create function public.aprobar_plan_sprints(p_proyecto_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.proyectos;
begin
  perform private.exigir_super_admin();
  p := private.proyecto_para_cambio(p_proyecto_id);
  if p.plan_estado = 'aprobado' then raise exception 'plan_ya_aprobado' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.sprints where proyecto_id = p.id) then
    raise exception 'plan_vacio' using errcode = 'P0001';
  end if;
  update public.proyectos set plan_estado = 'aprobado', plan_aprobado_en = now() where id = p.id;
  update public.sprints set estado = 'aprobado' where proyecto_id = p.id and estado = 'propuesto';
  return jsonb_build_object('avisos', private.avisos_plan(p.id));
end $$;

-- ---------- "Ver como el cliente" (decision D-020) ----------
create function public.iniciar_ver_como(
  p_empresa_id uuid, p_rol text default 'admin_cliente', p_aprobar boolean default false,
  p_ver_dinero boolean default false, p_ver_todos_tickets boolean default false, p_subir_archivos boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.empresas; v_id uuid; v_vence timestamptz := now() + interval '60 minutes'; v_todos boolean;
begin
  if not private.es_super_admin_real() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if p_rol is null or p_rol not in ('admin_cliente', 'equipo') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into e from public.empresas where id = p_empresa_id;
  if not found then raise exception 'empresa_no_encontrada' using errcode = 'P0001'; end if;
  if e.estado <> 'activa' then raise exception 'empresa_no_disponible' using errcode = 'P0001'; end if;
  v_todos := p_rol = 'admin_cliente';
  -- Cierra la anterior (vencida o reemplazada).
  update public.sesiones_ver_como
     set terminada_en = case when vence_en <= now() then vence_en else now() end,
         motivo_cierre = case when vence_en <= now() then 'vencida' else 'reemplazada' end
   where user_id = auth.uid() and terminada_en is null;
  insert into public.sesiones_ver_como (user_id, empresa_id, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos, vence_en)
  values (auth.uid(), e.id, p_rol, v_todos or coalesce(p_aprobar, false), v_todos or coalesce(p_ver_dinero, false),
          v_todos or coalesce(p_ver_todos_tickets, false), v_todos or coalesce(p_subir_archivos, false), v_vence)
  returning id into v_id;
  return jsonb_build_object('sesion_id', v_id, 'empresa_id', e.id, 'empresa_nombre', e.nombre, 'rol', p_rol, 'vence_en', v_vence);
end $$;

create function public.terminar_ver_como() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.es_super_admin_real() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  update public.sesiones_ver_como
     set terminada_en = case when vence_en <= now() then vence_en else now() end,
         motivo_cierre = case when vence_en <= now() then 'vencida' else 'manual' end
   where user_id = auth.uid() and terminada_en is null;
  if not found then raise exception 'sin_sesion_ver_como' using errcode = 'P0001'; end if;
end $$;

-- ---------- Lectura: vista y funciones SECURITY INVOKER (respetan RLS) ----------
create view public.v_proyectos_resumen with (security_invoker = true) as
select p.id as proyecto_id, p.empresa_id, e.nombre as empresa_nombre, e.estado as empresa_estado,
       p.nombre, p.estado, p.plan_estado, p.avance_pct, p.avance_partes_hechas, p.avance_partes_total,
       p.fecha_inicio, p.fecha_fin_planeada,
       sa.numero as sprint_actual_numero, sa.nombre as sprint_actual_nombre, sa.estado as sprint_actual_estado,
       pd.fecha_demo as proxima_demo,
       (select count(*) from public.hitos h
         where h.proyecto_id = p.id and h.estado <> 'terminado' and h.fecha_planeada < private.hoy())::int as hitos_atrasados,
       ha.numero as hito_actual_numero, ha.nombre as hito_actual_nombre
  from public.proyectos p
  join public.empresas e on e.id = p.empresa_id
  left join lateral (select s.numero, s.nombre, s.estado from public.sprints s
                      where s.proyecto_id = p.id and s.estado in ('aprobado', 'en_curso', 'en_revision')
                      order by (s.estado in ('en_curso', 'en_revision')) desc, s.numero limit 1) sa on true
  left join lateral (select min(s.fecha_demo) as fecha_demo from public.sprints s
                      where s.proyecto_id = p.id and s.estado in ('aprobado', 'en_curso', 'en_revision')
                        and s.fecha_demo >= private.hoy()) pd on true
  left join lateral (select h.numero, h.nombre from public.hitos h
                      where h.proyecto_id = p.id and h.numero <> 13 and h.estado <> 'terminado'
                      order by (h.estado in ('en_curso', 'esperando_aprobacion')) desc, h.numero limit 1) ha on true;

-- Panel del super admin: todas las empresas.
create function public.panel_super_admin() returns jsonb
language plpgsql stable set search_path = '' as $$
declare v jsonb;
begin
  if not private.es_super_admin() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'generado_en', now(),
    'totales', jsonb_build_object(
      'empresas_activas', (select count(*) from public.empresas where estado = 'activa'),
      'empresas_pausadas', (select count(*) from public.empresas where estado = 'pausada'),
      'proyectos_activos', (select count(*) from public.v_proyectos_resumen r where r.estado = 'activo' and r.empresa_estado = 'activa'),
      'hitos_atrasados', (select coalesce(sum(r.hitos_atrasados), 0) from public.v_proyectos_resumen r where r.estado = 'activo' and r.empresa_estado = 'activa'),
      'planes_por_aprobar', (select count(*) from public.v_proyectos_resumen r
                              where r.estado = 'activo' and r.plan_estado = 'propuesta'
                                and exists (select 1 from public.sprints s where s.proyecto_id = r.proyecto_id)),
      'demos_proximas_7_dias', (select count(*) from public.v_proyectos_resumen r
                                 where r.estado = 'activo' and r.proxima_demo between private.hoy() and private.hoy() + 7),
      -- null = el modulo aun no existe (dinero: sprint 4, tickets: sprint 5)
      'pagos_vencidos', null, 'tickets_abiertos', null),
    'proyectos', (select coalesce(jsonb_agg(to_jsonb(r) order by r.empresa_nombre, r.nombre), '[]'::jsonb) from public.v_proyectos_resumen r),
    'atencion', (
      select coalesce(jsonb_agg(a order by a ->> 'prioridad', a ->> 'empresa_nombre'), '[]'::jsonb) from (
        select jsonb_build_object('tipo', 'hito_atrasado', 'prioridad', '1', 'empresa_id', e.id, 'empresa_nombre', e.nombre,
                 'proyecto_id', p.id, 'proyecto_nombre', p.nombre, 'hito_numero', h.numero, 'hito_nombre', h.nombre,
                 'fecha_planeada', h.fecha_planeada, 'dias_de_atraso', private.hoy() - h.fecha_planeada,
                 'esperando_al_cliente', coalesce((select r.lado = 'cliente' from public.retrasos r where r.hito_id = h.id
                                                    order by r.creado_en desc limit 1), false)) as a
          from public.hitos h join public.proyectos p on p.id = h.proyecto_id join public.empresas e on e.id = p.empresa_id
         where p.estado = 'activo' and e.estado = 'activa' and h.estado <> 'terminado' and h.fecha_planeada < private.hoy()
        union all
        select jsonb_build_object('tipo', 'plan_por_aprobar', 'prioridad', '2', 'empresa_id', e.id, 'empresa_nombre', e.nombre,
                 'proyecto_id', p.id, 'proyecto_nombre', p.nombre)
          from public.proyectos p join public.empresas e on e.id = p.empresa_id
         where p.estado = 'activo' and e.estado = 'activa' and p.plan_estado = 'propuesta'
           and exists (select 1 from public.sprints s where s.proyecto_id = p.id)
        union all
        select jsonb_build_object('tipo', 'demo_proxima', 'prioridad', '3', 'empresa_id', r.empresa_id, 'empresa_nombre', r.empresa_nombre,
                 'proyecto_id', r.proyecto_id, 'proyecto_nombre', r.nombre, 'fecha', r.proxima_demo)
          from public.v_proyectos_resumen r
         where r.estado = 'activo' and r.empresa_estado = 'activa' and r.proxima_demo between private.hoy() and private.hoy() + 7
      ) x)
  ) into v;
  return v;
end $$;

-- Inicio del cliente: sus proyectos y lo que esta esperando del cliente. Sirve tambien en "ver como".
create function public.inicio_cliente() returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_emp uuid := private.mi_empresa_id(); v jsonb;
begin
  if v_emp is null then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'empresa', (select jsonb_build_object('id', e.id, 'nombre', e.nombre) from public.empresas e where e.id = v_emp),
    'proyectos', (select coalesce(jsonb_agg(to_jsonb(r) order by r.nombre), '[]'::jsonb)
                    from public.v_proyectos_resumen r where r.empresa_id = v_emp),
    -- Hitos sin terminar cuyo ultimo retraso es "esperando al cliente": el aviso de que falta.
    'pendientes_del_cliente', (select coalesce(jsonb_agg(jsonb_build_object(
          'proyecto_id', h.proyecto_id, 'hito_numero', h.numero, 'hito_nombre', h.nombre,
          'fecha_nueva', r.fecha_nueva, 'motivo', r.motivo, 'que_falta', r.que_falta) order by r.fecha_nueva), '[]'::jsonb)
        from public.hitos h
        join lateral (select * from public.retrasos x where x.hito_id = h.id order by x.creado_en desc limit 1) r on true
       where h.empresa_id = v_emp and h.estado <> 'terminado' and r.lado = 'cliente'))
  into v;
  return v;
end $$;

-- Linea de tiempo de un proyecto en UNA llamada. El cliente recibe solo lo que RLS le deja ver.
create function public.linea_de_tiempo(p_proyecto_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare r public.v_proyectos_resumen; v_super boolean := private.es_super_admin();
begin
  select * into r from public.v_proyectos_resumen where proyecto_id = p_proyecto_id;
  if not found then raise exception 'proyecto_no_encontrado' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'proyecto', to_jsonb(r),
    'hitos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', h.id, 'numero', h.numero, 'nombre', h.nombre, 'estado', h.estado,
        'fecha_planeada', h.fecha_planeada, 'fecha_real', h.fecha_real, 'visible', h.visible,
        'atrasado', (h.estado <> 'terminado' and h.fecha_planeada < private.hoy()),
        -- Solo llega si quien pregunta puede ver dinero (lo decide RLS).
        'pago_asociado', (select pa.concepto from public.hitos_pago_asociado pa where pa.hito_id = h.id),
        'retrasos', (select coalesce(jsonb_agg(jsonb_build_object(
              'fecha_anterior', x.fecha_anterior, 'fecha_nueva', x.fecha_nueva, 'motivo', x.motivo,
              'lado', x.lado, 'que_falta', x.que_falta, 'creado_en', x.creado_en) order by x.creado_en), '[]'::jsonb)
            from public.retrasos x where x.hito_id = h.id)) order by h.numero), '[]'::jsonb)
        from public.hitos h where h.proyecto_id = p_proyecto_id),
    -- El plan solo existe para el cliente cuando esta aprobado; el super admin ve tambien la propuesta.
    'plan', case when r.plan_estado = 'aprobado' or v_super then jsonb_build_object(
        'estado', r.plan_estado,
        'sprints', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'numero', s.numero, 'nombre', s.nombre, 'estado', s.estado, 'fecha_inicio', s.fecha_inicio,
            'fecha_fin', s.fecha_fin, 'fecha_demo', s.fecha_demo, 'incluye', s.incluye, 'terminado_en', s.terminado_en)
            order by s.numero), '[]'::jsonb) from public.sprints s where s.proyecto_id = p_proyecto_id),
        'cambios', (select coalesce(jsonb_agg(jsonb_build_object(
            'tipo', c.tipo, 'motivo', c.motivo, 'detalle', c.detalle, 'creado_en', c.creado_en) order by c.creado_en), '[]'::jsonb)
            from public.cambios_plan c where c.proyecto_id = p_proyecto_id),
        'avisos', case when v_super then private.avisos_plan(p_proyecto_id) else '[]'::jsonb end)
      else null end);
end $$;

-- ---------- M-7: rastro de los intentos rechazados ----------
-- Una funcion que falla deshace TODA su transaccion, incluido cualquier rastro. Por eso el servidor,
-- cuando una funcion sensible responde con error, llama esta OTRA funcion (otra transaccion).
-- Guarda solo accion y codigo (validados con un patron), siempre a nombre de quien llama y con un
-- tope de 20 por minuto para que no se use para llenar el registro.
create function public.anotar_rechazo(p_accion text, p_codigo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.tiene_acceso() and not private.es_super_admin_real() then
    return;
  end if;
  if p_accion is null or p_accion !~ '^[a-z][a-z_]{2,59}$' or p_codigo is null or p_codigo !~ '^[a-z][a-z_]{2,59}$' then
    return;
  end if;
  if (select count(*) from public.registro_actividad r
       where r.actor_id = v_uid and r.accion = 'accion_rechazada' and r.creado_en > now() - interval '1 minute') >= 20 then
    return;
  end if;
  perform private.registrar(private.mi_empresa_id(), 'accion_rechazada', p_accion, null, jsonb_build_object('codigo', p_codigo));
end $$;

-- ---------- mi_contexto: estado "ver_como" ----------
create or replace function public.mi_contexto() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_aal text := private.nivel_sesion();
  p public.perfiles;
  m public.miembros;
  e public.empresas;
  vs public.sesiones_ver_como;
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
    if v_aal <> 'aal2' then
      v_estado := 'super_admin_requiere_2fa';
    else
      select * into vs from public.sesiones_ver_como s
       where s.user_id = v_uid and s.terminada_en is null and s.vence_en > now();
      if found then
        v_estado := 'ver_como';
        select * into e from public.empresas where id = vs.empresa_id;
        m := private.miembro_activo();
      else
        v_estado := 'super_admin';
      end if;
    end if;
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
    'es_super_admin', v_estado in ('super_admin', 'super_admin_requiere_2fa', 'ver_como'),
    'empresa', case when e.id is null then null else jsonb_build_object('id', e.id, 'nombre', e.nombre, 'estado', e.estado) end,
    'rol', case when v_estado = 'ver_como' then vs.rol else m.rol end,
    'permisos', case when m.id is null or v_estado not in ('activo', 'ver_como') then null else jsonb_build_object(
        'aprobar', m.aprobar, 'ver_dinero', m.ver_dinero,
        'ver_todos_tickets', m.ver_todos_tickets, 'subir_archivos', m.subir_archivos) end,
    'ver_como', case when v_estado = 'ver_como' then jsonb_build_object(
        'sesion_id', vs.id, 'empresa_id', vs.empresa_id, 'empresa_nombre', e.nombre, 'rol', vs.rol, 'vence_en', vs.vence_en) else null end);
end $$;

-- ---------- M-7: inicios de sesion y fallos desde Auth (gancho de intentos, plan Pro) ----------
create or replace function private.gancho_intento_de_acceso(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := nullif(event ->> 'user_id', '')::uuid;
  v_valido boolean := coalesce((event ->> 'valid')::boolean, false);
  v_max int := coalesce((select (c.valor ->> 'max_fallos')::int from public.configuracion c where c.clave = 'intentos_acceso'), 5);
  v_min int := coalesce((select (c.valor ->> 'minutos_bloqueo')::int from public.configuracion c where c.clave = 'intentos_acceso'), 15);
  v_emp uuid;
  r public.intentos_acceso;
  v_rechazo jsonb := jsonb_build_object('decision', 'reject', 'message', 'cuenta_frenada_temporalmente');
begin
  if v_uid is null then
    return jsonb_build_object('decision', 'continue');
  end if;
  insert into public.intentos_acceso (user_id) values (v_uid) on conflict do nothing;
  select * into r from public.intentos_acceso where user_id = v_uid for update;
  v_emp := (select m.empresa_id from public.miembros m where m.user_id = v_uid and m.quitado_en is null);

  -- Con la cuenta frenada no entra nadie, ni con la clave correcta (si no, el freno no sirve contra fuerza bruta).
  if r.bloqueado_hasta is not null and r.bloqueado_hasta > now() then
    return v_rechazo;
  end if;
  if v_valido then
    update public.intentos_acceso set fallos = 0, ultimo_fallo = null, bloqueado_hasta = null where user_id = v_uid;
    insert into public.registro_actividad (empresa_id, actor_id, actor_tipo, accion, entidad, entidad_id)
    values (v_emp, v_uid, 'usuario', 'inicio_de_sesion', 'sesion', v_uid::text);
    return jsonb_build_object('decision', 'continue');
  end if;

  -- Solo cuentan los fallos "seguidos": si el anterior fue hace mas del tiempo de freno, se empieza de cero.
  if r.ultimo_fallo is not null and r.ultimo_fallo < now() - make_interval(mins => v_min) then
    r.fallos := 0;
  end if;
  r.fallos := r.fallos + 1;
  -- M-7: cada fallo queda anotado (maximo max_fallos por racha: despues la cuenta se frena y no se anota mas).
  insert into public.registro_actividad (empresa_id, actor_id, actor_tipo, accion, entidad, entidad_id, detalle)
  values (v_emp, v_uid, 'usuario', 'inicio_de_sesion_fallido', 'sesion', v_uid::text, jsonb_build_object('fallos_seguidos', r.fallos));
  if r.fallos >= v_max then
    update public.intentos_acceso set fallos = 0, ultimo_fallo = now(),
           bloqueado_hasta = now() + make_interval(mins => v_min) where user_id = v_uid;
    perform private.registrar(v_emp, 'cuenta_frenada_por_intentos', 'intentos_acceso', v_uid::text, jsonb_build_object('minutos', v_min));
    return v_rechazo;
  end if;
  update public.intentos_acceso set fallos = r.fallos, ultimo_fallo = now() where user_id = v_uid;
  return jsonb_build_object('decision', 'continue');
end $$;

-- ---------- Permisos de ejecucion ----------
revoke all on function
  private.texto(text, int, int), private.exigir_super_admin(), private.proyecto_para_cambio(uuid, boolean),
  private.validar_sprint(text, date, date, date, text[]),
  public.crear_proyecto(uuid, text, text, date, date), public.editar_proyecto(uuid, text, text, text, date, date, date),
  public.editar_hito(uuid, text, text, date, text, text, text, boolean, date), public.fijar_pago_hito(uuid, text),
  public.cargar_plan_sprints(uuid, jsonb), public.agregar_sprint(uuid, text, date, date, date, text[], text),
  public.editar_sprint(uuid, text, date, date, date, text[], text, text, boolean), public.quitar_sprint(uuid, text),
  public.reordenar_sprints(uuid, uuid[], text), public.aprobar_plan_sprints(uuid),
  public.iniciar_ver_como(uuid, text, boolean, boolean, boolean, boolean), public.terminar_ver_como(),
  public.panel_super_admin(), public.inicio_cliente(), public.linea_de_tiempo(uuid), public.anotar_rechazo(text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.crear_proyecto(uuid, text, text, date, date), public.editar_proyecto(uuid, text, text, text, date, date, date),
  public.editar_hito(uuid, text, text, date, text, text, text, boolean, date), public.fijar_pago_hito(uuid, text),
  public.cargar_plan_sprints(uuid, jsonb), public.agregar_sprint(uuid, text, date, date, date, text[], text),
  public.editar_sprint(uuid, text, date, date, date, text[], text, text, boolean), public.quitar_sprint(uuid, text),
  public.reordenar_sprints(uuid, uuid[], text), public.aprobar_plan_sprints(uuid),
  public.iniciar_ver_como(uuid, text, boolean, boolean, boolean, boolean), public.terminar_ver_como(),
  public.panel_super_admin(), public.inicio_cliente(), public.linea_de_tiempo(uuid), public.anotar_rechazo(text, text)
  to authenticated;
-- Las funciones de lectura (SECURITY INVOKER) llaman a estas auxiliares.
grant execute on function private.avisos_plan(uuid) to authenticated;
grant select on public.v_proyectos_resumen to authenticated;
revoke all on public.v_proyectos_resumen from anon, service_role;
