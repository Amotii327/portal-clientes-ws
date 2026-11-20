-- Sprint 2 · Logica en la base: fecha de hoy (Colombia), avance (D-013), estado derivado del hito 6,
-- avisos de cruce de fechas y la cerradura de solo lectura del modo "ver como".
-- Todas SECURITY DEFINER con search_path vacio. Equipo Websourcing · Desarrollo

-- Hoy, en hora de Colombia (los atrasos se cuentan con esta fecha).
create function private.hoy() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- Avance del proyecto (D-013, arquitectura seccion 3):
--   * Los hitos 1-5 y 7-12 valen lo mismo cada uno (11 partes).
--   * El hito 6 vale lo que sumen sus sprints (cada sprint, una parte). Con 3 sprints: 14 partes.
--   * El hito 13 (mantenimiento) no cuenta nunca.
--   * Los sprints solo cuentan cuando el plan esta aprobado; mientras sea propuesta el hito 6 es UNA parte.
create function private.calcular_avance(p_proyecto uuid, p_plan_aprobado boolean, out hechas int, out total int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hitos int;
  v_h6 int;
  v_n int;
  v_s int;
begin
  select count(*) filter (where numero not in (6, 13) and estado = 'terminado'),
         count(*) filter (where numero = 6 and estado = 'terminado')
    into v_hitos, v_h6
    from public.hitos where proyecto_id = p_proyecto;
  select count(*), count(*) filter (where estado = 'terminado') into v_n, v_s
    from public.sprints where proyecto_id = p_proyecto;
  if p_plan_aprobado and v_n > 0 then
    total := 11 + v_n; hechas := v_hitos + v_s;
  else
    total := 12; hechas := v_hitos + v_h6;
  end if;
end $$;

create function private.trg_proyecto_avance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from private.calcular_avance(new.id, new.plan_estado = 'aprobado');
  new.avance_partes_hechas := r.hechas;
  new.avance_partes_total := r.total;
  new.avance_pct := round(100.0 * r.hechas / r.total, 2);
  return new;
end $$;
create trigger proyectos_avance before insert or update on public.proyectos
  for each row execute function private.trg_proyecto_avance();

-- "Tocar" el proyecto fuerza el recalculo del avance (el trigger anterior lo hace en cada UPDATE).
create function private.tocar_proyecto(p_proyecto uuid) returns void
language sql security definer set search_path = '' as $$
  update public.proyectos set avance_pct = avance_pct where id = p_proyecto
$$;

-- El hito 6 no se edita a mano: su estado sale de sus sprints.
create function private.recalcular_hito_sprints(p_proyecto uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_aprobado boolean;
  v_n int; v_term int; v_rev int; v_activos int;
  v_estado text;
begin
  select (plan_estado = 'aprobado') into v_aprobado from public.proyectos where id = p_proyecto;
  if v_aprobado is null then return; end if;
  select count(*), count(*) filter (where estado = 'terminado'), count(*) filter (where estado = 'en_revision'),
         count(*) filter (where estado in ('en_curso', 'en_revision', 'terminado'))
    into v_n, v_term, v_rev, v_activos
    from public.sprints where proyecto_id = p_proyecto;
  v_estado := case
    when not v_aprobado or v_n = 0 then 'pendiente'
    when v_term = v_n then 'terminado'
    when v_rev > 0 then 'esperando_aprobacion'
    when v_activos > 0 then 'en_curso'
    else 'pendiente' end;
  update public.hitos
     set estado = v_estado,
         fecha_real = case when v_estado = 'terminado' then coalesce(fecha_real, private.hoy()) else null end
   where proyecto_id = p_proyecto and numero = 6
     and (estado is distinct from v_estado or (v_estado = 'terminado') <> (fecha_real is not null));
end $$;

create function private.trg_sprints_derivados() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_proyecto uuid := coalesce(new.proyecto_id, old.proyecto_id);
begin
  perform private.recalcular_hito_sprints(v_proyecto);
  perform private.tocar_proyecto(v_proyecto);
  return null;
end $$;
create trigger sprints_derivados after insert or update or delete on public.sprints
  for each row execute function private.trg_sprints_derivados();

create function private.trg_hitos_tocar_proyecto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.tocar_proyecto(new.proyecto_id);
  return null;
end $$;
create trigger hitos_tocar_proyecto after insert or update of estado on public.hitos
  for each row execute function private.trg_hitos_tocar_proyecto();

-- Avisos del plan: dos sprints cuyas fechas se cruzan. Solo avisa, no bloquea.
create function private.avisos_plan(p_proyecto uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tipo', 'cruce_de_fechas', 'sprints', jsonb_build_array(a.numero, b.numero))
                            order by a.numero, b.numero), '[]'::jsonb)
    from public.sprints a
    join public.sprints b on b.proyecto_id = a.proyecto_id and a.numero < b.numero
                          and a.fecha_inicio <= b.fecha_fin and b.fecha_inicio <= a.fecha_fin
   where a.proyecto_id = p_proyecto
$$;

-- ---------- Modo "ver como": cerradura de solo lectura ----------
-- true si el usuario tiene una sesion "ver como" abierta y vigente.
create function private.ver_como_activa_de(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1 from public.sesiones_ver_como s
     where s.user_id = p_user and s.terminada_en is null and s.vence_en > now())
$$;

-- Trigger de sentencia que se pone en TODA tabla de public (salvo las tres excepciones): mientras
-- el super admin esta "viendo como el cliente", ninguna escritura pasa, ni por politica ni por funcion.
create function private.bloquear_escritura_ver_como() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.ver_como_activa_de(auth.uid()) then
    raise exception 'ver_como_solo_lectura' using errcode = '42501';
  end if;
  return null;
end $$;

revoke all on function
  private.hoy(), private.calcular_avance(uuid, boolean), private.trg_proyecto_avance(), private.tocar_proyecto(uuid),
  private.recalcular_hito_sprints(uuid), private.trg_sprints_derivados(), private.trg_hitos_tocar_proyecto(),
  private.avisos_plan(uuid), private.ver_como_activa_de(uuid), private.bloquear_escritura_ver_como()
  from public, anon, authenticated, service_role;
grant execute on function private.hoy() to authenticated;
