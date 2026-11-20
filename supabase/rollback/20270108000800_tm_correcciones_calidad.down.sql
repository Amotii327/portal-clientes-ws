-- Rollback de correcciones tras la revision de Calidad (I-1 a I-3, M-1 a M-3, M-5). Equipo Websourcing · Desarrollo

create or replace function private.trg_outbox_tm() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_datos jsonb;
  v_ts text;
begin
  if tg_table_name = 'tickets' then
    v_datos := jsonb_build_object('ticket_id', new.id, 'numero', new.numero, 'titulo', new.titulo, 'tipo', new.tipo);
    if tg_op = 'INSERT' then
      -- Ticket urgente nuevo: aviso inmediato al super admin.
      if new.prioridad_propuesta = 'urgente' then
        perform private.encolar_a_super_admins(new.empresa_id, 'ticket_urgente_nuevo', v_datos, 'ticket_urgente:' || new.id::text);
      end if;
      if new.fuera_de_plan or new.tipo = 'solicitud_cambio' then
        perform private.encolar_a_super_admins(new.empresa_id, 'ticket_requiere_decision',
          v_datos || jsonb_build_object('fuera_de_plan', new.fuera_de_plan), 'ticket_decision:' || new.id::text);
      end if;
    else
      v_ts := (extract(epoch from new.actualizado_en) * 1000000)::bigint::text;
      if new.estado is distinct from old.estado and auth.uid() is distinct from new.creado_por then
        perform private.encolar_correo(new.empresa_id, 'ticket_estado', new.creado_por,
          v_datos || jsonb_build_object('estado', new.estado), 'ticket_estado:' || new.id::text || ':' || new.estado || ':' || v_ts);
      end if;
      if new.tipo is distinct from old.tipo and new.tipo = 'solicitud_cambio' then
        perform private.encolar_a_super_admins(new.empresa_id, 'ticket_requiere_decision', v_datos, 'ticket_decision:' || new.id::text);
      end if;
      if new.decision_dueno is distinct from old.decision_dueno then
        if new.decision_dueno = 'cobrar' then
          perform private.encolar_a_admins_cliente(new.empresa_id, 'ticket_cobro_pendiente',
            v_datos || jsonb_build_object('valor', new.cobro_valor, 'moneda', new.cobro_moneda),
            'ticket_cobro:' || new.id::text || ':' || v_ts);
        elsif new.decision_dueno = 'regalar' then
          perform private.encolar_correo(new.empresa_id, 'ticket_decision', new.creado_por,
            v_datos || jsonb_build_object('decision', 'regalar'), 'ticket_regalo:' || new.id::text || ':' || v_ts);
        end if;
      end if;
      if new.cobro_aceptado_en is distinct from old.cobro_aceptado_en then
        perform private.encolar_a_super_admins(new.empresa_id, 'ticket_cobro_aceptado', v_datos, 'ticket_cobro_ok:' || new.id::text);
      end if;
      if new.cobro_rechazado_en is distinct from old.cobro_rechazado_en then
        perform private.encolar_a_super_admins(new.empresa_id, 'ticket_cobro_rechazado', v_datos, 'ticket_cobro_no:' || new.id::text);
      end if;
    end if;

  elsif tg_table_name = 'ticket_mensajes' then
    if not new.interno then
      select jsonb_build_object('ticket_id', t.id, 'numero', t.numero, 'titulo', t.titulo, 'mensaje_id', new.id,
                                'area', new.area)
        into v_datos from public.tickets t where t.id = new.ticket_id and t.empresa_id = new.empresa_id;
      if new.autor_tipo = 'websourcing' then
        perform private.encolar_correo(new.empresa_id, 'ticket_respuesta',
          (select t.creado_por from public.tickets t where t.id = new.ticket_id and t.empresa_id = new.empresa_id),
          v_datos, 'ticket_msg:' || new.id::text);
      else
        perform private.encolar_a_super_admins(new.empresa_id, 'ticket_mensaje_cliente', v_datos, 'ticket_msg:' || new.id::text);
      end if;
    end if;

  elsif tg_table_name = 'bolsa_avisos' then
    v_datos := jsonb_build_object('bolsa_id', new.bolsa_id, 'porcentaje', new.porcentaje,
                                  'horas_usadas', new.horas_usadas, 'horas_disponibles', new.horas_disponibles);
    perform private.encolar_a_super_admins(new.empresa_id, 'mantenimiento_aviso_' || new.tipo, v_datos, 'bolsa_aviso:' || new.id::text);
    perform private.encolar_a_admins_cliente(new.empresa_id, 'mantenimiento_aviso_' || new.tipo, v_datos, 'bolsa_aviso:' || new.id::text);

  elsif tg_table_name = 'horas_registradas' then
    if new.estado = 'extra_pendiente_cliente' and (tg_op = 'INSERT' or old.estado is distinct from new.estado) then
      perform private.encolar_a_admins_cliente(new.empresa_id, 'horas_extra_pendientes',
        jsonb_build_object('hora_id', new.id, 'ticket_id', new.ticket_id, 'horas', new.horas), 'horas_extra:' || new.id::text);
    end if;
  end if;
  return null;
