-- Sprint 5 y 6 · Triggers de negocio, registro de actividad (solo por triggers) y cola de correos.
-- Equipo Websourcing · Desarrollo

-- ---------- Tickets: antes de crear ----------
create function private.trg_ticket_antes_insertar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_motivo text;
  p record;
begin
  -- Consecutivo por empresa (un candado por empresa evita numeros repetidos).
  perform pg_advisory_xact_lock(hashtextextended(new.empresa_id::text, 7));
  select coalesce(max(t.numero), 0) + 1 into new.numero from public.tickets t where t.empresa_id = new.empresa_id;
  new.estado := 'nuevo';
  new.creado_en := coalesce(new.creado_en, now());
  -- Cobertura (garantia / mantenimiento vigente) a la fecha de creacion.
  v_motivo := private.motivo_fuera_de_plan(new.empresa_id, new.tipo, new.proyecto_id,
                                           (new.creado_en at time zone 'America/Bogota')::date);
  new.motivo_fuera_de_plan := v_motivo;
  new.fuera_de_plan := v_motivo is not null;
  -- Tiempo de primera respuesta con la prioridad propuesta (se recalcula al clasificar).
  select * into p from private.calcular_plazo(new.empresa_id, new.prioridad_propuesta, new.creado_en);
  new.vence_primera_respuesta := p.vence;
  new.plazo_habil_minutos := p.minutos;
  new.sla_origen := p.origen;
  return new;
end $$;

-- ---------- Tickets: antes de cambiar ----------
create function private.trg_ticket_antes_actualizar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Un ticket cerrado solo admite la calificacion.
  if old.estado = 'cerrado' and
     (to_jsonb(new) - array['calificacion', 'calificacion_comentario', 'calificado_en', 'actualizado_en'])
     is distinct from (to_jsonb(old) - array['calificacion', 'calificacion_comentario', 'calificado_en', 'actualizado_en']) then
    raise exception 'ticket_cerrado' using errcode = 'P0001';
  end if;

  if new.estado is distinct from old.estado then
    if not exists (select 1 from (values
         ('nuevo', 'clasificado'), ('nuevo', 'cerrado'),
         ('clasificado', 'en_progreso'), ('clasificado', 'cerrado'),
         ('en_progreso', 'esperando_cliente'), ('en_progreso', 'resuelto'), ('en_progreso', 'cerrado'),
         ('en_progreso', 'clasificado'),
         ('esperando_cliente', 'en_progreso'), ('esperando_cliente', 'resuelto'), ('esperando_cliente', 'cerrado'),
         ('esperando_cliente', 'clasificado'),
         ('resuelto', 'cerrado'), ('resuelto', 'en_progreso')) v(a, b)
        where v.a = old.estado and v.b = new.estado) then
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;

    if new.estado = 'clasificado' then
      if new.prioridad is null then raise exception 'prioridad_requerida' using errcode = 'P0001'; end if;
      new.clasificado_en := coalesce(new.clasificado_en, now());
    end if;

    -- No se empieza a trabajar un cambio o un ticket fuera de plan sin decision del dueno
    -- (y, si se cobra, sin la aceptacion del admin del cliente).
    if old.estado = 'clasificado' and new.estado = 'en_progreso' and not private.ticket_autorizado(new) then
      raise exception 'ticket_requiere_decision' using errcode = 'P0001';
    end if;

    if new.estado = 'resuelto' then
      if new.resolucion is null or char_length(btrim(new.resolucion)) < 3 then
        raise exception 'resolucion_requerida' using errcode = 'P0001';
      end if;
      new.resuelto_en := now();
      new.primera_respuesta_en := coalesce(new.primera_respuesta_en, now());
    end if;

    if new.estado = 'cerrado' then
      new.cerrado_en := coalesce(new.cerrado_en, now());
    end if;
  end if;
  return new;
end $$;

-- ---------- Mensajes ----------
create function private.trg_mensaje_antes_insertar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tickets t where t.id = new.ticket_id and t.empresa_id = new.empresa_id and t.estado = 'cerrado') then
    raise exception 'ticket_cerrado' using errcode = 'P0001';
  end if;
  return new;
end $$;

