-- Separacion por empresa y por rol en proyectos, hitos, sprints, retrasos, plan y pago asociado.
-- Ningun usuario de la empresa A ve datos de la B, ni por consulta, ni por funcion, ni por llave directa.
begin;
select plan(65);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
select tests.crear_proyectos();

-- Datos de prueba: un retraso visible, otro del hito 13 (oculto), plan aprobado en A y borrador en B.
select tests.como(tests.id('sa'), 'aal2');
select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-04');
select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-11', p_lado => 'websourcing', p_motivo => 'Cambio de alcance');
select public.editar_hito(tests.hito('Portal A', 13), p_fecha_planeada => '2027-02-01');
select public.editar_hito(tests.hito('Portal A', 13), p_fecha_planeada => '2027-03-01', p_lado => 'websourcing', p_motivo => 'Fecha del mantenimiento');
select public.cargar_plan_sprints(tests.proy('Portal A'), '[{"nombre": "Sprint A1", "fecha_inicio": "2026-11-30", "fecha_fin": "2026-12-04"}, {"nombre": "Sprint A2", "fecha_inicio": "2026-12-07", "fecha_fin": "2026-12-11"}]'::jsonb);
select public.aprobar_plan_sprints(tests.proy('Portal A'));
select public.cargar_plan_sprints(tests.proy('Portal B'), '[{"nombre": "Sprint B1", "fecha_inicio": "2026-11-30", "fecha_fin": "2026-12-04"}]'::jsonb);
select public.aprobar_plan_sprints(tests.proy('Portal B'));
select public.editar_hito(tests.hito('Portal B', 2), p_fecha_planeada => '2026-12-04');
select public.editar_hito(tests.hito('Portal B', 2), p_fecha_planeada => '2026-12-18', p_lado => 'cliente', p_motivo => 'Falta el contrato firmado', p_que_falta => 'Contrato firmado');
select tests.admin();
insert into public.proyectos (empresa_id, nombre) values (tests.id('empresa_c'), 'Portal C');

-- ---------- Super admin ----------
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.proyectos), 3, 'super admin (2FA): ve los proyectos de todas las empresas');
select is((select count(*)::int from public.hitos where proyecto_id in (tests.proy('Portal A'), tests.proy('Portal B'))), 26, 'super admin: ve los 13 hitos de cada proyecto, incluido el oculto');
select is((select count(*)::int from public.hitos_pago_asociado), 8, 'super admin: ve todos los pagos asociados');
select tests.como(tests.id('sa'), 'aal1');
select is((select count(*)::int from public.proyectos), 0, 'super admin SIN 2FA: no ve proyectos');
select is((select count(*)::int from public.hitos) + (select count(*)::int from public.sprints) + (select count(*)::int from public.retrasos), 0, 'super admin SIN 2FA: no ve hitos, sprints ni retrasos');
select throws_ok($$select public.crear_proyecto(tests.id('empresa_a'), 'Sin dos factores')$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no crea proyectos');
select throws_ok($$select public.panel_super_admin()$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no abre el panel');

-- ---------- Admin de A ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((select string_agg(nombre, ',') from public.proyectos), 'Portal A', 'admin A: ve solo su proyecto');
select is((select count(*)::int from public.proyectos where id = tests.proy('Portal B')), 0, 'admin A: no ve el proyecto de B ni por su id');
select is((select count(*)::int from public.hitos), 12, 'admin A: ve 12 hitos (el 13 esta oculto sin mantenimiento)');
select is((select count(*)::int from public.hitos where numero = 13), 0, 'admin A: el hito 13 no aparece');
select is((select count(*)::int from public.hitos where proyecto_id = tests.proy('Portal B')), 0, 'admin A: no ve hitos de B');
select is((select count(*)::int from public.hitos_pago_asociado), 3, 'admin A: ve el pago asociado de los hitos 1, 5 y 11 (el del 13 esta oculto)');
select is((select count(*)::int from public.sprints), 2, 'admin A: ve los sprints de su plan aprobado');
select is((select count(*)::int from public.sprints where nombre = 'Sprint B1'), 0, 'admin A: no ve los sprints de B');
select is((select count(*)::int from public.retrasos), 1, 'admin A: ve el retraso del hito visible y no el del hito oculto');
select is((select motivo from public.retrasos), 'Cambio de alcance', 'admin A: lee el motivo del retraso');
select is((select count(*)::int from public.sesiones_ver_como), 0, 'admin A: no ve las sesiones "ver como"');
select is((select count(*)::int from public.v_proyectos_resumen), 1, 'admin A: la vista de resumen trae solo su proyecto');
select throws_ok($$select public.linea_de_tiempo(tests.proy('Portal B'))$$, 'P0001', 'proyecto_no_encontrado', 'admin A: la linea de tiempo de B responde "no encontrado"');
select throws_ok($$select public.linea_de_tiempo(gen_random_uuid())$$, 'P0001', 'proyecto_no_encontrado', 'mismo mensaje para un id que no existe (no revela)');
select is(jsonb_array_length(public.linea_de_tiempo(tests.proy('Portal A')) -> 'hitos'), 12, 'admin A: la linea de tiempo trae 12 hitos');
select is((public.linea_de_tiempo(tests.proy('Portal A')) -> 'hitos' -> 0 ->> 'pago_asociado'), 'Anticipo', 'admin A: la linea de tiempo trae el pago asociado');
select is(jsonb_array_length(public.inicio_cliente() -> 'proyectos'), 1, 'admin A: inicio con su proyecto');
select throws_ok($$select public.panel_super_admin()$$, '42501', 'no_autorizado', 'admin A: no abre el panel del super admin');
select throws_ok($$select public.editar_hito(tests.hito('Portal B', 2), p_nombre => 'Hackeado')$$, '42501', 'no_autorizado', 'admin A: no edita hitos de B');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_nombre => 'Hackeado')$$, '42501', 'no_autorizado', 'admin A: no edita hitos de su propia empresa');

