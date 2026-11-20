-- Sprint 5 y 6 · Tablas de tickets y de mantenimiento por empresa.
-- Todas con empresa_id, llaves foraneas COMPUESTAS (empresa_id, id) y empresa_id inmutable.
-- Las reglas RLS van en 000500 y las funciones de escritura (RPC) en 000600 y 000700.
-- Equipo Websourcing · Desarrollo
--
-- proyecto_id: llave foranea compuesta (proyecto_id, empresa_id) -> proyectos (id, empresa_id), asi un ticket o
-- una garantia de la empresa A nunca apunta a un proyecto de la B.

create function private.claves_parametros_mantenimiento() returns text[]
language sql immutable set search_path = '' as $$
  select array['plan_base', 'fecha_inicio', 'fecha_fin', 'renovacion_automatica', 'moneda', 'cuota_mensual',
    'horas_mes', 'acumular_horas', 'revisiones_por_semana', 'dias_atencion', 'horario_desde', 'horario_hasta',
    'zona_horaria', 'tiempos_respuesta', 'copias_frecuencia', 'parches_frecuencia', 'auditoria',
    'auditoria_cada_meses', 'reuniones_por_mes', 'reporte_tipo', 'servidores_incluidos',
    'servidores_costo_mensual', 'incluye', 'incluye_otros', 'valor_hora_extra', 'proxima_revision']
$$;

-- Lo que puede traer un plan base (punto de partida): nunca precios ni fechas.
create function private.claves_preset_mantenimiento() returns text[]
language sql immutable set search_path = '' as $$
  select array['horas_mes', 'acumular_horas', 'revisiones_por_semana', 'dias_atencion', 'horario_desde',
    'horario_hasta', 'tiempos_respuesta', 'copias_frecuencia', 'parches_frecuencia', 'auditoria',
    'auditoria_cada_meses', 'reuniones_por_mes', 'reporte_tipo', 'servidores_incluidos', 'incluye']
$$;

create function private.json_solo_claves(p jsonb, p_claves text[]) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (select 1 from jsonb_object_keys(p) k where k <> all (p_claves))
$$;

