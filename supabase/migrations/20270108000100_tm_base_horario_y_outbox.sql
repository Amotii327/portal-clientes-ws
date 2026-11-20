-- Sprint 5 (tickets) y sprint 6 (mantenimiento) · Base: horario habil, cola de correos (outbox).
-- Equipo Websourcing · Desarrollo
-- Hora de Colombia siempre (America/Bogota). Sin festivos (D-002).

-- Fecha de hoy en Colombia.
create function private.hoy() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- Si t cae fuera del horario, devuelve la proxima apertura; si cae dentro, devuelve t.
-- p_dias usa el dia ISO (1 = lunes ... 7 = domingo). Todo en hora local (timestamp sin zona).
create function private.proximo_inicio_habil(p_t timestamp, p_dias int[], p_desde time, p_hasta time)
returns timestamp language plpgsql immutable set search_path = '' as $$
declare
  t timestamp := p_t;
  i int := 0;
begin
  if p_dias is null or cardinality(p_dias) = 0 or p_desde >= p_hasta then
    raise exception 'horario_invalido' using errcode = '22023';
  end if;
  loop
    i := i + 1;
    if i > 16 then raise exception 'horario_invalido' using errcode = '22023'; end if;
    if extract(isodow from t)::int = any (p_dias) then
      if t::time < p_desde then
        return t::date + p_desde;
      elsif t::time < p_hasta then
        return t;
      end if;
    end if;
    t := (t::date + 1)::timestamp;
  end loop;
end $$;

-- Suma minutos HABILES a un instante. Si el instante cae fuera del horario, el reloj arranca
-- en la proxima apertura.
create function private.sumar_minutos_habiles(
  p_inicio timestamptz, p_minutos numeric, p_dias int[], p_desde time, p_hasta time, p_zona text)
returns timestamptz language plpgsql immutable set search_path = '' as $$
declare
  t timestamp := private.proximo_inicio_habil(p_inicio at time zone p_zona, p_dias, p_desde, p_hasta);
  resto numeric := greatest(p_minutos, 0);
  disp numeric;
begin
  loop
    disp := extract(epoch from ((t::date + p_hasta) - t)) / 60;
    if resto <= disp then
      return (t + (resto * interval '1 minute')) at time zone p_zona;
    end if;
    resto := resto - disp;
    t := private.proximo_inicio_habil((t::date + 1)::timestamp, p_dias, p_desde, p_hasta);
  end loop;
end $$;

-- Minutos habiles entre dos instantes (0 si p_b <= p_a).
create function private.minutos_habiles_entre(
  p_a timestamptz, p_b timestamptz, p_dias int[], p_desde time, p_hasta time, p_zona text)
returns numeric language plpgsql immutable set search_path = '' as $$
declare
  la timestamp := p_a at time zone p_zona;
  lb timestamp := p_b at time zone p_zona;
  d date;
  total numeric := 0;
begin
  if lb <= la then return 0; end if;
  if lb::date - la::date > 800 then
    raise exception 'rango_demasiado_largo' using errcode = '22023';
  end if;
  d := la::date;
  while d <= lb::date loop
    if extract(isodow from d)::int = any (p_dias) then
      total := total + greatest(0, extract(epoch from (least(d + p_hasta, lb) - greatest(d + p_desde, la))) / 60);
    end if;
    d := d + 1;
  end loop;
  return total;
end $$;

-- Umbral del semaforo: el ticket pasa a amarillo cuando queda este porcentaje (o menos) del plazo.
insert into public.configuracion (clave, valor) values ('semaforo_tickets', '{"amarillo_restante_pct": 50}')
on conflict (clave) do nothing;

create function private.semaforo_umbral_amarillo() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(c.valor -> 'amarillo_restante_pct') = 'number'
                                and (c.valor ->> 'amarillo_restante_pct')::numeric between 1 and 99
                               then (c.valor ->> 'amarillo_restante_pct')::numeric end
                     from public.configuracion c where c.clave = 'semaforo_tickets'), 50)
$$;

