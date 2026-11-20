-- Consumo del equipo (solicitud de cambio 4): interno, solo el super admin con 2FA lee y escribe.
begin;
select plan(32);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
select tests.crear_proyectos();
select tests.como(tests.id('sa'), 'aal2');
select public.cargar_plan_sprints(tests.proy('Portal A'), '[{"nombre": "Sprint 1", "fecha_inicio": "2026-11-30", "fecha_fin": "2026-12-04"}, {"nombre": "Sprint 2", "fecha_inicio": "2026-12-07", "fecha_fin": "2026-12-11"}]'::jsonb);

-- ---------- Super admin escribe y lee ----------
select is((public.fijar_consumo_proyecto(tests.proy('Portal A'), 40, 150) ->> 'tope_pct')::numeric, 150::numeric, 'super admin: fija el estimado inicial y el tope');
select is((public.consumo_equipo(tests.proy('Portal A')) ->> 'estimado_inicial_pct')::numeric, 40::numeric, 'super admin: lee el estimado inicial');
select lives_ok($$select public.anotar_consumo_sprint(tests.sprint('Portal A', 1), 50, 30)$$, 'super admin: anota estimado y real del sprint 1');
select is((public.consumo_equipo(tests.proy('Portal A')) ->> 'real_total_pct')::numeric, 30::numeric, 'suma el real de los sprints');
select is((public.consumo_equipo(tests.proy('Portal A')) ->> 'porcentaje_del_tope')::numeric, 20.0, 'porcentaje del tope');
select is((public.consumo_equipo(tests.proy('Portal A')) -> 'aviso_80_en'), 'null'::jsonb, 'bajo el 80 %: sin aviso');
select throws_ok($$select public.anotar_consumo_sprint(tests.sprint('Portal A', 1), -5, null)$$, '22023', 'datos_invalidos', 'rechaza porcentajes negativos');
select throws_ok($$select public.fijar_consumo_proyecto(tests.proy('Portal A'), null, 99999)$$, '22023', 'datos_invalidos', 'rechaza un tope absurdo');
select throws_ok($$select public.anotar_consumo_sprint(gen_random_uuid(), 1, 1)$$, 'P0001', 'sprint_no_encontrado', 'sprint inexistente');

-- ---------- Aviso al 80 % del tope ----------
select public.anotar_consumo_sprint(tests.sprint('Portal A', 2), 60, 85);
select is((select count(*)::int from public.registro_actividad where accion = 'consumo_equipo_aviso_80'), 0, '115 de 150 (76 %): todavia sin aviso');
select public.anotar_consumo_sprint(tests.sprint('Portal A', 2), null, 90);
select is((select count(*)::int from public.registro_actividad where accion = 'consumo_equipo_aviso_80' and detalle ->> 'proyecto_id' = tests.proy('Portal A')::text), 1, '120 de 150 (80 %): el aviso queda en el registro');
select ok((public.consumo_equipo(tests.proy('Portal A')) ->> 'aviso_80_en') is not null, 'el aviso queda marcado en el proyecto');
select public.anotar_consumo_sprint(tests.sprint('Portal A', 2), null, 95);
select is((select count(*)::int from public.registro_actividad where accion = 'consumo_equipo_aviso_80'), 1, 'avisa una sola vez');
select public.fijar_consumo_proyecto(tests.proy('Portal A'), null, 400);
select is((public.consumo_equipo(tests.proy('Portal A')) -> 'aviso_80_en'), 'null'::jsonb, 'si se sube el tope y baja del 80 %, el aviso se rearma');
select is((select count(*)::int from public.registro_actividad where accion = 'consumo_equipo_editado'), 8, 'cada cambio queda en el registro');
select is((select count(*)::int from public.historial_proyecto where tipo like '%consumo%'), 0, 'nada del consumo llega al historial del cliente');

-- ---------- El cliente y su equipo NUNCA lo ven ----------
select tests.admin();
select is((select count(*)::int from public.consumo_equipo_proyecto), 1, 'hay datos en la tabla del proyecto');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.consumo_equipo_proyecto), 0, 'admin A: no ve el consumo del proyecto');
select is((select count(*)::int from public.consumo_equipo_sprint), 0, 'admin A: no ve el consumo por sprint');
select throws_ok($$select public.consumo_equipo(tests.proy('Portal A'))$$, '42501', 'no_autorizado', 'admin A: no lo lee por funcion');
select throws_ok($$select public.anotar_consumo_sprint(tests.sprint('Portal A', 1), 1, 1)$$, '42501', 'no_autorizado', 'admin A: no escribe por funcion');
select throws_ok($$select public.fijar_consumo_proyecto(tests.proy('Portal A'), 1, 1)$$, '42501', 'no_autorizado', 'admin A: no fija el tope');
select throws_ok($$update public.consumo_equipo_proyecto set tope_pct = 1$$, '42501', null, 'admin A: no escribe directo');
select throws_ok($$insert into public.consumo_equipo_sprint (sprint_id, empresa_id, proyecto_id) values (tests.sprint('Portal A', 1), tests.id('empresa_a'), tests.proy('Portal A'))$$, '42501', null, 'admin A: no inserta directo');
select tests.como(tests.id('equipo_a2'));
select is((select count(*)::int from public.consumo_equipo_proyecto) + (select count(*)::int from public.consumo_equipo_sprint), 0, 'equipo A (con permisos): no ve nada');
select tests.como(tests.id('admin_b'), 'aal2');
select is((select count(*)::int from public.consumo_equipo_proyecto) + (select count(*)::int from public.consumo_equipo_sprint), 0, 'otra empresa: no ve nada');
select tests.anonimo();
select throws_ok($$select count(*) from public.consumo_equipo_proyecto$$, '42501', null, 'visitante: sin permiso');
select tests.como(tests.id('sa'), 'aal1');
select is((select count(*)::int from public.consumo_equipo_proyecto), 0, 'super admin SIN 2FA: no ve nada');
select throws_ok($$select public.fijar_consumo_proyecto(tests.proy('Portal A'), 1, 1)$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no escribe');

-- "Ver como el cliente" tampoco lo muestra.
select tests.como(tests.id('sa'), 'aal2');
select public.iniciar_ver_como(tests.id('empresa_a'));
select is((select count(*)::int from public.consumo_equipo_proyecto), 0, 'en "ver como": no se ve (es lo que ve el cliente)');
select throws_ok($$select public.fijar_consumo_proyecto(tests.proy('Portal A'), 1, 1)$$, '42501', null, 'en "ver como": no se escribe');
select tests.admin();

-- Nombres sin mencionar herramientas.
select is_empty($$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname ~* '(^|_)(ia|ai|claude|gpt|modelo|agente)(_|$)'$$, 'ninguna tabla de public nombra IA ni herramientas');

select * from finish();
rollback;