create function private.trg_mensaje_despues_insertar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.autor_tipo = 'websourcing' and not new.interno then
    -- La primera respuesta publica del equipo detiene el semaforo.
    update public.tickets t set primera_respuesta_en = now()
     where t.id = new.ticket_id and t.empresa_id = new.empresa_id and t.primera_respuesta_en is null;
  elsif new.autor_tipo = 'cliente' then
    -- Si el cliente responde cuando se le esperaba o decia "resuelto", el ticket sigue en progreso.
    update public.tickets t set estado = 'en_progreso'
     where t.id = new.ticket_id and t.empresa_id = new.empresa_id and t.estado in ('esperando_cliente', 'resuelto');
  end if;
  return null;
end $$;

-- Retirar el texto de un mensaje (por ejemplo una clave pegada por error): solo cambia el texto.
create function private.trg_mensaje_antes_actualizar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.retirado_en is not null then
    raise exception 'mensaje_ya_retirado' using errcode = 'P0001';
  end if;
  if new.retirado_en is null or new.retirado_por is null then
    raise exception 'tabla_solo_agregar: ticket_mensajes' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- Bolsa: avisos del 80 % y del 100 % ----------
create function private.trg_bolsa_antes_actualizar() returns trigger
language plpgsql set search_path = '' as $$
declare v_tot numeric := new.horas_incluidas + new.horas_arrastradas;
begin
  if new.aviso_100_en is null and (new.horas_extra > 0 or (v_tot > 0 and new.horas_usadas >= v_tot)) then
    new.aviso_100_en := now();
  end if;
  if new.aviso_80_en is null and (new.aviso_100_en is not null or (v_tot > 0 and new.horas_usadas * 100 >= 80 * v_tot)) then
    new.aviso_80_en := now();
  end if;
  return new;
end $$;

create function private.trg_bolsa_despues_actualizar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tot numeric := new.horas_incluidas + new.horas_arrastradas;
  v_pct numeric := case when v_tot > 0 then round(new.horas_usadas * 100 / v_tot, 2) else 100 end;
begin
  if new.aviso_80_en is not null and old.aviso_80_en is null then
    insert into public.bolsa_avisos (empresa_id, bolsa_id, tipo, porcentaje, horas_usadas, horas_disponibles)
    values (new.empresa_id, new.id, '80_por_ciento', v_pct, new.horas_usadas, greatest(0, v_tot - new.horas_usadas))
    on conflict (bolsa_id, tipo) do nothing;
  end if;
  if new.aviso_100_en is not null and old.aviso_100_en is null then
    insert into public.bolsa_avisos (empresa_id, bolsa_id, tipo, porcentaje, horas_usadas, horas_disponibles)
    values (new.empresa_id, new.id, '100_por_ciento', v_pct, new.horas_usadas, greatest(0, v_tot - new.horas_usadas))
    on conflict (bolsa_id, tipo) do nothing;
  end if;
  return null;
end $$;

create trigger tickets_antes_insertar before insert on public.tickets
  for each row execute function private.trg_ticket_antes_insertar();
create trigger tickets_antes_actualizar before update on public.tickets
  for each row execute function private.trg_ticket_antes_actualizar();
create trigger ticket_mensajes_antes_insertar before insert on public.ticket_mensajes
  for each row execute function private.trg_mensaje_antes_insertar();
create trigger ticket_mensajes_despues_insertar after insert on public.ticket_mensajes
  for each row execute function private.trg_mensaje_despues_insertar();
create trigger ticket_mensajes_antes_actualizar before update on public.ticket_mensajes
  for each row execute function private.trg_mensaje_antes_actualizar();
create trigger bolsa_antes_actualizar before update on public.bolsa_mensual
  for each row execute function private.trg_bolsa_antes_actualizar();
create trigger bolsa_despues_actualizar after update on public.bolsa_mensual
  for each row execute function private.trg_bolsa_despues_actualizar();