-- ---------------------------------------------------------------------------------------------
-- Cola de correos salientes. La llenan SOLO los triggers. Todavia no hay envio real (Resend sin
-- conectar): el modulo `notificaciones` la leera mas adelante y marcara cada fila.
-- ---------------------------------------------------------------------------------------------
create table public.outbox_correos (
  id                  bigint generated always as identity primary key,
  empresa_id          uuid references public.empresas (id),
  tipo                text not null check (tipo ~ '^[a-z][a-z0-9_]{2,59}$'),
  destinatario_user_id uuid references public.perfiles (user_id),
  destinatario_correo text not null check (destinatario_correo = lower(destinatario_correo)
                          and char_length(destinatario_correo) <= 254
                          and destinatario_correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Solo identificadores y datos cortos para armar el texto; nunca claves ni contenido de adjuntos.
  datos               jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 8192),
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'fallo', 'omitido')),
  intentos            smallint not null default 0 check (intentos >= 0),
  clave_unica         text check (clave_unica is null or char_length(clave_unica) <= 200),
  programado_para     timestamptz not null default now(),
  enviado_en          timestamptz,
  ultimo_error        text check (ultimo_error is null or char_length(ultimo_error) <= 500),
  creado_en           timestamptz not null default now(),
  constraint outbox_enviado_coherente check ((estado = 'enviado') = (enviado_en is not null))
);
create unique index outbox_correos_clave_unica on public.outbox_correos (clave_unica) where clave_unica is not null;
create index outbox_correos_pendientes_idx on public.outbox_correos (programado_para) where estado = 'pendiente';
create index outbox_correos_empresa_idx on public.outbox_correos (empresa_id, creado_en desc);

create trigger outbox_correos_empresa_fija before update on public.outbox_correos
  for each row execute function private.empresa_id_inmutable();
create trigger outbox_correos_campos_fijos before update on public.outbox_correos
  for each row execute function private.campos_inmutables('id', 'tipo', 'destinatario_user_id', 'destinatario_correo', 'datos', 'clave_unica', 'creado_en');

-- Encola un correo para UNA persona. No encola si el perfil esta bloqueado o si es cliente que ya no
-- tiene acceso activo a la empresa. La clave unica evita dobles avisos si algo corre dos veces.
create function private.encolar_correo(p_empresa uuid, p_tipo text, p_user uuid, p_datos jsonb, p_clave text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_correo text;
begin
  select p.correo into v_correo from public.perfiles p where p.user_id = p_user and not p.bloqueado;
  if v_correo is null then return; end if;
  if not exists (select 1 from public.super_admins s where s.user_id = p_user)
     and not exists (select 1 from public.miembros m
                      where m.user_id = p_user and m.empresa_id = p_empresa
                        and m.quitado_en is null and not m.bloqueado) then
    return;
  end if;
  insert into public.outbox_correos (empresa_id, tipo, destinatario_user_id, destinatario_correo, datos, clave_unica)
  values (p_empresa, p_tipo, p_user, v_correo, coalesce(p_datos, '{}'::jsonb), p_clave)
  on conflict (clave_unica) where clave_unica is not null do nothing;
end $$;

create function private.encolar_a_super_admins(p_empresa uuid, p_tipo text, p_datos jsonb, p_clave text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select s.user_id from public.super_admins s join public.perfiles p on p.user_id = s.user_id where not p.bloqueado loop
    perform private.encolar_correo(p_empresa, p_tipo, r.user_id, p_datos, p_clave || ':' || r.user_id::text);
  end loop;
end $$;

create function private.encolar_a_admins_cliente(p_empresa uuid, p_tipo text, p_datos jsonb, p_clave text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select m.user_id from public.miembros m
            where m.empresa_id = p_empresa and m.rol = 'admin_cliente' and m.quitado_en is null and not m.bloqueado loop
    perform private.encolar_correo(p_empresa, p_tipo, r.user_id, p_datos, p_clave || ':' || r.user_id::text);
  end loop;
end $$;

revoke all on function
  private.hoy(), private.proximo_inicio_habil(timestamp, int[], time, time),
  private.sumar_minutos_habiles(timestamptz, numeric, int[], time, time, text),
  private.minutos_habiles_entre(timestamptz, timestamptz, int[], time, time, text),
  private.semaforo_umbral_amarillo(),
  private.encolar_correo(uuid, text, uuid, jsonb, text),
  private.encolar_a_super_admins(uuid, text, jsonb, text),
  private.encolar_a_admins_cliente(uuid, text, jsonb, text)
  from public, anon, authenticated, service_role;