end $$;

create or replace function private.cerrar_mes_bolsas(p_hoy date default null) returns jsonb
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

create or replace function public.anotar_horas_ticket(p_ticket_id uuid, p_horas numeric, p_nota text default null, p_fecha date default null)
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

create or replace function public.revisar_horas(p_hora_id uuid, p_aprobar boolean, p_motivo text default null) returns jsonb
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

create or replace function public.activar_mantenimiento(
  p_empresa_id uuid, p_plan_base text, p_parametros jsonb default '{}'::jsonb, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.planes_mantenimiento;
  v_base jsonb := '{}'::jsonb;
  v_mezcla jsonb;
  v_id uuid;
  v_existe boolean;
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
  v_existe := found;
  if v_existe and v_plan.activo then raise exception 'mantenimiento_ya_activo' using errcode = 'P0001'; end if;

  if p_plan_base <> 'personalizado' then
    select b.parametros into v_base from public.planes_base_mantenimiento b where b.plan = p_plan_base;
  end if;
  v_mezcla := coalesce(v_base, '{}'::jsonb) || p_parametros || jsonb_build_object('plan_base', p_plan_base);

  if not v_existe then
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

create or replace function public.decidir_ticket(
  p_ticket_id uuid, p_decision text, p_motivo text default null, p_valor numeric default null, p_moneda text default 'COP')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, true);
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  if not (t.tipo = 'solicitud_cambio' or t.fuera_de_plan) then raise exception 'decision_no_aplica' using errcode = 'P0001'; end if;
  if t.cobro_aceptado_en is not null then raise exception 'cobro_ya_aceptado' using errcode = 'P0001'; end if;
  if p_decision is null or p_decision not in ('cobrar', 'regalar', 'rechazar') then
    raise exception 'decision_invalida' using errcode = '22023';
  end if;
  if p_decision = 'cobrar' and (p_valor is null or p_valor <= 0 or p_moneda is null or p_moneda not in ('COP', 'USD')) then
    raise exception 'valor_cobro_requerido' using errcode = '22023';
  end if;
  if p_decision = 'rechazar' and (p_motivo is null or char_length(btrim(p_motivo)) < 3) then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;
  if p_motivo is not null and char_length(p_motivo) > 1000 then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  update public.tickets x set
    decision_dueno = p_decision, decision_motivo = nullif(btrim(p_motivo), ''), decision_en = now(), decision_por = auth.uid(),
    cobro_valor = case when p_decision = 'cobrar' then p_valor end,
    cobro_moneda = case when p_decision = 'cobrar' then p_moneda end,
    cobro_rechazado_en = null,
    estado = case when p_decision = 'rechazar' then 'cerrado' else x.estado end,
    cierre_motivo = case when p_decision = 'rechazar' then 'rechazado' else x.cierre_motivo end
   where x.id = t.id returning * into t;
  return jsonb_build_object('ticket_id', t.id, 'estado', t.estado, 'decision', t.decision_dueno);
end $$;

alter table public.horas_registradas drop column sin_descuento;
