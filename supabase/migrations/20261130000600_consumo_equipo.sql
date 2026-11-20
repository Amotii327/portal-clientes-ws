-- Sprint 2 · Solicitud de cambio 4: "Consumo del equipo" por proyecto. Tablas INTERNAS: solo el super
-- admin (con 2FA) las lee y las escribe. El cliente y su equipo nunca las ven (RLS: sin politica para ellos).
-- Los porcentajes son "% de una semana" de capacidad del equipo. Equipo Websourcing · Desarrollo

create table public.consumo_equipo_proyecto (
  proyecto_id    uuid primary key,
  empresa_id     uuid not null,
  -- % estimado de la semana al iniciar el proyecto
  estimado_inicial_pct numeric(7,2) check (estimado_inicial_pct is null or estimado_inicial_pct between 0 and 10000),
  -- Tope del proyecto, en % de semanas (150 = una semana y media)
  tope_pct       numeric(7,2) check (tope_pct is null or tope_pct between 0 and 10000),
  -- Cuando se avisó que el consumo real llegó al 80 % del tope (queda tambien en el registro)
  aviso_80_en    timestamptz,
  actualizado_en timestamptz not null default now(),
  constraint consumo_proyecto_fk foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id)
);

create table public.consumo_equipo_sprint (
  sprint_id      uuid primary key,
  empresa_id     uuid not null,
  proyecto_id    uuid not null,
  estimado_pct   numeric(7,2) check (estimado_pct is null or estimado_pct between 0 and 10000),
  -- % real anotado a mano
  real_pct       numeric(7,2) check (real_pct is null or real_pct between 0 and 10000),
  actualizado_en timestamptz not null default now(),
  -- Si el sprint se quita del plan, su consumo se va con el.
  constraint consumo_sprint_fk foreign key (empresa_id, sprint_id) references public.sprints (empresa_id, id) on delete cascade,
  constraint consumo_sprint_proyecto_fk foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id)
);
create index consumo_equipo_sprint_proyecto_idx on public.consumo_equipo_sprint (proyecto_id);

create trigger consumo_proyecto_actualizado before update on public.consumo_equipo_proyecto for each row execute function private.poner_actualizado_en();
create trigger consumo_sprint_actualizado before update on public.consumo_equipo_sprint for each row execute function private.poner_actualizado_en();
create trigger consumo_proyecto_empresa_fija before update on public.consumo_equipo_proyecto for each row execute function private.empresa_id_inmutable();
create trigger consumo_sprint_empresa_fija before update on public.consumo_equipo_sprint for each row execute function private.empresa_id_inmutable();
create trigger consumo_proyecto_campos_fijos before update on public.consumo_equipo_proyecto for each row execute function private.campos_inmutables('proyecto_id');
create trigger consumo_sprint_campos_fijos before update on public.consumo_equipo_sprint for each row execute function private.campos_inmutables('sprint_id', 'proyecto_id');
create trigger consumo_proyecto_ver_como before insert or update or delete or truncate on public.consumo_equipo_proyecto
  for each statement execute function private.bloquear_escritura_ver_como();
create trigger consumo_sprint_ver_como before insert or update or delete or truncate on public.consumo_equipo_sprint
  for each statement execute function private.bloquear_escritura_ver_como();

-- RLS: UNA sola politica, solo super admin (2FA, sin "ver como"). Cliente y equipo: ninguna fila.
alter table public.consumo_equipo_proyecto enable row level security;
alter table public.consumo_equipo_sprint enable row level security;
grant select on public.consumo_equipo_proyecto, public.consumo_equipo_sprint to authenticated;
create policy consumo_proyecto_leer on public.consumo_equipo_proyecto for select to authenticated
  using ((select private.es_super_admin()));
create policy consumo_sprint_leer on public.consumo_equipo_sprint for select to authenticated
  using ((select private.es_super_admin()));

-- Registro de cambios (solo lo lee el super admin). No se escribe nada en el historial del cliente.
create function private.trg_registro_consumo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.registrar(new.empresa_id, 'consumo_equipo_editado', tg_table_name::text,
    coalesce(to_jsonb(new) ->> 'sprint_id', to_jsonb(new) ->> 'proyecto_id'),
    jsonb_build_object('proyecto_id', new.proyecto_id, 'datos', to_jsonb(new) - 'actualizado_en' - 'empresa_id'));
  return null;
end $$;
revoke all on function private.trg_registro_consumo() from public, anon, authenticated, service_role;
create trigger consumo_proyecto_registro after insert or update on public.consumo_equipo_proyecto
  for each row execute function private.trg_registro_consumo();
create trigger consumo_sprint_registro after insert or update on public.consumo_equipo_sprint
  for each row execute function private.trg_registro_consumo();

