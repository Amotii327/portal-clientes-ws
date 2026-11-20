-- Sprint 6 · Funciones RPC de mantenimiento por empresa y de horas.
-- Mantenimiento APAGADO por defecto (sin fila de plan). Solo el super admin (con 2FA) lo activa, apaga o configura.
-- Equipo Websourcing · Desarrollo

create function private.proximo_mes() returns date
language sql stable set search_path = '' as $$
  select (date_trunc('month', private.hoy()::timestamp) + interval '1 month')::date
$$;
revoke all on function private.proximo_mes() from public, anon, authenticated, service_role;

-- ---------- Activar ----------
create function public.activar_mantenimiento(
  p_empresa_id uuid, p_plan_base text, p_parametros jsonb default '{}'::jsonb, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.planes_mantenimiento;
  v_base jsonb := '{}'::jsonb;
  v_mezcla jsonb;
  v_id uuid;
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa_id) then
    raise exception 'empresa_no_encontrada' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa_id and e.estado = 'activa') then
    raise exception 'empresa_no_disponible' using errcode = 'P0001';
  end if;
  if p_plan_base is null or p_plan_base not in ('basico', 'estandar', 'premium', 'personalizado')
     or p_parametros is null or jsonb_typeof(p_parametros) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if p_motivo is not null and char_length(p_motivo) > 500 then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  select * into v_plan from public.planes_mantenimiento p where p.empresa_id = p_empresa_id for update;
  if found and v_plan.activo then raise exception 'mantenimiento_ya_activo' using errcode = 'P0001'; end if;

  if p_plan_base <> 'personalizado' then
    select b.parametros into v_base from public.planes_base_mantenimiento b where b.plan = p_plan_base;
  end if;
  v_mezcla := coalesce(v_base, '{}'::jsonb) || p_parametros || jsonb_build_object('plan_base', p_plan_base);

  if not found then
    insert into public.planes_mantenimiento (empresa_id) values (p_empresa_id) returning id into v_id;
  else
    v_id := v_plan.id;
  end if;
  perform private.aplicar_parametros(v_id, v_mezcla);
  select * into v_plan from public.planes_mantenimiento p where p.id = v_id;
  if v_plan.cuota_mensual is null then raise exception 'cuota_requerida' using errcode = '22023'; end if;
  if v_plan.fecha_inicio is null then raise exception 'fecha_inicio_requerida' using errcode = '22023'; end if;

  update public.planes_mantenimiento set activo = true, activado_en = now(), activado_por = auth.uid(),
         apagado_en = null, apagado_por = null where id = v_id;
  insert into public.planes_mantenimiento_historial (empresa_id, plan_id, tipo, parametros_nuevos, motivo, efectivo_desde, aplicado_en)
  values (p_empresa_id, v_id, 'activacion', v_mezcla, coalesce(nullif(btrim(p_motivo), ''), 'Activación del mantenimiento'),
          private.hoy(), now());
  if private.mantenimiento_vigente(p_empresa_id) then
    perform private.asegurar_bolsa(v_id, date_trunc('month', private.hoy()::timestamp)::date, 0);
  end if;
  return jsonb_build_object('plan_id', v_id, 'activo', true);
end $$;