-- Escrituras directas: ninguna.
select throws_ok($$update public.proyectos set nombre = 'Hackeado'$$, '42501', null, 'admin A: no actualiza proyectos directo');
select throws_ok($$update public.hitos set estado = 'terminado'$$, '42501', null, 'admin A: no actualiza hitos directo');
select throws_ok($$update public.sprints set estado = 'terminado'$$, '42501', null, 'admin A: no actualiza sprints directo');
select throws_ok($$insert into public.proyectos (empresa_id, nombre) values (tests.id('empresa_a'), 'Otro proyecto')$$, '42501', null, 'admin A: no crea proyectos directo');
select throws_ok($$insert into public.retrasos (empresa_id, proyecto_id, hito_id, fecha_anterior, fecha_nueva, motivo, lado) values (tests.id('empresa_a'), tests.proy('Portal A'), tests.hito('Portal A', 2), '2026-12-11', '2026-12-30', 'Inventado', 'cliente')$$, '42501', null, 'admin A: no inventa retrasos');
select throws_ok($$delete from public.hitos$$, '42501', null, 'admin A: no borra hitos');

-- ---------- Equipo de A ----------
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.proyectos), 1, 'equipo A: ve el proyecto de su empresa');
select is((select count(*)::int from public.hitos), 12, 'equipo A: ve los hitos visibles');
select is((select count(*)::int from public.hitos_pago_asociado), 0, 'equipo A sin ver_dinero: no ve el pago asociado');
select is((public.linea_de_tiempo(tests.proy('Portal A')) -> 'hitos' -> 0 ->> 'pago_asociado'), null, 'equipo A sin ver_dinero: la linea de tiempo no trae el pago asociado');
select is((select count(*)::int from public.sprints), 2, 'equipo A: ve el plan aprobado');
select tests.como(tests.id('equipo_a2'));
select is((select count(*)::int from public.hitos_pago_asociado), 3, 'equipo A con ver_dinero: si ve el pago asociado');

-- ---------- Admin de B ----------
select tests.como(tests.id('admin_b'), 'aal2');
select is((select string_agg(nombre, ',') from public.proyectos), 'Portal B', 'admin B: ve solo su proyecto');
select is((select count(*)::int from public.sprints where nombre like 'Sprint A%'), 0, 'admin B: no ve los sprints de A');
select is((select count(*)::int from public.retrasos), 1, 'admin B: ve su retraso');
select is(jsonb_array_length(public.inicio_cliente() -> 'pendientes_del_cliente'), 1, 'admin B: el aviso "esperando al cliente" trae su pendiente');
select is((public.inicio_cliente() -> 'pendientes_del_cliente' -> 0 ->> 'que_falta'), 'Contrato firmado', 'admin B: el aviso dice que falta');
select tests.como(tests.id('admin_a'), 'aal2');
select is(jsonb_array_length(public.inicio_cliente() -> 'pendientes_del_cliente'), 0, 'admin A: no ve los pendientes de B');