-- Forma de los tiempos de respuesta: {"urgente": {"horas_habiles": 2}, "alta": {"dias_habiles": 1}, ...}
-- "baja" puede ser "siguiente_planeacion". Las claves que falten usan el valor por defecto (D-003).
create function private.tiempos_validos(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(p) loop
    if k not in ('urgente', 'alta', 'normal', 'baja') then return false; end if;
    if jsonb_typeof(v) = 'string' then
      if k <> 'baja' or v #>> '{}' <> 'siguiente_planeacion' then return false; end if;
    elsif jsonb_typeof(v) = 'object' then
      if (select count(*) from jsonb_object_keys(v)) <> 1 then return false; end if;
      if v ? 'horas_habiles' then
        if jsonb_typeof(v -> 'horas_habiles') <> 'number' or (v ->> 'horas_habiles')::numeric not between 0.5 and 240 then return false; end if;
      elsif v ? 'dias_habiles' then
        if jsonb_typeof(v -> 'dias_habiles') <> 'number' or (v ->> 'dias_habiles')::numeric not between 1 and 30 then return false; end if;
      else
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Mantenimiento
-- ---------------------------------------------------------------------------------------------

-- Planes base: punto de partida editable por el super admin. SIN precios (el portal no inventa precios).
create table public.planes_base_mantenimiento (
  plan            text primary key check (plan in ('basico', 'estandar', 'premium')),
  parametros      jsonb not null check (private.json_solo_claves(parametros, private.claves_preset_mantenimiento())),
  nota            text check (nota is null or char_length(nota) <= 500),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid
);

-- Un plan por empresa. SIN FILA = mantenimiento apagado (estado por defecto de toda empresa nueva).
create table public.planes_mantenimiento (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references public.empresas (id),
  activo                   boolean not null default false,
  plan_base                text not null default 'personalizado' check (plan_base in ('basico', 'estandar', 'premium', 'personalizado')),
  fecha_inicio             date,
  fecha_fin                date,
  renovacion_automatica    boolean not null default true,
  moneda                   text not null default 'COP' check (moneda in ('COP', 'USD')),
  cuota_mensual            numeric(14, 2) check (cuota_mensual is null or cuota_mensual > 0),
  horas_mes                numeric(6, 2) not null default 0 check (horas_mes between 0 and 999),
  acumular_horas           boolean not null default false,            -- D-007: por defecto se pierden
  revisiones_por_semana    smallint not null default 1 check (revisiones_por_semana between 0 and 21),
  dias_atencion            smallint[] not null default '{1,2,3,4,5}'
                             check (cardinality(dias_atencion) between 1 and 7
                                    and dias_atencion <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  horario_desde            time not null default '08:00',
  horario_hasta            time not null default '18:00',
  zona_horaria             text not null default 'America/Bogota' check (zona_horaria ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  tiempos_respuesta        jsonb check (tiempos_respuesta is null or private.tiempos_validos(tiempos_respuesta)),
  copias_frecuencia        text not null default 'diaria' check (copias_frecuencia in ('diaria', 'semanal', 'mensual', 'ninguna')),
  parches_frecuencia       text not null default 'mensual' check (parches_frecuencia in ('semanal', 'quincenal', 'mensual', 'trimestral', 'ninguna')),
  auditoria                boolean not null default false,
  auditoria_cada_meses     smallint check (auditoria_cada_meses in (1, 3, 6, 12)),
  reuniones_por_mes        smallint not null default 0 check (reuniones_por_mes between 0 and 10),
  reporte_tipo             text not null default 'resumido' check (reporte_tipo in ('ninguno', 'resumido', 'detallado')),
  servidores_incluidos     boolean not null default false,
  servidores_costo_mensual numeric(14, 2) check (servidores_costo_mensual is null or servidores_costo_mensual >= 0),
  incluye                  text[] not null default '{}'
                             check (incluye <@ array['correccion_errores', 'copias_seguridad', 'monitoreo',
                                'actualizaciones_seguridad', 'auditoria_trimestral', 'pequenos_ajustes']::text[]),
  incluye_otros            text check (incluye_otros is null or char_length(incluye_otros) <= 500),
  valor_hora_extra         numeric(12, 2) check (valor_hora_extra is null or valor_hora_extra >= 0),
  proxima_revision         date,
  activado_en              timestamptz,
  activado_por             uuid references public.perfiles (user_id),
  apagado_en               timestamptz,
  apagado_por              uuid references public.perfiles (user_id),
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  constraint planes_mantenimiento_una_por_empresa unique (empresa_id),
  constraint planes_mantenimiento_empresa_id_unico unique (empresa_id, id),
  constraint planes_horario_coherente check (horario_desde < horario_hasta),
  constraint planes_fechas_coherentes check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio),
  constraint planes_renovacion_o_fin check (renovacion_automatica or fecha_fin is not null),
  constraint planes_auditoria_coherente check (auditoria = (auditoria_cada_meses is not null)),
  -- Activo exige lo minimo: cuota (la escribe el super admin) y fecha de inicio.
  constraint planes_activo_completo check (not activo or (cuota_mensual is not null and fecha_inicio is not null))
);

-- Historial de cambios del plan: parametro anterior y nuevo, desde cuando aplica y motivo.
-- tipo 'parametros' con aplicado_en null = cambio programado para el proximo mes.
create table public.planes_mantenimiento_historial (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas (id),
  plan_id               uuid not null,
  tipo                  text not null check (tipo in ('activacion', 'apagado', 'parametros')),
  parametros_anteriores jsonb not null default '{}'::jsonb,
  parametros_nuevos     jsonb not null default '{}'::jsonb,
  motivo                text not null check (char_length(btrim(motivo)) between 3 and 500),
  efectivo_desde        date not null,
  aplicado_en           timestamptz,
  error_aplicacion      text check (error_aplicacion is null or char_length(error_aplicacion) <= 300),
  creado_por            uuid default auth.uid() references public.perfiles (user_id),
  creado_en             timestamptz not null default now(),
  constraint historial_plan_misma_empresa foreign key (empresa_id, plan_id)
    references public.planes_mantenimiento (empresa_id, id),
  constraint planes_historial_empresa_id_unico unique (empresa_id, id)
);
create index planes_historial_plan_idx on public.planes_mantenimiento_historial (plan_id, creado_en desc);
create index planes_historial_pendientes_idx on public.planes_mantenimiento_historial (efectivo_desde) where aplicado_en is null;

-- Bolsa de horas de un mes. horas_usadas = solo las que caben en la bolsa; lo que pasa de la
-- bolsa se cuenta en horas_extra.
create table public.bolsa_mensual (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas (id),
  plan_id              uuid not null,
  mes                  date not null check (extract(day from mes) = 1),
  horas_incluidas      numeric(7, 2) not null check (horas_incluidas >= 0),
  horas_arrastradas    numeric(7, 2) not null default 0 check (horas_arrastradas >= 0),
  horas_usadas         numeric(7, 2) not null default 0 check (horas_usadas >= 0),
  horas_extra          numeric(7, 2) not null default 0 check (horas_extra >= 0),
  extra_autorizado     boolean not null default false,
  extra_autorizado_por uuid references public.perfiles (user_id),
  extra_autorizado_en  timestamptz,
  aviso_80_en          timestamptz,
  aviso_100_en         timestamptz,
  cerrada_en           timestamptz,
  horas_perdidas       numeric(7, 2) check (horas_perdidas is null or horas_perdidas >= 0),
  horas_acumuladas     numeric(7, 2) check (horas_acumuladas is null or horas_acumuladas >= 0),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  constraint bolsa_plan_misma_empresa foreign key (empresa_id, plan_id)
    references public.planes_mantenimiento (empresa_id, id),
  constraint bolsa_un_mes_por_plan unique (plan_id, mes),
  constraint bolsa_empresa_id_unico unique (empresa_id, id),
  constraint bolsa_uso_dentro_de_la_bolsa check (horas_usadas <= horas_incluidas + horas_arrastradas),
  constraint bolsa_cierre_coherente check ((cerrada_en is null) = (horas_perdidas is null)
                                           and (cerrada_en is null) = (horas_acumuladas is null))
);
create index bolsa_empresa_mes_idx on public.bolsa_mensual (empresa_id, mes desc);

-- Historial de avisos de la bolsa (80 % y 100 %). Solo se agrega.
create table public.bolsa_avisos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas (id),
  bolsa_id         uuid not null,
  tipo             text not null check (tipo in ('80_por_ciento', '100_por_ciento')),
  porcentaje       numeric(7, 2) not null check (porcentaje >= 0),
  horas_usadas     numeric(7, 2) not null,
  horas_disponibles numeric(7, 2) not null,
  creado_en        timestamptz not null default now(),
  constraint avisos_bolsa_misma_empresa foreign key (empresa_id, bolsa_id)
    references public.bolsa_mensual (empresa_id, id),
  constraint avisos_un_tipo_por_bolsa unique (bolsa_id, tipo)
);

-- Garantia de 30 dias de un proyecto/empresa. La escribe el super admin (D: el portal no la
-- deduce todavia del hito 12, que vive en `proyectos`).
create table public.garantias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id),
  proyecto_id uuid,
  inicia_en   date not null,
  vence_en    date not null,
  nota        text check (nota is null or char_length(nota) <= 500),
  creado_por  uuid default auth.uid() references public.perfiles (user_id),
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint garantias_fechas_coherentes check (vence_en >= inicia_en and vence_en <= inicia_en + 366),
  constraint garantias_empresa_id_unico unique (empresa_id, id),
  constraint garantias_proyecto_misma_empresa foreign key (proyecto_id, empresa_id) references public.proyectos (id, empresa_id)
);
create index garantias_empresa_idx on public.garantias (empresa_id, vence_en desc);

