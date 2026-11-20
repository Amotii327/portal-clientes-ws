-- Rollback del sprint 4 · panel e inicio. Restaura panel_super_admin() e inicio_cliente() tal como los dejo el sprint 2
-- (pagos_vencidos en null, sin datos de dinero).
-- Panel del super admin: todas las empresas.
create or replace function public.panel_super_admin() returns jsonb
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
create or replace function public.inicio_cliente() returns jsonb
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