-- ---------- Sin acceso: quitado, bloqueado, perfil bloqueado, empresa pausada, sin perfil, visitante ----------
select tests.como(tests.id('quitado_a'));
select is((select count(*)::int from public.proyectos) + (select count(*)::int from public.hitos) + (select count(*)::int from public.sprints), 0, 'usuario quitado: no ve nada');
select tests.como(tests.id('bloq_a'));
select is((select count(*)::int from public.proyectos) + (select count(*)::int from public.hitos), 0, 'miembro bloqueado: no ve nada');
select tests.como(tests.id('perfil_bloq'));
select is((select count(*)::int from public.proyectos) + (select count(*)::int from public.hitos), 0, 'perfil bloqueado: no ve nada');
select tests.como(tests.id('admin_c'), 'aal2');
select is((select count(*)::int from public.proyectos), 0, 'admin de empresa pausada: no ve ni su propio proyecto');
select throws_ok($$select public.inicio_cliente()$$, '42501', 'no_autorizado', 'empresa pausada: inicio_cliente da no_autorizado');
select tests.como(tests.id('sin_perfil'));
select is((select count(*)::int from public.proyectos), 0, 'usuario sin perfil: no ve nada');
select tests.anonimo();
select throws_ok($$select count(*) from public.proyectos$$, '42501', null, 'visitante: sin permiso sobre proyectos');
select throws_ok($$select count(*) from public.hitos$$, '42501', null, 'visitante: sin permiso sobre hitos');
select throws_ok($$select public.inicio_cliente()$$, '42501', null, 'visitante: no ejecuta inicio_cliente');

-- ---------- Integridad: llaves compuestas y empresa_id inmutable (aplican incluso al superusuario) ----------
select tests.admin();
select throws_ok($$insert into public.hitos (empresa_id, proyecto_id, numero, nombre) values (tests.id('empresa_a'), tests.proy('Portal C'), 1, 'Cruzado')$$, '23503', null, 'llave compuesta: un hito de la empresa A no cuelga de un proyecto de C');
select throws_ok($$insert into public.sprints (empresa_id, proyecto_id, numero, nombre, fecha_inicio, fecha_fin) values (tests.id('empresa_b'), tests.proy('Portal A'), 50, 'Cruzado', '2026-12-01', '2026-12-02')$$, '23503', null, 'llave compuesta: un sprint de B no cuelga de un proyecto de A');
select throws_ok($$insert into public.retrasos (empresa_id, proyecto_id, hito_id, fecha_anterior, fecha_nueva, motivo, lado) values (tests.id('empresa_b'), tests.proy('Portal B'), tests.hito('Portal A', 2), '2026-12-01', '2026-12-02', 'Cruzado', 'websourcing')$$, '23503', null, 'llave compuesta: un retraso de B no apunta a un hito de A');
select throws_ok($$insert into public.historial_proyecto (empresa_id, proyecto_id, tipo, actor_tipo) values (tests.id('empresa_b'), tests.proy('Portal A'), 'x', 'sistema')$$, '23503', null, 'llave compuesta: el historial de B no apunta a un proyecto de A');
select throws_ok($$update public.hitos set empresa_id = tests.id('empresa_b') where id = tests.hito('Portal A', 2)$$, '23514', 'empresa_id_inmutable', 'hitos.empresa_id es inmutable');
select throws_ok($$update public.proyectos set empresa_id = tests.id('empresa_b') where nombre = 'Portal A'$$, '23514', 'empresa_id_inmutable', 'proyectos.empresa_id es inmutable');
select throws_ok($$update public.sprints set empresa_id = tests.id('empresa_b') where nombre = 'Sprint A1'$$, '23514', 'empresa_id_inmutable', 'sprints.empresa_id es inmutable');
select throws_ok($$update public.hitos set numero = 5 where id = tests.hito('Portal A', 2)$$, '23514', null, 'el numero de un hito no cambia');
select throws_ok($$update public.hitos set proyecto_id = tests.proy('Portal B') where id = tests.hito('Portal A', 2)$$, '23514', null, 'un hito no cambia de proyecto');
select throws_ok($$insert into public.hitos (empresa_id, proyecto_id, numero, nombre, visible) values (tests.id('empresa_a'), tests.proy('Portal A'), 4, 'Duplicado', true)$$, '23505', null, 'no hay dos hitos con el mismo numero en un proyecto');
select throws_ok($$update public.hitos set visible = false where id = tests.hito('Portal A', 4)$$, '23514', null, 'solo el hito 13 puede quedar oculto (restriccion de la tabla)');

select * from finish();
rollback;