-- ---------------------------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------------------------
create table public.tickets (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references public.empresas (id),
  numero                   integer not null,                    -- consecutivo por empresa (lo pone un trigger)
  proyecto_id              uuid,
  tipo                     text not null check (tipo in ('error', 'solicitud_cambio', 'pregunta', 'acceso')),
  tipo_original            text check (tipo_original in ('error', 'solicitud_cambio', 'pregunta', 'acceso')),
  titulo                   text not null check (char_length(btrim(titulo)) between 3 and 160),
  detalle                  text not null check (char_length(btrim(detalle)) between 1 and 10000),
  prioridad_propuesta      text not null check (prioridad_propuesta in ('urgente', 'alta', 'normal', 'baja')),
  prioridad                text check (prioridad in ('urgente', 'alta', 'normal', 'baja')),
  estado                   text not null default 'nuevo'
                             check (estado in ('nuevo', 'clasificado', 'en_progreso', 'esperando_cliente', 'resuelto', 'cerrado')),
  creado_por               uuid not null default auth.uid() references public.perfiles (user_id),
  miembro_id               uuid not null,
  -- Cobertura (seccion 10b): fuera de garantia y sin mantenimiento vigente no se atiende sin decision del dueno.
  fuera_de_plan            boolean not null default false,
  motivo_fuera_de_plan     text check (motivo_fuera_de_plan in ('sin_mantenimiento', 'mantenimiento_vencido', 'sin_cobertura_errores')),
  -- Tiempo de respuesta: se calcula al crear y al clasificar (D-002, D-003 o el plan de mantenimiento).
  sla_origen               text not null default 'predeterminado' check (sla_origen in ('predeterminado', 'mantenimiento')),
  plazo_habil_minutos      numeric(10, 2) check (plazo_habil_minutos is null or plazo_habil_minutos > 0),
  vence_primera_respuesta  timestamptz,
  primera_respuesta_en     timestamptz,
  clasificado_en           timestamptz,
  resuelto_en              timestamptz,
  cerrado_en               timestamptz,
  resolucion               text check (resolucion is null or char_length(resolucion) <= 5000),
  cierre_motivo            text check (cierre_motivo in ('confirmado_cliente', 'automatico', 'cerrado_por_websourcing', 'rechazado', 'cobro_rechazado')),
  -- Decision del dueno (cobrar / regalar / rechazar) para tickets fuera de plan y solicitudes de cambio.
  decision_dueno           text check (decision_dueno in ('cobrar', 'regalar', 'rechazar')),
  decision_motivo          text check (decision_motivo is null or char_length(decision_motivo) <= 1000),
  decision_en              timestamptz,
  decision_por             uuid references public.perfiles (user_id),
  cobro_valor              numeric(14, 2) check (cobro_valor is null or cobro_valor > 0),
  cobro_moneda             text check (cobro_moneda in ('COP', 'USD')),
  cobro_aceptado_en        timestamptz,
  cobro_aceptado_por       uuid references public.perfiles (user_id),
  cobro_rechazado_en       timestamptz,
  calificacion             smallint check (calificacion between 1 and 5),
  calificacion_comentario  text check (calificacion_comentario is null or char_length(calificacion_comentario) <= 1000),
  calificado_en            timestamptz,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  constraint tickets_empresa_id_unico unique (empresa_id, id),
  constraint tickets_numero_unico unique (empresa_id, numero),
  constraint tickets_proyecto_misma_empresa foreign key (proyecto_id, empresa_id) references public.proyectos (id, empresa_id),
  constraint tickets_miembro_misma_empresa foreign key (empresa_id, miembro_id) references public.miembros (empresa_id, id),
  constraint tickets_cambio_no_es_fuera_de_plan check (not (tipo = 'solicitud_cambio' and fuera_de_plan)),
  constraint tickets_fuera_de_plan_coherente check (fuera_de_plan = (motivo_fuera_de_plan is not null)),
  constraint tickets_cierre_coherente check ((estado = 'cerrado') = (cerrado_en is not null)
                                             and (estado = 'cerrado') = (cierre_motivo is not null)),
  constraint tickets_decision_coherente check (
    (decision_dueno is null) = (decision_en is null)
    and (decision_dueno is distinct from 'cobrar' or (cobro_valor is not null and cobro_moneda is not null))
    and (decision_dueno is not null or (cobro_valor is null and cobro_moneda is null))),
  constraint tickets_cobro_coherente check (
    (cobro_aceptado_en is null) = (cobro_aceptado_por is null)
    and (cobro_aceptado_en is null or decision_dueno = 'cobrar')
    and (cobro_rechazado_en is null or decision_dueno = 'cobrar')
    and not (cobro_aceptado_en is not null and cobro_rechazado_en is not null)),
  constraint tickets_calificacion_coherente check ((calificacion is null) = (calificado_en is null)
                                                   and (calificacion is null or estado = 'cerrado')),
  constraint tickets_clasificado_con_prioridad check (estado in ('nuevo', 'cerrado') or prioridad is not null)
);
create index tickets_empresa_estado_idx on public.tickets (empresa_id, estado, creado_en desc);
create index tickets_creado_por_idx on public.tickets (empresa_id, creado_por);
create index tickets_resueltos_idx on public.tickets (resuelto_en) where estado = 'resuelto';

