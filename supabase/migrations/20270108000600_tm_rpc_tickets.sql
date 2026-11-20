-- Sprint 5 · Funciones RPC de tickets. Corren con la sesion del usuario (no usan la clave de sistema):
-- cada una comprueba QUIEN llama, valida lo que entra y deja el rastro por los triggers.
-- Errores: el mensaje es un codigo estable (ver lib/portal/errores-tickets-mant.ts).
-- Equipo Websourcing · Desarrollo

-- ---------- Crear ----------
create function public.crear_ticket(
  p_tipo text, p_titulo text, p_detalle text, p_prioridad text default 'normal', p_proyecto_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.miembros := private.miembro_activo();
  t public.tickets;
  v_ok boolean;
begin
  if m.id is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_tipo is null or p_tipo not in ('error', 'solicitud_cambio', 'pregunta', 'acceso')
     or p_prioridad is null or p_prioridad not in ('urgente', 'alta', 'normal', 'baja')
     or p_titulo is null or char_length(btrim(p_titulo)) not between 3 and 160
     or p_detalle is null or char_length(btrim(p_detalle)) not between 1 and 10000 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if p_proyecto_id is not null then
    -- Hasta que `proyectos` exista no se puede comprobar que sea de la empresa: se rechaza.
    if to_regclass('public.proyectos') is null then
      raise exception 'proyecto_no_disponible' using errcode = 'P0001';
    end if;
    execute 'select exists (select 1 from public.proyectos x where x.id = $1 and x.empresa_id = $2)'
      into v_ok using p_proyecto_id, m.empresa_id;
    if not v_ok then raise exception 'proyecto_no_disponible' using errcode = 'P0001'; end if;
  end if;
  insert into public.tickets (empresa_id, miembro_id, proyecto_id, tipo, titulo, detalle, prioridad_propuesta)
  values (m.empresa_id, m.id, p_proyecto_id, p_tipo, btrim(p_titulo), btrim(p_detalle), p_prioridad)
  returning * into t;
  return jsonb_build_object('ticket_id', t.id, 'numero', t.numero, 'fuera_de_plan', t.fuera_de_plan,
    'motivo_fuera_de_plan', t.motivo_fuera_de_plan, 'vence_primera_respuesta', t.vence_primera_respuesta);
end $$;

-- ---------- Mensajes ----------
-- Cliente: responde en un ticket que ve. Super admin: responde "como Equipo Websourcing · <area>" o deja una
-- nota interna (el cliente nunca la ve).
create function public.responder_ticket(
  p_ticket_id uuid, p_texto text, p_interno boolean default false, p_area text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, true);
  v_super boolean := private.es_super_admin();
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if p_texto is null or char_length(btrim(p_texto)) not between 1 and 10000 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  if v_super then
    if coalesce(p_interno, false) is false and
       (p_area is null or p_area not in ('Producto', 'Arquitectura', 'Diseño', 'Desarrollo', 'Calidad', 'Operaciones')) then
      raise exception 'area_invalida' using errcode = '22023';
    end if;
    insert into public.ticket_mensajes (empresa_id, ticket_id, autor_id, autor_tipo, area, texto, interno)
    values (t.empresa_id, t.id, null, 'websourcing',
            case when coalesce(p_interno, false) then null else p_area end, btrim(p_texto), coalesce(p_interno, false))
    returning id into v_id;
  else
    if coalesce(p_interno, false) then raise exception 'no_autorizado' using errcode = '42501'; end if;
    insert into public.ticket_mensajes (empresa_id, ticket_id, autor_id, autor_tipo, texto)
    values (t.empresa_id, t.id, auth.uid(), 'cliente', btrim(p_texto))
    returning id into v_id;
  end if;
  return jsonb_build_object('mensaje_id', v_id);
end $$;

-- Retira el texto de un mensaje (por ejemplo una clave pegada por error en un ticket de acceso).
create function public.retirar_texto_mensaje(p_mensaje_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  update public.ticket_mensajes set texto = '[Contenido retirado por el Equipo Websourcing]',
         retirado_en = now(), retirado_por = auth.uid()
   where id = p_mensaje_id and retirado_en is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'mensaje_no_encontrado' using errcode = 'P0001'; end if;
end $$;

-- ---------- Adjuntos ----------
-- Paso 1: la base valida y genera la ruta (identificador aleatorio). Paso 2: el navegador sube el archivo
-- a esa ruta del bucket portal-tickets con su propia sesion; la regla de Storage lo deja si la fila existe.
create function public.preparar_adjunto_ticket(
  p_ticket_id uuid, p_nombre text, p_mime text, p_tamano_bytes bigint, p_mensaje_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, false);
  v_ext text;
  v_nombre text;
  v_ruta text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  v_ext := case p_mime
    when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' when 'image/gif' then 'gif'
    when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' when 'video/quicktime' then 'mov'
    when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a' when 'audio/x-m4a' then 'm4a'
    when 'audio/wav' then 'wav' when 'audio/ogg' then 'ogg' when 'audio/webm' then 'weba' end;
  if v_ext is null or p_tamano_bytes is null or p_tamano_bytes not between 1 and 52428800 then
    raise exception 'adjunto_invalido' using errcode = '22023';
  end if;
  v_nombre := left(regexp_replace(btrim(coalesce(p_nombre, '')), '[/\\[:cntrl:]]', '_', 'g'), 200);
  if v_nombre = '' then raise exception 'adjunto_invalido' using errcode = '22023'; end if;
  if (select count(*) from public.ticket_adjuntos a where a.ticket_id = t.id) >= 30 then
    raise exception 'demasiados_adjuntos' using errcode = 'P0001';
  end if;
  if p_mensaje_id is not null and not exists (
       select 1 from public.ticket_mensajes m
        where m.id = p_mensaje_id and m.ticket_id = t.id and m.empresa_id = t.empresa_id
          and (private.es_super_admin() or not m.interno)) then
    raise exception 'mensaje_no_encontrado' using errcode = 'P0001';
  end if;
  v_id := gen_random_uuid();
  v_ruta := t.empresa_id::text || '/tickets/' || t.id::text || '/' || gen_random_uuid()::text || '.' || v_ext;
  insert into public.ticket_adjuntos (id, empresa_id, ticket_id, mensaje_id, subido_por, nombre_original, mime, tamano_bytes, storage_path)
  values (v_id, t.empresa_id, t.id, p_mensaje_id, auth.uid(), v_nombre, p_mime, p_tamano_bytes, v_ruta);
  return jsonb_build_object('adjunto_id', v_id, 'bucket', 'portal-tickets', 'ruta', v_ruta);
end $$;

-- ---------- Super admin: clasificar y mover el ticket ----------
-- Confirma la prioridad (y, si hace falta, corrige el tipo). Pasa "nuevo" a "clasificado" y recalcula
-- el tiempo de primera respuesta desde que se creo el ticket.
create function public.clasificar_ticket(p_ticket_id uuid, p_prioridad text, p_tipo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, true);
  p record;
  v_tipo text;
  v_motivo text := t.motivo_fuera_de_plan;
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  if p_prioridad is null or p_prioridad not in ('urgente', 'alta', 'normal', 'baja') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_tipo := coalesce(p_tipo, t.tipo);
  if v_tipo is distinct from t.tipo and (v_tipo not in ('error', 'pregunta', 'acceso') or t.tipo = 'solicitud_cambio') then
    -- Para volver algo solicitud de cambio se usa marcar_solicitud_cambio().
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if t.decision_dueno is null and t.tipo <> 'solicitud_cambio' then
    v_motivo := private.motivo_fuera_de_plan(t.empresa_id, v_tipo, t.proyecto_id, (t.creado_en at time zone 'America/Bogota')::date);
  end if;
  select * into p from private.calcular_plazo(t.empresa_id, p_prioridad, t.creado_en);
  update public.tickets x set
    prioridad = p_prioridad, tipo = v_tipo,
    tipo_original = case when v_tipo is distinct from t.tipo then coalesce(t.tipo_original, t.tipo) else t.tipo_original end,
    motivo_fuera_de_plan = v_motivo, fuera_de_plan = v_motivo is not null,
    vence_primera_respuesta = p.vence, plazo_habil_minutos = p.minutos, sla_origen = p.origen,
    estado = case when t.estado = 'nuevo' then 'clasificado' else t.estado end
   where x.id = t.id returning * into t;
  return jsonb_build_object('ticket_id', t.id, 'estado', t.estado, 'prioridad', t.prioridad,
    'vence_primera_respuesta', t.vence_primera_respuesta, 'fuera_de_plan', t.fuera_de_plan);
end $$;

-- Cambia el estado: en_progreso, esperando_cliente, resuelto (con lo que se hizo) o cerrado.
create function public.cambiar_estado_ticket(p_ticket_id uuid, p_estado text, p_resolucion text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, true);
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  if p_estado is null or p_estado not in ('en_progreso', 'esperando_cliente', 'resuelto', 'cerrado') then
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end if;
  -- Trabajo nuevo con la bolsa llena: el cliente debe autorizar horas extra antes (mantenimiento 10b).
  if p_estado = 'en_progreso' and t.estado <> 'en_progreso' and private.ticket_autorizado(t)
     and not (t.tipo = 'solicitud_cambio' or t.fuera_de_plan)
     and private.bolsa_agotada_sin_autorizacion(t.empresa_id) then
    raise exception 'bolsa_agotada_sin_autorizacion' using errcode = 'P0001';
  end if;
  update public.tickets x set
    estado = p_estado,
    resolucion = case when p_estado = 'resuelto' then coalesce(nullif(btrim(p_resolucion), ''), x.resolucion) else x.resolucion end,
    cierre_motivo = case when p_estado = 'cerrado' then 'cerrado_por_websourcing' else x.cierre_motivo end
   where x.id = t.id returning * into t;
  return jsonb_build_object('ticket_id', t.id, 'estado', t.estado);
end $$;

-- ---------- Solicitudes de cambio y decision del dueno ----------
create function public.marcar_solicitud_cambio(p_ticket_id uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, true);
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  if t.tipo = 'solicitud_cambio' then raise exception 'ya_es_solicitud_cambio' using errcode = 'P0001'; end if;
  -- Un cambio no se trabaja hasta que el dueno decida: si ya estaba en curso, vuelve a "clasificado".
  update public.tickets x set
    tipo = 'solicitud_cambio', tipo_original = coalesce(t.tipo_original, t.tipo),
    fuera_de_plan = false, motivo_fuera_de_plan = null,
    estado = case when t.estado in ('en_progreso', 'esperando_cliente') then 'clasificado' else t.estado end
   where x.id = t.id returning * into t;
  return jsonb_build_object('ticket_id', t.id, 'estado', t.estado, 'tipo', t.tipo);
end $$;

-- El dueno decide: cobrar (con valor), regalar o rechazar (cierra el ticket, con motivo).
-- Aplica a solicitudes de cambio y a tickets fuera de plan. Cobrar queda a la espera del admin del cliente.
create function public.decidir_ticket(
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

-- El admin del cliente acepta o rechaza el cobro (D-004: queda quien, cuando y desde donde en el registro).
create function public.aceptar_cobro_ticket(p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, true);
begin
  if t.id is null or not private.es_admin_cliente(t.empresa_id) then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  if t.decision_dueno is distinct from 'cobrar' then raise exception 'cobro_no_aplica' using errcode = 'P0001'; end if;
  if t.cobro_aceptado_en is not null then raise exception 'cobro_ya_aceptado' using errcode = 'P0001'; end if;
  update public.tickets x set cobro_aceptado_en = now(), cobro_aceptado_por = auth.uid(), cobro_rechazado_en = null
   where x.id = t.id returning * into t;
  return jsonb_build_object('ticket_id', t.id, 'cobro_aceptado_en', t.cobro_aceptado_en);
end $$;

create function public.rechazar_cobro_ticket(p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, true);
begin
  if t.id is null or not private.es_admin_cliente(t.empresa_id) then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  if t.decision_dueno is distinct from 'cobrar' then raise exception 'cobro_no_aplica' using errcode = 'P0001'; end if;
  if t.cobro_aceptado_en is not null then raise exception 'cobro_ya_aceptado' using errcode = 'P0001'; end if;
  update public.tickets x set cobro_rechazado_en = now(), estado = 'cerrado', cierre_motivo = 'cobro_rechazado'
   where x.id = t.id returning * into t;
  return jsonb_build_object('ticket_id', t.id, 'estado', t.estado);
end $$;

-- ---------- Cliente: confirmar y calificar ----------
create function public.confirmar_resolucion(p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, true);
begin
  if private.es_super_admin() or private.miembro_activo() is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.creado_por <> auth.uid() and not private.es_admin_cliente(t.empresa_id) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if t.estado <> 'resuelto' then raise exception 'ticket_no_resuelto' using errcode = 'P0001'; end if;
  update public.tickets x set estado = 'cerrado', cierre_motivo = 'confirmado_cliente' where x.id = t.id returning * into t;
  return jsonb_build_object('ticket_id', t.id, 'estado', t.estado);
end $$;

create function public.calificar_ticket(p_ticket_id uuid, p_estrellas integer, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, true);
begin
  if private.es_super_admin() or private.miembro_activo() is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.creado_por <> auth.uid() and not private.es_admin_cliente(t.empresa_id) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if t.estado <> 'cerrado' then raise exception 'ticket_no_cerrado' using errcode = 'P0001'; end if;
  if t.calificacion is not null then raise exception 'ya_calificado' using errcode = 'P0001'; end if;
  if p_estrellas is null or p_estrellas not between 1 and 5 or char_length(coalesce(p_comentario, '')) > 1000 then
    raise exception 'calificacion_invalida' using errcode = '22023';
  end if;
  update public.tickets x set calificacion = p_estrellas, calificacion_comentario = nullif(btrim(p_comentario), ''),
         calificado_en = now() where x.id = t.id returning * into t;
  return jsonb_build_object('ticket_id', t.id, 'calificacion', t.calificacion);
end $$;

-- ---------- Permisos de ejecucion: solo usuarios con sesion; nunca anon ----------
revoke all on function
  public.crear_ticket(text, text, text, text, uuid), public.responder_ticket(uuid, text, boolean, text),
  public.retirar_texto_mensaje(uuid), public.preparar_adjunto_ticket(uuid, text, text, bigint, uuid),
  public.clasificar_ticket(uuid, text, text), public.cambiar_estado_ticket(uuid, text, text),
  public.marcar_solicitud_cambio(uuid, text), public.decidir_ticket(uuid, text, text, numeric, text),
  public.aceptar_cobro_ticket(uuid), public.rechazar_cobro_ticket(uuid), public.confirmar_resolucion(uuid),
  public.calificar_ticket(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.crear_ticket(text, text, text, text, uuid), public.responder_ticket(uuid, text, boolean, text),
  public.retirar_texto_mensaje(uuid), public.preparar_adjunto_ticket(uuid, text, text, bigint, uuid),
  public.clasificar_ticket(uuid, text, text), public.cambiar_estado_ticket(uuid, text, text),
  public.marcar_solicitud_cambio(uuid, text), public.decidir_ticket(uuid, text, text, numeric, text),
  public.aceptar_cobro_ticket(uuid), public.rechazar_cobro_ticket(uuid), public.confirmar_resolucion(uuid),
  public.calificar_ticket(uuid, integer, text)
  to authenticated;