-- Aviso al llegar al 80 % del tope (sobre el % real anotado). Se avisa una vez; si se sube el tope y
-- baja del 80 %, se rearma.
create function private.revisar_aviso_consumo(p_proyecto uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.consumo_equipo_proyecto; v_real numeric;
begin
  select * into c from public.consumo_equipo_proyecto where proyecto_id = p_proyecto for update;
  if not found or c.tope_pct is null or c.tope_pct = 0 then return; end if;
  select coalesce(sum(real_pct), 0) into v_real from public.consumo_equipo_sprint where proyecto_id = p_proyecto;
  if v_real >= 0.8 * c.tope_pct then
    if c.aviso_80_en is null then
      update public.consumo_equipo_proyecto set aviso_80_en = now() where proyecto_id = p_proyecto;
      perform private.registrar(c.empresa_id, 'consumo_equipo_aviso_80', 'consumo_equipo_proyecto', p_proyecto::text,
        jsonb_build_object('proyecto_id', p_proyecto, 'real_total_pct', v_real, 'tope_pct', c.tope_pct));
    end if;
  elsif c.aviso_80_en is not null then
    update public.consumo_equipo_proyecto set aviso_80_en = null where proyecto_id = p_proyecto;
  end if;
end $$;
revoke all on function private.revisar_aviso_consumo(uuid) from public, anon, authenticated, service_role;

-- Escritura (solo super admin con 2FA). Lo nulo no cambia.
create function public.fijar_consumo_proyecto(
  p_proyecto_id uuid, p_estimado_inicial_pct numeric default null, p_tope_pct numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.proyectos;
begin
  perform private.exigir_super_admin();
  p := private.proyecto_para_cambio(p_proyecto_id);
  if coalesce(p_estimado_inicial_pct, 0) not between 0 and 10000 or coalesce(p_tope_pct, 0) not between 0 and 10000 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  insert into public.consumo_equipo_proyecto (proyecto_id, empresa_id, estimado_inicial_pct, tope_pct)
  values (p.id, p.empresa_id, p_estimado_inicial_pct, p_tope_pct)
  on conflict (proyecto_id) do update
    set estimado_inicial_pct = coalesce(excluded.estimado_inicial_pct, public.consumo_equipo_proyecto.estimado_inicial_pct),
        tope_pct = coalesce(excluded.tope_pct, public.consumo_equipo_proyecto.tope_pct);
  perform private.revisar_aviso_consumo(p.id);
  return public.consumo_equipo(p.id);
end $$;

create function public.anotar_consumo_sprint(
  p_sprint_id uuid, p_estimado_pct numeric default null, p_real_pct numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.sprints;
begin
  perform private.exigir_super_admin();
  select * into s from public.sprints where id = p_sprint_id;
  if not found then raise exception 'sprint_no_encontrado' using errcode = 'P0001'; end if;
  perform private.proyecto_para_cambio(s.proyecto_id);
  if coalesce(p_estimado_pct, 0) not between 0 and 10000 or coalesce(p_real_pct, 0) not between 0 and 10000 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  insert into public.consumo_equipo_sprint (sprint_id, empresa_id, proyecto_id, estimado_pct, real_pct)
  values (s.id, s.empresa_id, s.proyecto_id, p_estimado_pct, p_real_pct)
  on conflict (sprint_id) do update
    set estimado_pct = coalesce(excluded.estimado_pct, public.consumo_equipo_sprint.estimado_pct),
        real_pct = coalesce(excluded.real_pct, public.consumo_equipo_sprint.real_pct);
  perform private.revisar_aviso_consumo(s.proyecto_id);
  return public.consumo_equipo(s.proyecto_id);
end $$;

-- Lectura (SECURITY INVOKER: usa la misma RLS; ademas exige super admin).
create function public.consumo_equipo(p_proyecto_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare c public.consumo_equipo_proyecto; v_real numeric; v_est numeric;
begin
  if not private.es_super_admin() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.proyectos where id = p_proyecto_id) then
    raise exception 'proyecto_no_encontrado' using errcode = 'P0001';
  end if;
  select * into c from public.consumo_equipo_proyecto where proyecto_id = p_proyecto_id;
  select coalesce(sum(real_pct), 0), coalesce(sum(estimado_pct), 0) into v_real, v_est
    from public.consumo_equipo_sprint where proyecto_id = p_proyecto_id;
  return jsonb_build_object(
    'estimado_inicial_pct', c.estimado_inicial_pct, 'tope_pct', c.tope_pct,
    'estimado_sprints_pct', v_est, 'real_total_pct', v_real,
    'porcentaje_del_tope', case when c.tope_pct > 0 then round(100 * v_real / c.tope_pct, 1) end,
    'aviso_80_en', c.aviso_80_en,
    'sprints', (select coalesce(jsonb_agg(jsonb_build_object('sprint_id', s.id, 'numero', s.numero, 'nombre', s.nombre,
                  'estimado_pct', k.estimado_pct, 'real_pct', k.real_pct) order by s.numero), '[]'::jsonb)
                  from public.sprints s left join public.consumo_equipo_sprint k on k.sprint_id = s.id
                 where s.proyecto_id = p_proyecto_id));
end $$;

revoke all on function public.fijar_consumo_proyecto(uuid, numeric, numeric), public.anotar_consumo_sprint(uuid, numeric, numeric),
  public.consumo_equipo(uuid) from public, anon, authenticated, service_role;
grant execute on function public.fijar_consumo_proyecto(uuid, numeric, numeric), public.anotar_consumo_sprint(uuid, numeric, numeric),
  public.consumo_equipo(uuid) to authenticated;
grant execute on function private.es_super_admin() to authenticated;