-- ---------- Apagar ----------
create function public.apagar_mantenimiento(p_empresa_id uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.planes_mantenimiento;
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_motivo is null or char_length(btrim(p_motivo)) not between 3 and 500 then raise exception 'motivo_requerido' using errcode = '22023'; end if;
  select * into v_plan from public.planes_mantenimiento p where p.empresa_id = p_empresa_id for update;
  if not found or not v_plan.activo then raise exception 'mantenimiento_no_activo' using errcode = 'P0001'; end if;
  update public.planes_mantenimiento set activo = false, apagado_en = now(), apagado_por = auth.uid() where id = v_plan.id;
  insert into public.planes_mantenimiento_historial (empresa_id, plan_id, tipo, motivo, efectivo_desde, aplicado_en)
  values (p_empresa_id, v_plan.id, 'apagado', btrim(p_motivo), private.hoy(), now());
  return jsonb_build_object('plan_id', v_plan.id, 'activo', false);
end $$;

-- ---------- Configurar ----------
-- p_aplicar_desde: 'proximo_mes' (por defecto) o 'hoy'. Siempre con motivo; queda en el historial.
create function public.configurar_mantenimiento(
  p_empresa_id uuid, p_parametros jsonb, p_motivo text, p_aplicar_desde text default 'proximo_mes')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.planes_mantenimiento;
  v_ant jsonb;
  v_desde date;
  v_id uuid;
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_motivo is null or char_length(btrim(p_motivo)) not between 3 and 500 then raise exception 'motivo_requerido' using errcode = '22023'; end if;
  if p_parametros is null or jsonb_typeof(p_parametros) <> 'object' or p_parametros = '{}'::jsonb
     or p_aplicar_desde is null or p_aplicar_desde not in ('hoy', 'proximo_mes') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if not private.json_solo_claves(p_parametros, private.claves_parametros_mantenimiento()) then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  select * into v_plan from public.planes_mantenimiento p where p.empresa_id = p_empresa_id for update;
  if not found or not v_plan.activo then raise exception 'mantenimiento_no_activo' using errcode = 'P0001'; end if;
  v_ant := (select coalesce(jsonb_object_agg(k, to_jsonb(v_plan) -> k), '{}'::jsonb) from jsonb_object_keys(p_parametros) k);

  if p_aplicar_desde = 'hoy' then
    v_desde := private.hoy();
    perform private.aplicar_parametros(v_plan.id, p_parametros);
    -- La bolsa abierta de este mes toma las nuevas horas.
    if p_parametros ? 'horas_mes' then
      begin
        update public.bolsa_mensual b set horas_incluidas = (select p.horas_mes from public.planes_mantenimiento p where p.id = v_plan.id)
         where b.plan_id = v_plan.id and b.cerrada_en is null and b.mes = date_trunc('month', v_desde::timestamp)::date;
      exception when check_violation then
        raise exception 'parametros_invalidos' using errcode = '22023';
      end;
    end if;
    insert into public.planes_mantenimiento_historial (empresa_id, plan_id, tipo, parametros_anteriores, parametros_nuevos, motivo, efectivo_desde, aplicado_en)
    values (p_empresa_id, v_plan.id, 'parametros', v_ant, p_parametros, btrim(p_motivo), v_desde, now()) returning id into v_id;
  else
    v_desde := private.proximo_mes();
    -- Prueba en seco: si los valores no son validos se avisa ahora, no en el corte del mes.
    begin
      perform private.aplicar_parametros(v_plan.id, p_parametros);
      raise exception 'prueba_en_seco' using errcode = 'P0099';
    exception when sqlstate 'P0099' then null;
    end;
    insert into public.planes_mantenimiento_historial (empresa_id, plan_id, tipo, parametros_anteriores, parametros_nuevos, motivo, efectivo_desde)
    values (p_empresa_id, v_plan.id, 'parametros', v_ant, p_parametros, btrim(p_motivo), v_desde) returning id into v_id;
  end if;
  return jsonb_build_object('historial_id', v_id, 'efectivo_desde', v_desde, 'aplicado', p_aplicar_desde = 'hoy');
end $$;

-- ---------- Horas ----------
-- El equipo anota a mano las horas de un ticket (D-008). Quedan "pendiente_dueno": no se descuentan hasta que el dueno las revise.
create function public.anotar_horas_ticket(p_ticket_id uuid, p_horas numeric, p_nota text default null, p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, false);
  v_fecha date := coalesce(p_fecha, private.hoy());
  v_mes date := date_trunc('month', coalesce(p_fecha, private.hoy())::timestamp)::date;
  v_plan public.planes_mantenimiento;
  v_bolsa public.bolsa_mensual;
  v_hora uuid;
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if p_horas is null or p_horas <= 0 or p_horas > 24 or char_length(coalesce(p_nota, '')) > 1000 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if v_fecha > private.hoy() then raise exception 'fecha_invalida' using errcode = '22023'; end if;
  if not private.mantenimiento_vigente(t.empresa_id, v_fecha) then raise exception 'mantenimiento_no_activo' using errcode = 'P0001'; end if;
  -- Cambios y tickets fuera de plan se cobran aparte (o se regalan): no descuentan de la bolsa.
  if t.tipo = 'solicitud_cambio' or t.fuera_de_plan then raise exception 'ticket_fuera_de_bolsa' using errcode = 'P0001'; end if;
  select * into v_plan from public.planes_mantenimiento p where p.empresa_id = t.empresa_id;
  if v_mes = date_trunc('month', private.hoy()::timestamp)::date then
    perform private.asegurar_bolsa(v_plan.id, v_mes, 0);
  end if;
  select * into v_bolsa from public.bolsa_mensual b where b.plan_id = v_plan.id and b.mes = v_mes;
  if not found then raise exception 'fecha_invalida' using errcode = '22023'; end if;
  if v_bolsa.cerrada_en is not null then raise exception 'bolsa_cerrada' using errcode = 'P0001'; end if;
  insert into public.horas_registradas (empresa_id, ticket_id, bolsa_id, mes, fecha_trabajo, horas)
  values (t.empresa_id, t.id, v_bolsa.id, v_mes, v_fecha, round(p_horas, 2)) returning id into v_hora;
  if nullif(btrim(coalesce(p_nota, '')), '') is not null then
    insert into public.horas_notas_internas (hora_id, empresa_id, nota) values (v_hora, t.empresa_id, btrim(p_nota));
  end if;
  return jsonb_build_object('hora_id', v_hora, 'estado', 'pendiente_dueno', 'bolsa_id', v_bolsa.id);
end $$;

-- El dueno revisa: aprueba (se descuenta de la bolsa; lo que pase de la bolsa queda como hora EXTRA) o rechaza.
create function public.revisar_horas(p_hora_id uuid, p_aprobar boolean, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.horas_registradas;
  b public.bolsa_mensual;
  v_disp numeric;
  v_en_bolsa numeric;
  v_extra numeric;
  v_estado_extra text;
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_aprobar is null or char_length(coalesce(p_motivo, '')) > 500 then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  select * into h from public.horas_registradas x where x.id = p_hora_id for update;
  if not found then raise exception 'hora_no_encontrada' using errcode = 'P0001'; end if;
  if h.estado <> 'pendiente_dueno' then raise exception 'horas_ya_revisadas' using errcode = 'P0001'; end if;
  if not p_aprobar then
    if p_motivo is null or char_length(btrim(p_motivo)) < 3 then raise exception 'motivo_requerido' using errcode = '22023'; end if;
    update public.horas_registradas set estado = 'rechazada', revisado_por = auth.uid(), revisado_en = now(),
           motivo_revision = btrim(p_motivo) where id = h.id;
    return jsonb_build_object('hora_id', h.id, 'estado', 'rechazada');
  end if;

  select * into b from public.bolsa_mensual x where x.id = h.bolsa_id for update;
  if b.cerrada_en is not null then raise exception 'bolsa_cerrada' using errcode = 'P0001'; end if;
  v_disp := greatest(0, b.horas_incluidas + b.horas_arrastradas - b.horas_usadas);
  v_en_bolsa := least(h.horas, v_disp);
  v_extra := h.horas - v_en_bolsa;
  v_estado_extra := case when b.extra_autorizado then 'extra_aprobada' else 'extra_pendiente_cliente' end;

  if v_extra = 0 then
    update public.horas_registradas set estado = 'aprobada', revisado_por = auth.uid(), revisado_en = now(),
           motivo_revision = nullif(btrim(p_motivo), '') where id = h.id;
  elsif v_en_bolsa = 0 then
    update public.horas_registradas set estado = v_estado_extra, revisado_por = auth.uid(), revisado_en = now(),
           motivo_revision = nullif(btrim(p_motivo), '') where id = h.id;
  else
    -- Parte cabe en la bolsa y el resto es extra: se parte en dos filas.
    update public.horas_registradas set horas = v_en_bolsa, estado = 'aprobada', revisado_por = auth.uid(), revisado_en = now(),
           motivo_revision = nullif(btrim(p_motivo), '') where id = h.id;
    insert into public.horas_registradas (empresa_id, ticket_id, bolsa_id, origen_id, mes, fecha_trabajo, horas, estado,
                                          registrado_por, registrado_en, revisado_por, revisado_en, motivo_revision)
    values (h.empresa_id, h.ticket_id, h.bolsa_id, h.id, h.mes, h.fecha_trabajo, v_extra, v_estado_extra,
            h.registrado_por, h.registrado_en, auth.uid(), now(), nullif(btrim(p_motivo), ''));
  end if;
  update public.bolsa_mensual set horas_usadas = horas_usadas + v_en_bolsa, horas_extra = horas_extra + v_extra where id = b.id;
  return jsonb_build_object('hora_id', h.id, 'horas_en_bolsa', v_en_bolsa, 'horas_extra', v_extra,
                            'estado', case when v_extra = 0 then 'aprobada' else v_estado_extra end);
end $$;

-- El admin del cliente aprueba o rechaza horas extra ya trabajadas.
create function public.decidir_horas_extra(p_hora_id uuid, p_aprobar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.miembros := private.miembro_activo();
  h public.horas_registradas;
begin
  if m.id is null or m.rol <> 'admin_cliente' or p_aprobar is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into h from public.horas_registradas x
   where x.id = p_hora_id and x.empresa_id = m.empresa_id and x.estado = 'extra_pendiente_cliente' for update;
  if not found or not private.mantenimiento_encendido(m.empresa_id) then raise exception 'hora_no_encontrada' using errcode = 'P0001'; end if;
  update public.horas_registradas set estado = case when p_aprobar then 'extra_aprobada' else 'extra_rechazada' end,
         decidido_cliente_por = auth.uid(), decidido_cliente_en = now() where id = h.id;
  return jsonb_build_object('hora_id', h.id, 'estado', case when p_aprobar then 'extra_aprobada' else 'extra_rechazada' end);
end $$;

-- El admin del cliente autoriza por adelantado las horas extra de un mes (si no, con la bolsa llena no se sigue trabajando).
create function public.autorizar_horas_extra(p_bolsa_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.miembros := private.miembro_activo();
  b public.bolsa_mensual;
begin
  if m.id is null or m.rol <> 'admin_cliente' then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into b from public.bolsa_mensual x where x.id = p_bolsa_id and x.empresa_id = m.empresa_id for update;
  if not found or not private.mantenimiento_encendido(m.empresa_id) then raise exception 'bolsa_no_encontrada' using errcode = 'P0001'; end if;
  if b.cerrada_en is not null then raise exception 'bolsa_cerrada' using errcode = 'P0001'; end if;
  update public.bolsa_mensual set extra_autorizado = true, extra_autorizado_por = auth.uid(), extra_autorizado_en = now() where id = b.id;
  return jsonb_build_object('bolsa_id', b.id, 'extra_autorizado', true);
end $$;

-- Para que la pantalla sepa si muestra el modulo (y el hito 13) al cliente.
create function public.mi_mantenimiento_activo() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.mantenimiento_encendido((private.miembro_activo()).empresa_id), false)
$$;

revoke all on function
  public.activar_mantenimiento(uuid, text, jsonb, text), public.apagar_mantenimiento(uuid, text),
  public.configurar_mantenimiento(uuid, jsonb, text, text), public.anotar_horas_ticket(uuid, numeric, text, date),
  public.revisar_horas(uuid, boolean, text), public.decidir_horas_extra(uuid, boolean),
  public.autorizar_horas_extra(uuid), public.mi_mantenimiento_activo()
  from public, anon, authenticated, service_role;
grant execute on function
  public.activar_mantenimiento(uuid, text, jsonb, text), public.apagar_mantenimiento(uuid, text),
  public.configurar_mantenimiento(uuid, jsonb, text, text), public.anotar_horas_ticket(uuid, numeric, text, date),
  public.revisar_horas(uuid, boolean, text), public.decidir_horas_extra(uuid, boolean),
  public.autorizar_horas_extra(uuid), public.mi_mantenimiento_activo()
  to authenticated;
