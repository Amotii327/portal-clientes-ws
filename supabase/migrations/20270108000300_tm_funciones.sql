-- Sprint 5 y 6 · Funciones internas (esquema private, fuera de la API): cobertura, tiempos de
-- respuesta con horario habil, semaforo, bolsa de horas, cierres automaticos.
-- SECURITY DEFINER con search_path vacio. Permisos leidos de la BASE, nunca del token.
-- Equipo Websourcing · Desarrollo

-- ---------- Mantenimiento: estado ----------

-- true si el plan existe, esta activo y vigente en esa fecha.
create function private.mantenimiento_vigente(p_empresa uuid, p_fecha date default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.planes_mantenimiento p
     where p.empresa_id = p_empresa and p.activo
       and p.fecha_inicio <= coalesce(p_fecha, private.hoy())
       and (p.renovacion_automatica or p.fecha_fin >= coalesce(p_fecha, private.hoy())))
$$;

create function private.en_garantia(p_empresa uuid, p_proyecto uuid, p_fecha date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.garantias g
     where g.empresa_id = p_empresa
       and p_fecha between g.inicia_en and g.vence_en
       and (p_proyecto is null or g.proyecto_id is null or g.proyecto_id = p_proyecto))
$$;

-- Motivo por el que un ticket de SOPORTE (error, pregunta, acceso) queda fuera de plan; null si esta cubierto.
-- Las solicitudes de cambio no son soporte: siguen su propio camino (cotizacion).
create function private.motivo_fuera_de_plan(p_empresa uuid, p_tipo text, p_proyecto uuid, p_fecha date) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_plan public.planes_mantenimiento;
begin
  if p_tipo = 'solicitud_cambio' then return null; end if;
  if private.en_garantia(p_empresa, p_proyecto, p_fecha) then return null; end if;
  select * into v_plan from public.planes_mantenimiento p where p.empresa_id = p_empresa;
  if not found or not v_plan.activo then return 'sin_mantenimiento'; end if;
  if not private.mantenimiento_vigente(p_empresa, p_fecha) then return 'mantenimiento_vencido'; end if;
  if p_tipo = 'error' and not ('correccion_errores' = any (v_plan.incluye)) then return 'sin_cobertura_errores'; end if;
  return null;
end $$;

-- ---------- Horario y tiempos de respuesta ----------

