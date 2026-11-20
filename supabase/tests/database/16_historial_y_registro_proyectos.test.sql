-- Registro de actividad (completo, solo super admin) e historial del proyecto (apto para el cliente).
begin;
select plan(37);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql

select set_config('request.headers', '{"x-forwarded-for": "198.51.100.77"}', true) is not null as _ \gset
select tests.crear_proyectos();
select tests.como(tests.id('sa'), 'aal2');
select public.editar_hito(tests.hito('Portal A', 1), p_estado => 'terminado');
select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-04');
select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-11', p_lado => 'cliente', p_motivo => 'Falta el material de marca', p_que_falta => 'Logo en vectores');
-- Hito 13 oculto: sus eventos no son para el cliente.
select public.editar_hito(tests.hito('Portal A', 13), p_estado => 'en_curso');
select public.agregar_sprint(tests.proy('Portal A'), 'Sprint 1', '2026-11-30', '2026-12-04', '2026-12-04');
select public.aprobar_plan_sprints(tests.proy('Portal A'));
select public.editar_sprint(tests.sprint('Portal A', 1), p_estado => 'en_curso');
select public.editar_sprint(tests.sprint('Portal A', 1), p_fecha_fin => '2026-12-05', p_motivo => 'Se amplia un dia');
select public.agregar_sprint(tests.proy('Portal A'), 'Sprint 2', '2026-12-07', '2026-12-11', null, '{}', 'Pedido del cliente');
select public.quitar_sprint(tests.sprint('Portal A', 2), 'Ya no se necesita');
select tests.admin();

-- ---------- Registro de actividad (todo, con autor e IP) ----------
select is((select count(*)::int from public.registro_actividad where accion = 'proyecto_creado' and actor_id = tests.id('sa') and empresa_id = tests.id('empresa_a')), 1, 'registro: proyecto creado, con autor y empresa');
select is((select host(ip) from public.registro_actividad where accion = 'proyecto_creado' and empresa_id = tests.id('empresa_a')), '198.51.100.77', 'registro: guarda la IP del proxy');
select is((select count(*)::int from public.registro_actividad where accion = 'hito_estado_cambiado' and detalle ->> 'numero' = '1' and detalle ->> 'despues' = 'terminado'), 1, 'registro: cambio de estado de hito');
select is((select count(*)::int from public.registro_actividad where accion = 'hito_fecha_cambiada' and detalle ->> 'numero' = '2'), 2, 'registro: cada cambio de fecha de hito (fijar y mover)');
select is((select detalle ->> 'motivo' from public.registro_actividad where accion = 'retraso_registrado'), 'Falta el material de marca', 'registro: el retraso guarda su motivo');
select is((select detalle ->> 'lado' from public.registro_actividad where accion = 'retraso_registrado'), 'cliente', 'registro: el retraso guarda su lado');
select is((select count(*)::int from public.registro_actividad where accion = 'plan_sprints_aprobado'), 1, 'registro: plan aprobado');
select is((select count(*)::int from public.registro_actividad where accion = 'sprint_estado_cambiado' and detalle ->> 'despues' = 'en_curso'), 1, 'registro: sprint en curso');
select is((select count(*)::int from public.registro_actividad where accion = 'sprint_fechas_cambiadas'), 1, 'registro: cambio de fechas de sprint');
select is((select count(*)::int from public.registro_actividad where accion = 'sprint_quitado' and detalle ->> 'nombre' = 'Sprint 2'), 1, 'registro: sprint quitado (la fila ya no existe pero queda el rastro)');
select is((select count(*)::int from public.registro_actividad where accion = 'plan_sprints_modificado'), 3, 'registro: cada cambio al plan aprobado con motivo');
select is((select count(*)::int from public.registro_actividad
             where (accion like 'proyecto\_%' or accion like 'hito\_%' or accion like 'sprint\_%' or accion like 'retraso\_%'
                    or accion like 'plan\_sprints%' or accion = 'pago_hito_cambiado') and not detalle ? 'proyecto_id'), 0, 'registro: todo evento de proyecto trae proyecto_id para filtrar');
select is((select count(*)::int from public.registro_actividad where accion = 'pago_hito_cambiado'), 8, 'registro: los pagos asociados de los dos proyectos al crearse');

