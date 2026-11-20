-- Panel del super admin (todas las empresas) e inicio del cliente (sus proyectos).
begin;
select plan(30);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
select tests.crear_proyectos();

select tests.como(tests.id('sa'), 'aal2');
-- Portal A: plan aprobado con un sprint en curso y demo en 2 dias; un hito atrasado visible y otro oculto.
select public.agregar_sprint(tests.proy('Portal A'), 'Sprint actual', (now() at time zone 'America/Bogota')::date,
  (now() at time zone 'America/Bogota')::date + 3, (now() at time zone 'America/Bogota')::date + 2, array['Panel']);
select public.aprobar_plan_sprints(tests.proy('Portal A'));
select public.editar_sprint(tests.sprint('Portal A', 1), p_estado => 'en_curso');
select public.editar_hito(tests.hito('Portal A', 1), p_estado => 'terminado');
select public.editar_hito(tests.hito('Portal A', 2), p_estado => 'en_curso', p_fecha_planeada => '2020-01-01');
select public.editar_hito(tests.hito('Portal A', 13), p_fecha_planeada => '2020-02-02');
-- Portal B: plan solo propuesta.
select public.agregar_sprint(tests.proy('Portal B'), 'Borrador B', '2026-12-01', '2026-12-04', '2026-12-04');

-- ---------- Panel del super admin ----------
select is((public.panel_super_admin() -> 'totales' ->> 'empresas_activas')::int, 2, 'panel: 2 empresas activas');
select is((public.panel_super_admin() -> 'totales' ->> 'empresas_pausadas')::int, 1, 'panel: 1 empresa pausada');
select is((public.panel_super_admin() -> 'totales' ->> 'proyectos_activos')::int, 2, 'panel: 2 proyectos activos');
select is((public.panel_super_admin() -> 'totales' ->> 'hitos_atrasados')::int, 2, 'panel: cuenta los atrasos de todos los hitos (incluido el 13 oculto)');
select is((public.panel_super_admin() -> 'totales' ->> 'planes_por_aprobar')::int, 1, 'panel: 1 plan por aprobar (el borrador de B)');
select is((public.panel_super_admin() -> 'totales' ->> 'demos_proximas_7_dias')::int, 1, 'panel: 1 demo en los proximos 7 dias');
select is((public.panel_super_admin() -> 'totales') -> 'pagos_vencidos', 'null'::jsonb, 'panel: pagos vencidos viene nulo (modulo de dinero aun no existe)');
select is((public.panel_super_admin() -> 'totales') -> 'tickets_abiertos', 'null'::jsonb, 'panel: tickets abiertos viene nulo (modulo aun no existe)');
select is(jsonb_array_length(public.panel_super_admin() -> 'proyectos'), 2, 'panel: lista los proyectos de todas las empresas');
select is((select count(*)::int from jsonb_array_elements(public.panel_super_admin() -> 'atencion') a where a ->> 'tipo' = 'hito_atrasado'), 2, 'panel: "atencion" trae los hitos atrasados');
select is((select count(*)::int from jsonb_array_elements(public.panel_super_admin() -> 'atencion') a where a ->> 'tipo' = 'plan_por_aprobar'), 1, 'panel: "atencion" trae el plan por aprobar');
select is((select count(*)::int from jsonb_array_elements(public.panel_super_admin() -> 'atencion') a where a ->> 'tipo' = 'demo_proxima'), 1, 'panel: "atencion" trae la demo proxima');
select is((select a ->> 'dias_de_atraso' from jsonb_array_elements(public.panel_super_admin() -> 'atencion') a where a ->> 'hito_numero' = '2')::text,
  ((now() at time zone 'America/Bogota')::date - date '2020-01-01')::text, 'panel: dias de atraso contados con la fecha de Colombia');

-- Resumen por proyecto (vista) como super admin.
select is((select sprint_actual_numero::int from public.v_proyectos_resumen where nombre = 'Portal A'), 1, 'resumen: sprint actual de A');
select is((select hito_actual_numero::int from public.v_proyectos_resumen where nombre = 'Portal A'), 2, 'resumen: el hito actual es el que esta en curso');
select is((select proxima_demo from public.v_proyectos_resumen where nombre = 'Portal A'), (now() at time zone 'America/Bogota')::date + 2, 'resumen: fecha de la proxima demo');
select is((select sprint_actual_numero::int from public.v_proyectos_resumen where nombre = 'Portal B'), null, 'resumen: un plan en propuesta no tiene "sprint actual"');
select is((select proxima_demo from public.v_proyectos_resumen where nombre = 'Portal B'), null, 'resumen: un plan en propuesta no tiene proxima demo');

-- Cuando se termina el hito atrasado, deja de contar.
select public.editar_hito(tests.hito('Portal A', 2), p_estado => 'terminado');
select is((select hitos_atrasados from public.v_proyectos_resumen where nombre = 'Portal A'), 1, 'un hito terminado ya no cuenta como atrasado (queda el 13)');

-- ---------- Inicio del cliente ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((public.inicio_cliente() -> 'empresa' ->> 'nombre'), 'Empresa A', 'inicio cliente: la empresa es la suya');
select is((public.inicio_cliente() -> 'proyectos' -> 0 ->> 'avance_partes_total')::int, 12, 'inicio cliente: avance con 1 sprint = 12 partes (11 hitos + 1 sprint)');
select is((public.inicio_cliente() -> 'proyectos' -> 0 ->> 'hitos_atrasados')::int, 0, 'inicio cliente: no cuenta el atraso del hito oculto');
select is((public.inicio_cliente() -> 'proyectos' -> 0 ->> 'sprint_actual_numero')::int, 1, 'inicio cliente: ve el sprint actual (plan aprobado)');
select is((public.inicio_cliente() -> 'proyectos' -> 0 ->> 'proxima_demo')::date, (now() at time zone 'America/Bogota')::date + 2, 'inicio cliente: ve la fecha de la proxima demo');
select is(jsonb_array_length(public.inicio_cliente() -> 'proyectos'), 1, 'inicio cliente: solo sus proyectos');
select tests.como(tests.id('admin_b'), 'aal2');
select is((public.inicio_cliente() -> 'proyectos' -> 0 ->> 'plan_estado'), 'propuesta', 'inicio cliente B: el plan sigue en propuesta');
select is((public.inicio_cliente() -> 'proyectos' -> 0 -> 'sprint_actual_numero'), 'null'::jsonb, 'inicio cliente B: no ve sprint actual de un borrador');
select is((public.inicio_cliente() -> 'proyectos' -> 0 ->> 'avance_partes_total')::int, 12, 'inicio cliente B: el borrador no cambia el avance');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.inicio_cliente()$$, '42501', 'no_autorizado', 'el super admin (sin "ver como") no usa inicio_cliente: usa el panel');
select is((select count(*)::int from public.v_proyectos_resumen), 3 - 1, 'el super admin ve el resumen de los proyectos de todas las empresas');

select * from finish();
rollback;