create table public.ticket_mensajes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id),
  ticket_id    uuid not null,
  -- Cliente: su usuario. Websourcing: NULL (el autor interno nunca se muestra al cliente; queda en el registro).
  autor_id     uuid references public.perfiles (user_id),
  autor_tipo   text not null check (autor_tipo in ('cliente', 'websourcing')),
  area         text check (area in ('Producto', 'Arquitectura', 'Diseño', 'Desarrollo', 'Calidad', 'Operaciones')),
  texto        text not null check (char_length(texto) between 1 and 10000),
  interno      boolean not null default false,           -- nota interna: el cliente nunca la ve
  retirado_en  timestamptz,
  retirado_por uuid references public.perfiles (user_id),
  creado_en    timestamptz not null default now(),
  constraint mensajes_ticket_misma_empresa foreign key (empresa_id, ticket_id) references public.tickets (empresa_id, id),
  constraint mensajes_empresa_id_unico unique (empresa_id, id),
  constraint mensajes_autor_coherente check (
    (autor_tipo = 'cliente' and autor_id is not null and area is null and not interno)
    or (autor_tipo = 'websourcing' and autor_id is null and (interno or area is not null)))
);
create index ticket_mensajes_ticket_idx on public.ticket_mensajes (ticket_id, creado_en);