-- Horario que cuenta para una empresa en una fecha: el del plan si esta vigente; si no, D-002.
create function private.horario_de(p_empresa uuid, p_fecha date)
returns table (dias int[], desde time, hasta time, zona text, origen text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_plan public.planes_mantenimiento;
  v_cfg jsonb;
begin
  if private.mantenimiento_vigente(p_empresa, p_fecha) then
    select * into v_plan from public.planes_mantenimiento p where p.empresa_id = p_empresa;
    return query select v_plan.dias_atencion::int[], v_plan.horario_desde, v_plan.horario_hasta, v_plan.zona_horaria, 'mantenimiento'::text;
    return;
  end if;
  select c.valor into v_cfg from public.configuracion c where c.clave = 'horario_habil';
  return query select
    coalesce((select array_agg(x::int) from jsonb_array_elements_text(v_cfg -> 'dias') x), array[1, 2, 3, 4, 5]),
    coalesce((v_cfg ->> 'desde')::time, '08:00'::time),
    coalesce((v_cfg ->> 'hasta')::time, '18:00'::time),
    coalesce(v_cfg ->> 'zona', 'America/Bogota'),
    'predeterminado'::text;
end $$;

-- Plazo de primera respuesta en MINUTOS HABILES (null = "siguiente planeacion", sin plazo).
-- 1 dia habil = una jornada completa del horario aplicable.
create function private.plazo_minutos(p_empresa uuid, p_prioridad text, p_fecha date)
returns table (minutos numeric, origen text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_spec jsonb;
  v_origen text := 'predeterminado';
  v_plan jsonb;
  v_cfg jsonb;
  h record;
begin
  select c.valor into v_cfg from public.configuracion c where c.clave = 'tiempos_respuesta';
  if private.mantenimiento_vigente(p_empresa, p_fecha) then
    select p.tiempos_respuesta into v_plan from public.planes_mantenimiento p where p.empresa_id = p_empresa;
    if v_plan is not null and v_plan ? p_prioridad then
      v_spec := v_plan -> p_prioridad; v_origen := 'mantenimiento';
    end if;
  end if;
  if v_spec is null then
    v_spec := coalesce(v_cfg -> p_prioridad,
      case p_prioridad when 'urgente' then '{"horas_habiles": 2}'::jsonb when 'alta' then '{"dias_habiles": 1}'::jsonb
                       when 'normal' then '{"dias_habiles": 2}'::jsonb else '"siguiente_planeacion"'::jsonb end);
  end if;
  if jsonb_typeof(v_spec) = 'string' then
    return query select null::numeric, v_origen; return;
  end if;
  select * into h from private.horario_de(p_empresa, p_fecha);
  if v_spec ? 'horas_habiles' then
    return query select (v_spec ->> 'horas_habiles')::numeric * 60, v_origen;
  else
    return query select (v_spec ->> 'dias_habiles')::numeric * (extract(epoch from (h.hasta - h.desde)) / 60), v_origen;
  end if;
end $$;

-- Plazo completo: vencimiento (instante), minutos habiles y de donde salen los tiempos.
create function private.calcular_plazo(p_empresa uuid, p_prioridad text, p_desde timestamptz)
returns table (vence timestamptz, minutos numeric, origen text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fecha date := (p_desde at time zone 'America/Bogota')::date;
  p record;
  h record;
begin
  select * into p from private.plazo_minutos(p_empresa, p_prioridad, v_fecha);
  if p.minutos is null then
    return query select null::timestamptz, null::numeric, p.origen; return;
  end if;
  select * into h from private.horario_de(p_empresa, v_fecha);
  return query select private.sumar_minutos_habiles(p_desde, p.minutos, h.dias, h.desde, h.hasta, h.zona), p.minutos, p.origen;
end $$;

-- Semaforo de la primera respuesta, a una hora dada (la vista usa now(); las pruebas, una fija).
--   cumplido / incumplido : ya hubo primera respuesta (a tiempo o tarde)
--   verde / amarillo / rojo : sin respuesta; amarillo = queda la mitad del plazo o menos; rojo = vencido
--   sin_plazo : prioridad baja ("siguiente planeacion")   cerrado : se cerro sin respuesta
create function private.semaforo_en(
  p_empresa uuid, p_estado text, p_creado timestamptz, p_vence timestamptz, p_plazo numeric,
  p_primera timestamptz, p_ahora timestamptz)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  h record;
  v_resto numeric;
begin
  if p_primera is not null then
    return case when p_vence is null or p_primera <= p_vence then 'cumplido' else 'incumplido' end;
  end if;
  if p_estado = 'cerrado' then return 'cerrado'; end if;
  if p_vence is null then return 'sin_plazo'; end if;
  if p_ahora > p_vence then return 'rojo'; end if;
  if p_plazo is null or p_plazo <= 0 then return 'verde'; end if;
  select * into h from private.horario_de(p_empresa, (p_creado at time zone 'America/Bogota')::date);
  v_resto := private.minutos_habiles_entre(p_ahora, p_vence, h.dias, h.desde, h.hasta, h.zona);
  return case when v_resto * 100 / p_plazo <= private.semaforo_umbral_amarillo() then 'amarillo' else 'verde' end;
end $$;

-- Minutos habiles que faltan (positivo) o que lleva de retraso (negativo). null si no aplica.
create function private.minutos_restantes_en(
  p_empresa uuid, p_estado text, p_creado timestamptz, p_vence timestamptz, p_primera timestamptz, p_ahora timestamptz)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare h record;
begin
  if p_primera is not null or p_estado = 'cerrado' or p_vence is null then return null; end if;
  select * into h from private.horario_de(p_empresa, (p_creado at time zone 'America/Bogota')::date);
  if p_ahora <= p_vence then
    return private.minutos_habiles_entre(p_ahora, p_vence, h.dias, h.desde, h.hasta, h.zona);
  end if;
  return -private.minutos_habiles_entre(p_vence, p_ahora, h.dias, h.desde, h.hasta, h.zona);
end $$;

-- ---------- Visibilidad de tickets (misma regla que la politica RLS) ----------

-- Devuelve el ticket SOLO si quien llama puede verlo; si no, null (no se revela si existe).
create function private.ticket_visible(p_id uuid, p_bloquear boolean default false) returns public.tickets
language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets;
  m public.miembros := private.miembro_activo();
begin
  if p_bloquear then
    select * into t from public.tickets x where x.id = p_id for update;
  else
    select * into t from public.tickets x where x.id = p_id;
  end if;
  if t.id is null then return null; end if;
  if private.es_super_admin() then return t; end if;
  if m.id is not null and m.empresa_id = t.empresa_id
     and (t.creado_por = auth.uid() or m.ver_todos_tickets) then
    return t;
  end if;
  return null;
end $$;

-- Un ticket requiere decision del dueno si es solicitud de cambio o esta fuera de plan.
-- Autorizado para trabajar = regalado, o cobrado y aceptado por el admin del cliente.
create function private.ticket_autorizado(t public.tickets) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    not (t.tipo = 'solicitud_cambio' or t.fuera_de_plan)
      or t.decision_dueno = 'regalar'
      or (t.decision_dueno = 'cobrar' and t.cobro_aceptado_en is not null), false)
$$;

-- ---------- Bolsa de horas ----------

-- Crea (si falta) la bolsa de un mes para un plan. Devuelve su id.
create function private.asegurar_bolsa(p_plan uuid, p_mes date, p_arrastradas numeric default 0) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.planes_mantenimiento;
  v_id uuid;
begin
  select * into v_plan from public.planes_mantenimiento p where p.id = p_plan;
  if not found then raise exception 'plan_no_encontrado' using errcode = 'P0001'; end if;
  insert into public.bolsa_mensual (empresa_id, plan_id, mes, horas_incluidas, horas_arrastradas)
  values (v_plan.empresa_id, p_plan, p_mes, v_plan.horas_mes, greatest(p_arrastradas, 0))
  on conflict (plan_id, mes) do nothing;
  select b.id into v_id from public.bolsa_mensual b where b.plan_id = p_plan and b.mes = p_mes;
  return v_id;
end $$;

-- true si la bolsa del mes actual de la empresa esta llena y el cliente no autorizo horas extra.
create function private.bolsa_agotada_sin_autorizacion(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bolsa_mensual b
      join public.planes_mantenimiento p on p.id = b.plan_id
     where b.empresa_id = p_empresa
       and b.mes = date_trunc('month', private.hoy()::timestamp)::date
       and private.mantenimiento_vigente(p_empresa)
       and b.cerrada_en is null
       and b.horas_usadas >= b.horas_incluidas + b.horas_arrastradas
       and not b.extra_autorizado)
$$;

-- Aplica parametros (jsonb con claves permitidas) a un plan. Los datos que fallan una restriccion
-- del plan se reportan con un codigo estable.
create function private.aplicar_parametros(p_plan uuid, p_parametros jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.planes_mantenimiento;
  v public.planes_mantenimiento;
begin
  if not private.json_solo_claves(p_parametros, private.claves_parametros_mantenimiento()) then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  select * into v_old from public.planes_mantenimiento p where p.id = p_plan for update;
  if not found then raise exception 'plan_no_encontrado' using errcode = 'P0001'; end if;
  begin
    v := jsonb_populate_record(v_old, p_parametros);
    -- Sin auditoria no hay frecuencia de auditoria (al pasar de un plan con auditoria a uno sin ella).
    if not v.auditoria then v.auditoria_cada_meses := null; end if;
    if not exists (select 1 from pg_timezone_names z where z.name = v.zona_horaria) then
      raise exception 'zona_invalida' using errcode = '22023';
    end if;
    update public.planes_mantenimiento p set
      plan_base = v.plan_base, fecha_inicio = v.fecha_inicio, fecha_fin = v.fecha_fin,
      renovacion_automatica = v.renovacion_automatica, moneda = v.moneda, cuota_mensual = v.cuota_mensual,
      horas_mes = v.horas_mes, acumular_horas = v.acumular_horas, revisiones_por_semana = v.revisiones_por_semana,
      dias_atencion = v.dias_atencion, horario_desde = v.horario_desde, horario_hasta = v.horario_hasta,
      zona_horaria = v.zona_horaria, tiempos_respuesta = v.tiempos_respuesta, copias_frecuencia = v.copias_frecuencia,
      parches_frecuencia = v.parches_frecuencia, auditoria = v.auditoria, auditoria_cada_meses = v.auditoria_cada_meses,
      reuniones_por_mes = v.reuniones_por_mes, reporte_tipo = v.reporte_tipo, servidores_incluidos = v.servidores_incluidos,
      servidores_costo_mensual = v.servidores_costo_mensual, incluye = v.incluye, incluye_otros = v.incluye_otros,
      valor_hora_extra = v.valor_hora_extra, proxima_revision = v.proxima_revision
     where p.id = p_plan;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range
         or invalid_datetime_format or datatype_mismatch or invalid_parameter_value
         or datetime_field_overflow or string_data_right_truncation then
    raise exception 'parametros_invalidos' using errcode = '22023';
  end;
end $$;

-- Corte mensual (tarea programada, hora de Colombia, SIN repetir trabajo si corre dos veces):
--   1. aplica los cambios de plan programados para "el proximo mes";
--   2. cierra las bolsas de meses anteriores: las horas no usadas se PIERDEN (D-007) salvo que el plan
--      tenga "acumular" (entonces pasa como maximo el sobrante propio de UN mes);
--   3. asegura la bolsa del mes actual de cada plan vigente.
-- Salta las empresas pausadas.
create function private.cerrar_mes_bolsas(p_hoy date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hoy date := coalesce(p_hoy, private.hoy());
  v_mes_actual date := date_trunc('month', v_hoy::timestamp)::date;
  h public.planes_mantenimiento_historial;
  b public.bolsa_mensual;
  p public.planes_mantenimiento;
  v_sobrante numeric;
  v_propias numeric;
  v_carry numeric;
  v_siguiente date;
  v_cambios int := 0;
  v_cerradas int := 0;
  v_creadas int := 0;
begin
  for h in
    select x.* from public.planes_mantenimiento_historial x
      join public.empresas e on e.id = x.empresa_id
     where x.aplicado_en is null and x.error_aplicacion is null and x.tipo = 'parametros'
       and x.efectivo_desde <= v_hoy and e.estado = 'activa'
     order by x.efectivo_desde, x.creado_en
     for update of x skip locked
  loop
    begin
      perform private.aplicar_parametros(h.plan_id, h.parametros_nuevos);
      update public.planes_mantenimiento_historial set aplicado_en = now() where id = h.id;
      v_cambios := v_cambios + 1;
    exception when others then
      -- Un cambio que ya no es valido no frena el corte de todos los demas: queda marcado para el super admin.
      update public.planes_mantenimiento_historial set error_aplicacion = left(sqlerrm, 300) where id = h.id;
    end;
  end loop;

  loop
    select x.* into b from public.bolsa_mensual x
      join public.empresas e on e.id = x.empresa_id
     where x.cerrada_en is null and x.mes < v_mes_actual and e.estado = 'activa'
     order by x.mes limit 1 for update of x skip locked;
    exit when not found;
    select * into p from public.planes_mantenimiento q where q.id = b.plan_id;
    v_siguiente := (b.mes + interval '1 month')::date;
    v_sobrante := greatest(0, b.horas_incluidas + b.horas_arrastradas - b.horas_usadas);
    -- Las horas se gastan primero de lo arrastrado; lo que sobra de las propias es lo unico que puede pasar.
    v_propias := greatest(0, b.horas_incluidas - greatest(0, b.horas_usadas - b.horas_arrastradas));
    v_carry := case when p.acumular_horas and private.mantenimiento_vigente(b.empresa_id, v_siguiente)
                    then least(v_sobrante, v_propias) else 0 end;
    update public.bolsa_mensual set cerrada_en = now(), horas_perdidas = v_sobrante - v_carry, horas_acumuladas = v_carry
     where id = b.id;
    v_cerradas := v_cerradas + 1;
    if private.mantenimiento_vigente(b.empresa_id, v_siguiente) then
      perform private.asegurar_bolsa(b.plan_id, v_siguiente, v_carry);
    end if;
  end loop;

  for p in
    select q.* from public.planes_mantenimiento q join public.empresas e on e.id = q.empresa_id
     where e.estado = 'activa' and private.mantenimiento_vigente(q.empresa_id, v_hoy)
       and not exists (select 1 from public.bolsa_mensual x where x.plan_id = q.id and x.mes = v_mes_actual)
  loop
    perform private.asegurar_bolsa(p.id, v_mes_actual, 0);
    v_creadas := v_creadas + 1;
  end loop;

  return jsonb_build_object('cambios_aplicados', v_cambios, 'bolsas_cerradas', v_cerradas, 'bolsas_creadas', v_creadas);
end $$;

-- Cierre automatico de tickets: 3 dias despues de "resuelto" sin respuesta del cliente.
-- Salta empresas pausadas. Es idempotente (solo toca los que siguen en "resuelto").
create function private.cerrar_tickets_vencidos(p_ahora timestamptz default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.tickets t set estado = 'cerrado', cierre_motivo = 'automatico'
    from public.empresas e
   where e.id = t.empresa_id and e.estado = 'activa'
     and t.estado = 'resuelto'
     and t.resuelto_en <= coalesce(p_ahora, now()) - interval '3 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- Tareas programadas (solo si la extension pg_cron esta activada en el proyecto de Supabase).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('portal-cerrar-tickets-vencidos', '7 * * * *', 'select private.cerrar_tickets_vencidos()');
    perform cron.schedule('portal-corte-mensual-mantenimiento', '10 5 * * *', 'select private.cerrar_mes_bolsas()');
  end if;
end $$;

revoke all on function
  private.mantenimiento_vigente(uuid, date), private.en_garantia(uuid, uuid, date),
  private.motivo_fuera_de_plan(uuid, text, uuid, date), private.horario_de(uuid, date),
  private.plazo_minutos(uuid, text, date), private.calcular_plazo(uuid, text, timestamptz),
  private.semaforo_en(uuid, text, timestamptz, timestamptz, numeric, timestamptz, timestamptz),
  private.minutos_restantes_en(uuid, text, timestamptz, timestamptz, timestamptz, timestamptz),
  private.ticket_visible(uuid, boolean), private.ticket_autorizado(public.tickets),
  private.asegurar_bolsa(uuid, date, numeric), private.bolsa_agotada_sin_autorizacion(uuid),
  private.aplicar_parametros(uuid, jsonb), private.cerrar_mes_bolsas(date), private.cerrar_tickets_vencidos(timestamptz)
  from public, anon, authenticated, service_role;

-- Las que usan las vistas (security_invoker) y las politicas las ejecuta authenticated.
grant execute on function
  private.semaforo_en(uuid, text, timestamptz, timestamptz, numeric, timestamptz, timestamptz),
  private.minutos_restantes_en(uuid, text, timestamptz, timestamptz, timestamptz, timestamptz)
  to authenticated;
