-- Rollback de la integracion · panel e inicio: vuelven las versiones del sprint 4 (dinero; tickets_abiertos en null).
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
      -- Dinero (sprint 4): cuotas vencidas (sin pagar ni en revision) de empresas activas. tickets: null hasta el sprint 5.
      'pagos_vencidos', (select count(*) from public.v_pagos_programados v join public.empresas e on e.id = v.empresa_id
                          where v.estado = 'vencido' and e.estado = 'activa'),
      'comprobantes_en_revision', (select count(*) from public.comprobantes_pago k join public.empresas e on e.id = k.empresa_id
                                    where k.estado = 'en_revision' and e.estado = 'activa'),
      'tickets_abiertos', null),
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
        select jsonb_build_object('tipo', 'pago_vencido', 'prioridad', '1', 'empresa_id', v.empresa_id, 'empresa_nombre', e.nombre,
                 'proyecto_id', v.proyecto_id, 'proyecto_nombre', p.nombre, 'pago_id', v.pago_id, 'concepto', v.concepto,
                 'pendiente', v.pendiente, 'moneda', v.moneda, 'vence_el', v.vence_el, 'dias_de_atraso', private.hoy() - v.vence_el)
          from public.v_pagos_programados v join public.empresas e on e.id = v.empresa_id join public.proyectos p on p.id = v.proyecto_id
         where v.estado = 'vencido' and e.estado = 'activa'
        union all
        select jsonb_build_object('tipo', 'comprobante_en_revision', 'prioridad', '2', 'empresa_id', k.empresa_id, 'empresa_nombre', e.nombre,
                 'proyecto_id', c.proyecto_id, 'comprobante_id', k.id, 'concepto', pp.concepto, 'valor', k.valor_declarado,
                 'moneda', c.moneda, 'subido_en', k.creado_en)
          from public.comprobantes_pago k join public.empresas e on e.id = k.empresa_id
          join public.contratos c on c.id = k.contrato_id join public.pagos_programados pp on pp.id = k.pago_programado_id
         where k.estado = 'en_revision' and e.estado = 'activa'
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
    -- Dinero (sprint 4): solo con "ver dinero" (o admin). Sin ese permiso las dos llaves vienen en null: no se pintan.
    'pagos_vencidos', case when private.mi_ver_dinero()
                        then (select count(*) from public.v_pagos_programados v where v.empresa_id = v_emp and v.estado = 'vencido') end,
    'proximo_pago', case when private.mi_ver_dinero()
                      then (select jsonb_build_object('pago_id', v.pago_id, 'proyecto_id', v.proyecto_id, 'concepto', v.concepto,
                                    'pendiente', v.pendiente, 'moneda', v.moneda, 'vence_el', v.vence_el, 'estado', v.estado)
                              from public.v_pagos_programados v
                             where v.empresa_id = v_emp and v.estado in ('vencido', 'por_vencer', 'pendiente', 'en_revision')
                             order by v.vence_el, v.concepto limit 1) end,
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