-- Metadatos de los adjuntos. El archivo vive en Storage (bucket privado portal-tickets); la ruta la
-- genera la base (preparar_adjunto_ticket), nunca el usuario.
create table public.ticket_adjuntos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id),
  ticket_id       uuid not null,
  mensaje_id      uuid,
  subido_por      uuid not null default auth.uid() references public.perfiles (user_id),
  nombre_original text not null check (char_length(nombre_original) between 1 and 200 and nombre_original !~ '[/\\[:cntrl:]]'),
  mime            text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif',
                    'video/mp4', 'video/webm', 'video/quicktime',
                    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg', 'audio/webm')),
  tamano_bytes    bigint not null check (tamano_bytes between 1 and 52428800),     -- 50 MB
  storage_path    text not null unique,
  creado_en       timestamptz not null default now(),
  constraint adjuntos_ticket_misma_empresa foreign key (empresa_id, ticket_id) references public.tickets (empresa_id, id),
  constraint adjuntos_mensaje_misma_empresa foreign key (empresa_id, mensaje_id) references public.ticket_mensajes (empresa_id, id),
  constraint adjuntos_ruta_de_su_ticket check (
    storage_path ~ ('^' || empresa_id::text || '/tickets/' || ticket_id::text
                    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$')),
  constraint adjuntos_empresa_id_unico unique (empresa_id, id)
);
create index ticket_adjuntos_ticket_idx on public.ticket_adjuntos (ticket_id);

-- ---------------------------------------------------------------------------------------------
-- Horas anotadas a mano por ticket (D-008). El dueno las revisa antes de que se descuenten.
-- ---------------------------------------------------------------------------------------------
create table public.horas_registradas (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas (id),
  ticket_id            uuid not null,
  bolsa_id             uuid not null,
  origen_id            uuid,                                  -- si esta fila es el sobrante extra de otra
  mes                  date not null check (extract(day from mes) = 1),
  fecha_trabajo        date not null,
  horas                numeric(5, 2) not null check (horas > 0 and horas <= 99),
  estado               text not null default 'pendiente_dueno'
                         check (estado in ('pendiente_dueno', 'aprobada', 'rechazada',
                                           'extra_pendiente_cliente', 'extra_aprobada', 'extra_rechazada')),
  registrado_por       uuid not null default auth.uid() references public.perfiles (user_id),
  registrado_en        timestamptz not null default now(),
  revisado_por         uuid references public.perfiles (user_id),
  revisado_en          timestamptz,
  motivo_revision      text check (motivo_revision is null or char_length(motivo_revision) <= 500),
  decidido_cliente_por uuid references public.perfiles (user_id),
  decidido_cliente_en  timestamptz,
  actualizado_en       timestamptz not null default now(),
  constraint horas_ticket_misma_empresa foreign key (empresa_id, ticket_id) references public.tickets (empresa_id, id),
  constraint horas_bolsa_misma_empresa foreign key (empresa_id, bolsa_id) references public.bolsa_mensual (empresa_id, id),
  constraint horas_empresa_id_unico unique (empresa_id, id),
  constraint horas_origen_misma_empresa foreign key (empresa_id, origen_id) references public.horas_registradas (empresa_id, id),
  constraint horas_revision_coherente check ((estado = 'pendiente_dueno') = (revisado_en is null)),
  constraint horas_fecha_en_su_mes check (date_trunc('month', fecha_trabajo::timestamp)::date = mes)
);
create index horas_ticket_idx on public.horas_registradas (ticket_id);
create index horas_bolsa_idx on public.horas_registradas (bolsa_id);

-- Nota interna de las horas: aparte, para que el cliente nunca pueda leerla.
create table public.horas_notas_internas (
  hora_id    uuid primary key,
  empresa_id uuid not null references public.empresas (id),
  nota       text not null check (char_length(nota) between 1 and 1000),
  creado_en  timestamptz not null default now(),
  constraint notas_hora_misma_empresa foreign key (empresa_id, hora_id) references public.horas_registradas (empresa_id, id)
);

-- ---------------------------------------------------------------------------------------------
-- Triggers de utilidad (ver migracion 000100 del sprint 1)
-- ---------------------------------------------------------------------------------------------
create trigger planes_base_actualizado before update on public.planes_base_mantenimiento
  for each row execute function private.poner_actualizado_en();
create trigger planes_base_campos_fijos before update on public.planes_base_mantenimiento
  for each row execute function private.campos_inmutables('plan');
create trigger planes_actualizado before update on public.planes_mantenimiento
  for each row execute function private.poner_actualizado_en();
create trigger bolsa_actualizada before update on public.bolsa_mensual
  for each row execute function private.poner_actualizado_en();
create trigger garantias_actualizada before update on public.garantias
  for each row execute function private.poner_actualizado_en();
create trigger tickets_actualizado before update on public.tickets
  for each row execute function private.poner_actualizado_en();
create trigger horas_actualizada before update on public.horas_registradas
  for each row execute function private.poner_actualizado_en();

create trigger planes_empresa_fija before update on public.planes_mantenimiento
  for each row execute function private.empresa_id_inmutable();
create trigger planes_historial_empresa_fija before update on public.planes_mantenimiento_historial
  for each row execute function private.empresa_id_inmutable();
create trigger bolsa_empresa_fija before update on public.bolsa_mensual
  for each row execute function private.empresa_id_inmutable();
create trigger garantias_empresa_fija before update on public.garantias
  for each row execute function private.empresa_id_inmutable();
create trigger tickets_empresa_fija before update on public.tickets
  for each row execute function private.empresa_id_inmutable();
create trigger ticket_mensajes_empresa_fija before update on public.ticket_mensajes
  for each row execute function private.empresa_id_inmutable();
create trigger ticket_adjuntos_empresa_fija before update on public.ticket_adjuntos
  for each row execute function private.empresa_id_inmutable();
create trigger horas_empresa_fija before update on public.horas_registradas
  for each row execute function private.empresa_id_inmutable();
create trigger horas_notas_empresa_fija before update on public.horas_notas_internas
  for each row execute function private.empresa_id_inmutable();
create trigger bolsa_avisos_empresa_fija before update on public.bolsa_avisos
  for each row execute function private.empresa_id_inmutable();

create trigger planes_campos_fijos before update on public.planes_mantenimiento
  for each row execute function private.campos_inmutables('id', 'creado_en');
create trigger planes_historial_campos_fijos before update on public.planes_mantenimiento_historial
  for each row execute function private.campos_inmutables('id', 'plan_id', 'tipo', 'parametros_anteriores',
    'parametros_nuevos', 'motivo', 'efectivo_desde', 'creado_por', 'creado_en');
create trigger bolsa_campos_fijos before update on public.bolsa_mensual
  for each row execute function private.campos_inmutables('id', 'plan_id', 'mes', 'creado_en');
create trigger garantias_campos_fijos before update on public.garantias
  for each row execute function private.campos_inmutables('id', 'creado_por', 'creado_en');
create trigger tickets_campos_fijos before update on public.tickets
  for each row execute function private.campos_inmutables('id', 'numero', 'proyecto_id', 'creado_por', 'miembro_id',
    'prioridad_propuesta', 'creado_en');
create trigger ticket_mensajes_campos_fijos before update on public.ticket_mensajes
  for each row execute function private.campos_inmutables('id', 'ticket_id', 'autor_id', 'autor_tipo', 'area',
    'interno', 'creado_en');
create trigger horas_campos_fijos before update on public.horas_registradas
  for each row execute function private.campos_inmutables('id', 'ticket_id', 'bolsa_id', 'origen_id', 'mes',
    'fecha_trabajo', 'registrado_por', 'registrado_en');
create trigger horas_notas_campos_fijos before update on public.horas_notas_internas
  for each row execute function private.campos_inmutables('hora_id', 'nota', 'creado_en');

-- Adjuntos, avisos de bolsa y notas: solo se agregan.
create trigger ticket_adjuntos_solo_agregar before update or delete on public.ticket_adjuntos
  for each row execute function private.solo_agregar();
create trigger ticket_adjuntos_sin_truncate before truncate on public.ticket_adjuntos
  for each statement execute function private.solo_agregar();
create trigger bolsa_avisos_solo_agregar before update or delete on public.bolsa_avisos
  for each row execute function private.solo_agregar();
create trigger bolsa_avisos_sin_truncate before truncate on public.bolsa_avisos
  for each statement execute function private.solo_agregar();
create trigger horas_notas_solo_agregar before delete on public.horas_notas_internas
  for each row execute function private.solo_agregar();
create trigger tickets_sin_borrar before delete on public.tickets
  for each row execute function private.solo_agregar();
create trigger ticket_mensajes_sin_borrar before delete on public.ticket_mensajes
  for each row execute function private.solo_agregar();
create trigger outbox_sin_borrar_ni_truncar before truncate on public.outbox_correos
  for each statement execute function private.solo_agregar();

revoke all on function private.claves_parametros_mantenimiento(), private.claves_preset_mantenimiento(),
  private.tiempos_validos(jsonb), private.json_solo_claves(jsonb, text[]) from public, anon, authenticated, service_role;
-- El CHECK de planes_base_mantenimiento (que edita el super admin directo) corre con los permisos de quien escribe.
grant execute on function private.claves_preset_mantenimiento(), private.json_solo_claves(jsonb, text[]) to authenticated;

-- Planes base: valores de partida PROPUESTOS por Desarrollo (sin precios). El dueno los confirma o
-- los edita; mientras no se definan las reglas de precio (D-009) no hay cuota por defecto.
insert into public.planes_base_mantenimiento (plan, parametros, nota) values
  ('basico', '{"horas_mes": 4, "acumular_horas": false, "revisiones_por_semana": 1, "copias_frecuencia": "diaria",
     "parches_frecuencia": "mensual", "auditoria": false, "reuniones_por_mes": 0, "reporte_tipo": "resumido",
     "servidores_incluidos": false, "incluye": ["correccion_errores", "copias_seguridad", "monitoreo"]}',
   'Valores de partida propuestos por Desarrollo; el dueno los confirma.'),
  ('estandar', '{"horas_mes": 8, "acumular_horas": false, "revisiones_por_semana": 2, "copias_frecuencia": "diaria",
     "parches_frecuencia": "quincenal", "auditoria": false, "reuniones_por_mes": 1, "reporte_tipo": "resumido",
     "servidores_incluidos": false,
     "incluye": ["correccion_errores", "copias_seguridad", "monitoreo", "actualizaciones_seguridad", "pequenos_ajustes"]}',
   'Valores de partida propuestos por Desarrollo; el dueno los confirma.'),
  ('premium', '{"horas_mes": 16, "acumular_horas": false, "revisiones_por_semana": 3, "copias_frecuencia": "diaria",
     "parches_frecuencia": "semanal", "auditoria": true, "auditoria_cada_meses": 3, "reuniones_por_mes": 2,
     "reporte_tipo": "detallado", "servidores_incluidos": false,
     "tiempos_respuesta": {"urgente": {"horas_habiles": 1}, "alta": {"horas_habiles": 4}, "normal": {"dias_habiles": 1}},
     "incluye": ["correccion_errores", "copias_seguridad", "monitoreo", "actualizaciones_seguridad", "auditoria_trimestral", "pequenos_ajustes"]}',
   'Valores de partida propuestos por Desarrollo; el dueno los confirma.');
