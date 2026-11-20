-- Formula de avance (D-013): hitos con el mismo peso, el hito 6 repartido por sprint, el hito 13 no cuenta.
begin;
select plan(23);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
select tests.crear_proyectos();
select tests.permitir_terminar();   -- sprint 3: estas pruebas terminan hitos y sprints a mano (ver ayudas_proyectos.sql)
select tests.como(tests.id('sa'), 'aal2');

select is(tests.avance('Portal A'), '0/12=0.00', 'proyecto nuevo: 0 de 12 partes');
select public.editar_hito(tests.hito('Portal A', 1), p_estado => 'terminado');
select public.editar_hito(tests.hito('Portal A', 2), p_estado => 'terminado');
select is(tests.avance('Portal A'), '2/12=16.67', 'dos hitos terminados: 2 de 12');

-- El hito 13 no cuenta.
select public.editar_hito(tests.hito('Portal A', 13), p_estado => 'terminado');
select is(tests.avance('Portal A'), '2/12=16.67', 'el hito 13 terminado NO suma');
select public.editar_hito(tests.hito('Portal A', 13), p_estado => 'pendiente');

-- Un plan en propuesta no cambia el avance (el cliente no lo ve): el hito 6 sigue siendo una parte.
select public.cargar_plan_sprints(tests.proy('Portal A'), $j$[
  {"nombre": "Sprint 1", "fecha_inicio": "2026-11-30", "fecha_fin": "2026-12-04", "fecha_demo": "2026-12-04"},
  {"nombre": "Sprint 2", "fecha_inicio": "2026-12-07", "fecha_fin": "2026-12-11", "fecha_demo": "2026-12-11"},
  {"nombre": "Sprint 3", "fecha_inicio": "2026-12-14", "fecha_fin": "2026-12-18", "fecha_demo": "2026-12-18"}]$j$::jsonb);
select is(tests.avance('Portal A'), '2/12=16.67', 'plan en propuesta: el avance no cambia (el hito 6 es una parte)');
select is(tests.estado_hito('Portal A', 6), 'pendiente', 'plan en propuesta: el hito 6 sigue pendiente');

-- Aprobado el plan: con 3 sprints hay 14 partes (11 hitos + 3 sprints).
select public.aprobar_plan_sprints(tests.proy('Portal A'));
select is(tests.avance('Portal A'), '2/14=14.29', 'plan aprobado con 3 sprints: 14 partes');
select is(tests.estado_hito('Portal A', 6), 'pendiente', 'sin sprints iniciados el hito 6 sigue pendiente');

select public.editar_sprint(tests.sprint('Portal A', 1), p_estado => 'en_curso');
select is(tests.estado_hito('Portal A', 6), 'en_curso', 'un sprint en curso: hito 6 en curso');
select is(tests.avance('Portal A'), '2/14=14.29', 'sprint en curso no suma');
select public.editar_sprint(tests.sprint('Portal A', 1), p_estado => 'terminado');
select is(tests.avance('Portal A'), '3/14=21.43', 'terminar el sprint 1 suma 1/14');
select is(tests.estado_hito('Portal A', 6), 'en_curso', 'un sprint terminado de tres: hito 6 en curso');
select public.editar_sprint(tests.sprint('Portal A', 2), p_estado => 'en_revision');
select is(tests.estado_hito('Portal A', 6), 'esperando_aprobacion', 'un sprint en revision: hito 6 esperando aprobacion');
select public.editar_sprint(tests.sprint('Portal A', 2), p_estado => 'terminado');
select public.editar_sprint(tests.sprint('Portal A', 3), p_estado => 'terminado');
select is(tests.estado_hito('Portal A', 6), 'terminado', 'todos los sprints terminados: hito 6 terminado');
select is((select fecha_real from public.hitos where id = tests.hito('Portal A', 6)), (now() at time zone 'America/Bogota')::date, 'hito 6 terminado: fecha real puesta por la base');
select is(tests.avance('Portal A'), '5/14=35.71', 'hito 6 no se cuenta dos veces: 2 hitos + 3 sprints = 5 de 14');

-- Reabrir un sprint reabre el hito 6.
select public.editar_sprint(tests.sprint('Portal A', 3), p_estado => 'en_curso');
select is(tests.estado_hito('Portal A', 6), 'en_curso', 'reabrir un sprint: el hito 6 vuelve a en curso');
select is((select fecha_real from public.hitos where id = tests.hito('Portal A', 6)), null, 'hito 6 reabierto: sin fecha real');
select is(tests.avance('Portal A'), '4/14=28.57', 'reabierto: baja a 4 de 14');
select public.editar_sprint(tests.sprint('Portal A', 3), p_estado => 'terminado');

-- Todos los demas hitos terminados = 100 % (con el 13 pendiente).
select public.editar_hito(tests.hito('Portal A', n), p_estado => 'terminado') from generate_series(3, 12) n where n <> 6;
select is(tests.avance('Portal A'), '14/14=100.00', 'todo terminado salvo el 13: 100 %');
select is(tests.estado_hito('Portal A', 13), 'pendiente', 'el hito 13 sigue pendiente y no impide el 100 %');

-- El calculo lo hace la base aunque se cambie por fuera de las funciones.
select tests.admin();
update public.hitos set estado = 'pendiente', fecha_real = null where id = tests.hito('Portal A', 12);
select is(tests.avance('Portal A'), '13/14=92.86', 'cambio directo en la tabla: el avance se recalcula por trigger');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$update public.proyectos set avance_pct = 100 where nombre = 'Portal A'$$, '42501', null, 'nadie (ni el super admin) escribe el avance a mano desde la API');
select tests.admin();

-- Otro proyecto no se afecta.
select is(tests.avance('Portal B'), '0/12=0.00', 'el avance de otro proyecto no cambia');

select * from finish();
rollback;