-- ---------- Registro de actividad (solo por triggers) ----------
-- No se copian textos de tickets, mensajes ni notas: solo identificadores y datos de control.
create function private.trg_registro_tm() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_campos jsonb;
begin
  if tg_table_name = 'tickets' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'ticket_creado', 'tickets', new.id::text,
        jsonb_build_object('numero', new.numero, 'tipo', new.tipo, 'prioridad_propuesta', new.prioridad_propuesta,
                           'fuera_de_plan', new.fuera_de_plan, 'motivo_fuera_de_plan', new.motivo_fuera_de_plan));
    else
      if new.estado is distinct from old.estado then
        perform private.registrar(new.empresa_id,
          case when new.cierre_motivo = 'automatico' and new.estado = 'cerrado' then 'ticket_cerrado_automatico'
               else 'ticket_estado_cambiado' end,
          'tickets', new.id::text, jsonb_build_object('de', old.estado, 'a', new.estado, 'cierre_motivo', new.cierre_motivo));
      end if;
      if (new.prioridad, new.tipo) is distinct from (old.prioridad, old.tipo) and new.tipo <> 'solicitud_cambio' then
        perform private.registrar(new.empresa_id, 'ticket_clasificado', 'tickets', new.id::text,
          jsonb_build_object('prioridad', new.prioridad, 'tipo', new.tipo, 'tipo_anterior', old.tipo,
                             'vence_primera_respuesta', new.vence_primera_respuesta));
      end if;
      if new.tipo is distinct from old.tipo and new.tipo = 'solicitud_cambio' then
        perform private.registrar(new.empresa_id, 'ticket_marcado_solicitud_cambio', 'tickets', new.id::text,
          jsonb_build_object('tipo_anterior', old.tipo));
      end if;
      if new.decision_dueno is distinct from old.decision_dueno then
        perform private.registrar(new.empresa_id, 'ticket_decision_dueno', 'tickets', new.id::text,
          jsonb_build_object('decision', new.decision_dueno, 'valor', new.cobro_valor, 'moneda', new.cobro_moneda));
      end if;
      if new.cobro_aceptado_en is distinct from old.cobro_aceptado_en then
        perform private.registrar(new.empresa_id, 'ticket_cobro_aceptado', 'tickets', new.id::text,
          jsonb_build_object('valor', new.cobro_valor, 'moneda', new.cobro_moneda));
      end if;
      if new.cobro_rechazado_en is distinct from old.cobro_rechazado_en then
        perform private.registrar(new.empresa_id, 'ticket_cobro_rechazado', 'tickets', new.id::text, '{}'::jsonb);
      end if;
      if new.calificacion is distinct from old.calificacion then
        perform private.registrar(new.empresa_id, 'ticket_calificado', 'tickets', new.id::text,
          jsonb_build_object('calificacion', new.calificacion));
      end if;
    end if;

  elsif tg_table_name = 'ticket_mensajes' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'ticket_mensaje', 'ticket_mensajes', new.id::text,
        jsonb_build_object('ticket_id', new.ticket_id, 'autor_tipo', new.autor_tipo, 'interno', new.interno, 'area', new.area));
    else
      perform private.registrar(new.empresa_id, 'ticket_mensaje_retirado', 'ticket_mensajes', new.id::text,
        jsonb_build_object('ticket_id', new.ticket_id));
    end if;

  elsif tg_table_name = 'ticket_adjuntos' then
    perform private.registrar(new.empresa_id, 'ticket_adjunto_registrado', 'ticket_adjuntos', new.id::text,
      jsonb_build_object('ticket_id', new.ticket_id, 'mime', new.mime, 'tamano_bytes', new.tamano_bytes));

  elsif tg_table_name = 'garantias' then
    perform private.registrar(new.empresa_id, case tg_op when 'INSERT' then 'garantia_creada' else 'garantia_cambiada' end,
      'garantias', new.id::text, jsonb_build_object('inicia_en', new.inicia_en, 'vence_en', new.vence_en));

  elsif tg_table_name = 'planes_mantenimiento' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, case when new.activo then 'mantenimiento_activado' else 'mantenimiento_creado' end,
        'planes_mantenimiento', new.id::text, jsonb_build_object('plan_base', new.plan_base));
    else
      if new.activo is distinct from old.activo then
        perform private.registrar(new.empresa_id, case when new.activo then 'mantenimiento_activado' else 'mantenimiento_apagado' end,
          'planes_mantenimiento', new.id::text, jsonb_build_object('plan_base', new.plan_base));
      end if;
      select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_campos
        from unnest(private.claves_parametros_mantenimiento()) k
       where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k;
      if v_campos <> '[]'::jsonb then
        perform private.registrar(new.empresa_id, 'mantenimiento_parametros_cambiados', 'planes_mantenimiento',
          new.id::text, jsonb_build_object('campos', v_campos));
      end if;
    end if;

  elsif tg_table_name = 'planes_mantenimiento_historial' then
    if tg_op = 'INSERT' and new.aplicado_en is null and new.tipo = 'parametros' then
      perform private.registrar(new.empresa_id, 'mantenimiento_cambio_programado', 'planes_mantenimiento',
        new.plan_id::text, jsonb_build_object('efectivo_desde', new.efectivo_desde,
                                              'campos', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(new.parametros_nuevos) k)));
    end if;

  elsif tg_table_name = 'bolsa_mensual' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'bolsa_creada', 'bolsa_mensual', new.id::text,
        jsonb_build_object('mes', new.mes, 'horas_incluidas', new.horas_incluidas, 'horas_arrastradas', new.horas_arrastradas));
    elsif new.cerrada_en is distinct from old.cerrada_en then
      perform private.registrar(new.empresa_id, 'bolsa_cerrada', 'bolsa_mensual', new.id::text,
        jsonb_build_object('mes', new.mes, 'horas_perdidas', new.horas_perdidas, 'horas_acumuladas', new.horas_acumuladas));
    elsif new.extra_autorizado is distinct from old.extra_autorizado then
      perform private.registrar(new.empresa_id, 'horas_extra_autorizadas', 'bolsa_mensual', new.id::text,
        jsonb_build_object('mes', new.mes));
    end if;

  elsif tg_table_name = 'bolsa_avisos' then
    perform private.registrar(new.empresa_id, 'bolsa_aviso_' || new.tipo, 'bolsa_mensual', new.bolsa_id::text,
      jsonb_build_object('porcentaje', new.porcentaje, 'horas_usadas', new.horas_usadas));

  elsif tg_table_name = 'horas_registradas' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'horas_anotadas', 'horas_registradas', new.id::text,
        jsonb_build_object('ticket_id', new.ticket_id, 'horas', new.horas, 'estado', new.estado, 'origen_id', new.origen_id));
    elsif new.estado is distinct from old.estado or new.horas is distinct from old.horas then
      perform private.registrar(new.empresa_id, 'horas_revisadas', 'horas_registradas', new.id::text,
        jsonb_build_object('ticket_id', new.ticket_id, 'de', old.estado, 'a', new.estado, 'horas', new.horas));
    end if;

  elsif tg_table_name = 'planes_base_mantenimiento' then
    perform private.registrar(null, 'plan_base_mantenimiento_editado', 'planes_base_mantenimiento', new.plan, '{}'::jsonb);
  end if;
  return null;