-- ---------- Quien lee el registro ----------
select tests.como(tests.id('sa'), 'aal2');
select ok((select count(*) from public.registro_actividad where accion like 'hito%') > 0, 'super admin: lee el registro');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.registro_actividad), 0, 'admin A: no lee el registro de actividad (tiene IP y acciones internas)');

-- ---------- Historial para el cliente ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.historial_proyecto where proyecto_id = tests.proy('Portal A')), (select count(*)::int from public.historial_proyecto), 'admin A: todo su historial es de su proyecto');
select is((select string_agg(distinct tipo, ',' order by tipo) from public.historial_proyecto),
  'hito_estado_cambiado,hito_fecha_fijada,plan_sprints_aprobado,plan_sprints_modificado,proyecto_creado,retraso_registrado,sprint_estado_cambiado', 'admin A: ve los tipos de evento esperados');
select is((select string_agg(detalle ->> 'numero', ',' order by detalle ->> 'numero') from public.historial_proyecto where tipo = 'hito_estado_cambiado'), '1,6', 'admin A: ve el cambio del hito 1 y del 6, no el del hito 13 oculto');
select is((select detalle ->> 'motivo' from public.historial_proyecto where tipo = 'retraso_registrado'), 'Falta el material de marca', 'admin A: ve el motivo del retraso');
select is((select detalle ->> 'que_falta' from public.historial_proyecto where tipo = 'retraso_registrado'), 'Logo en vectores', 'admin A: ve que falta del lado del cliente');
select is((select count(*)::int from public.historial_proyecto where tipo = 'plan_sprints_modificado'), 3, 'admin A: ve los 3 cambios del plan con su motivo');
select is((select count(*)::int from public.historial_proyecto where tipo = 'sprint_estado_cambiado'), 1, 'admin A: ve el sprint en curso; aprobar el plan no genera un evento por sprint');
select is((select string_agg(distinct actor_tipo, ',') from public.historial_proyecto), 'equipo_websourcing', 'admin A: las acciones salen como "Equipo Websourcing", sin nombres');
select hasnt_column('public', 'historial_proyecto', 'ip', 'el historial no tiene IP');
select hasnt_column('public', 'historial_proyecto', 'actor_id', 'el historial no guarda quien lo hizo (no hay personas)');
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.historial_proyecto), 10, 'equipo A: ve el mismo historial que el admin');
select tests.como(tests.id('admin_b'), 'aal2');
select is((select count(*)::int from public.historial_proyecto where proyecto_id = tests.proy('Portal A')), 0, 'admin B: no ve el historial de A');
select is((select count(*)::int from public.historial_proyecto), 1, 'admin B: solo ve el suyo (la creacion de su proyecto)');
select tests.como(tests.id('quitado_a'));
select is((select count(*)::int from public.historial_proyecto), 0, 'usuario quitado: sin historial');
select tests.anonimo();
select throws_ok($$select count(*) from public.historial_proyecto$$, '42501', null, 'visitante: sin permiso sobre el historial');

-- El super admin ve todo, incluido lo oculto, marcado como no visible.
select tests.como(tests.id('sa'), 'aal2');
select ok((select count(*) from public.historial_proyecto where not visible_cliente) >= 1, 'super admin: ve tambien los eventos ocultos al cliente');
select is((select count(*)::int from public.historial_proyecto where tipo = 'hito_estado_cambiado' and not visible_cliente), 1, 'el evento del hito 13 quedo marcado como no visible');

-- El hito 13 se activa: lo anterior sigue oculto, lo nuevo es visible.
select public.editar_hito(tests.hito('Portal A', 13), p_visible => true);
select public.editar_hito(tests.hito('Portal A', 13), p_estado => 'terminado');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.historial_proyecto where tipo = 'hito_estado_cambiado'), 3, 'admin A: activado el mantenimiento ve lo nuevo, no lo que paso antes');

-- Solo se agrega
select tests.admin();
select throws_ok($$update public.historial_proyecto set tipo = 'borrado'$$, '42501', null, 'el historial no se edita (ni el superusuario)');
select throws_ok($$delete from public.historial_proyecto$$, '42501', null, 'el historial no se borra');
select throws_ok($$delete from public.cambios_plan$$, '42501', null, 'los cambios del plan no se borran');
select throws_ok($$delete from public.retrasos$$, '42501', null, 'los retrasos no se borran');

select * from finish();
rollback;