end $$;

create trigger tickets_registro after insert or update on public.tickets
  for each row execute function private.trg_registro_tm();
create trigger ticket_mensajes_registro after insert or update on public.ticket_mensajes
  for each row execute function private.trg_registro_tm();
create trigger ticket_adjuntos_registro after insert on public.ticket_adjuntos
  for each row execute function private.trg_registro_tm();
create trigger garantias_registro after insert or update on public.garantias
  for each row execute function private.trg_registro_tm();
create trigger planes_registro after insert or update on public.planes_mantenimiento
  for each row execute function private.trg_registro_tm();
create trigger planes_historial_registro after insert on public.planes_mantenimiento_historial
  for each row execute function private.trg_registro_tm();
create trigger bolsa_registro after insert or update on public.bolsa_mensual
  for each row execute function private.trg_registro_tm();
create trigger bolsa_avisos_registro after insert on public.bolsa_avisos
  for each row execute function private.trg_registro_tm();
create trigger horas_registro after insert or update on public.horas_registradas
  for each row execute function private.trg_registro_tm();
create trigger planes_base_registro after update on public.planes_base_mantenimiento
  for each row execute function private.trg_registro_tm();

-- Quien hizo el cambio (columna "actualizado_por") de los planes base.
create trigger planes_base_autor before update on public.planes_base_mantenimiento
  for each row execute function private.poner_actualizado_por();

-- ---------- Cola de correos (outbox): la llenan estos triggers ----------
create function private.trg_outbox_tm() returns trigger
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

create trigger tickets_outbox after insert or update on public.tickets
  for each row execute function private.trg_outbox_tm();
create trigger ticket_mensajes_outbox after insert on public.ticket_mensajes
  for each row execute function private.trg_outbox_tm();
create trigger bolsa_avisos_outbox after insert on public.bolsa_avisos
  for each row execute function private.trg_outbox_tm();
create trigger horas_outbox after insert or update on public.horas_registradas
  for each row execute function private.trg_outbox_tm();

revoke all on function
  private.trg_ticket_antes_insertar(), private.trg_ticket_antes_actualizar(), private.trg_mensaje_antes_insertar(),
  private.trg_mensaje_despues_insertar(), private.trg_mensaje_antes_actualizar(), private.trg_bolsa_antes_actualizar(),
  private.trg_bolsa_despues_actualizar(), private.trg_registro_tm(), private.trg_outbox_tm()
  from public, anon, authenticated, service_role;
