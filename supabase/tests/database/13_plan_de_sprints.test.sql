-- Plan de sprints: lo propone el equipo, el super admin lo edita y aprueba, el cliente nunca ve borradores.
begin;
select plan(58);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
select tests.crear_proyectos();

-- ---------- Cargar la propuesta ----------
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.cargar_plan_sprints(tests.proy('Portal A'), '[]'::jsonb)$$, '42501', 'no_autorizado', 'admin del cliente: no carga el plan');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.cargar_plan_sprints(tests.proy('Portal A'), '[]'::jsonb)$$, '22023', 'datos_invalidos', 'un plan vacio se rechaza');
select throws_ok($$select public.cargar_plan_sprints(tests.proy('Portal A'), '[{"nombre": "S1", "fecha_inicio": "2026-13-45", "fecha_fin": "2026-12-04"}]'::jsonb)$$, '22023', 'datos_invalidos', 'fecha mal escrita: rechazada');
select throws_ok($$select public.cargar_plan_sprints(tests.proy('Portal A'), '[{"nombre": "Sprint 1", "fecha_inicio": "2026-12-04", "fecha_fin": "2026-12-01"}]'::jsonb)$$, '22023', 'fechas_invalidas', 'fin antes del inicio: rechazado');
select throws_ok($$select public.cargar_plan_sprints(tests.proy('Portal A'), '[{"fecha_inicio": "2026-12-01", "fecha_fin": "2026-12-04"}]'::jsonb)$$, '22023', 'datos_invalidos', 'sprint sin nombre: rechazado');
select is((select count(*)::int from public.sprints), 0, 'las cargas rechazadas no dejaron sprints');

select is(public.cargar_plan_sprints(tests.proy('Portal A'), $j$[
  {"nombre": "Base y entrada segura", "fecha_inicio": "2026-11-23", "fecha_fin": "2026-11-27", "fecha_demo": "2026-11-27", "incluye": ["Base de datos", "Login"]},
  {"nombre": "Proyectos e hitos", "fecha_inicio": "2026-11-30", "fecha_fin": "2026-12-04", "fecha_demo": "2026-12-04", "incluye": ["Linea de tiempo"]},
  {"nombre": "Revisiones", "fecha_inicio": "2026-12-07", "fecha_fin": "2026-12-11"}]$j$::jsonb) ->> 'sprints', '3', 'carga la propuesta de 3 sprints');
select is((select string_agg(numero || ':' || estado, ',' order by numero) from public.sprints), '1:propuesto,2:propuesto,3:propuesto', 'numerados y en estado propuesto');
select is((select incluye from public.sprints where numero = 1), array['Base de datos', 'Login'], 'guarda lo que incluye cada sprint');
select is((select plan_estado from public.proyectos where nombre = 'Portal A'), 'propuesta', 'el plan sigue como propuesta');
select is((select public.cargar_plan_sprints(tests.proy('Portal A'), '[{"nombre": "Unico", "fecha_inicio": "2026-12-01", "fecha_fin": "2026-12-04"}]'::jsonb) ->> 'sprints'), '1', 'volver a cargar reemplaza la propuesta');
select public.cargar_plan_sprints(tests.proy('Portal A'), $j$[
  {"nombre": "Base y entrada segura", "fecha_inicio": "2026-11-23", "fecha_fin": "2026-11-27", "fecha_demo": "2026-11-27"},
  {"nombre": "Proyectos e hitos", "fecha_inicio": "2026-11-30", "fecha_fin": "2026-12-04", "fecha_demo": "2026-12-04"},
  {"nombre": "Revisiones", "fecha_inicio": "2026-12-07", "fecha_fin": "2026-12-11"}]$j$::jsonb);

-- ---------- El cliente NUNCA ve borradores ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.sprints), 0, 'admin A: no ve ningun sprint mientras el plan es propuesta');
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.sprints), 0, 'equipo A: no ve ningun sprint de la propuesta');
select is((public.linea_de_tiempo(tests.proy('Portal A')) -> 'plan')::text, 'null', 'linea de tiempo del cliente: sin plan mientras es propuesta');
select is((public.linea_de_tiempo(tests.proy('Portal A')) -> 'proyecto' ->> 'sprint_actual_numero'), null, 'el cliente no ve un "sprint actual" de la propuesta');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.sprints), 3, 'super admin: ve la propuesta completa');
select is(jsonb_array_length(public.linea_de_tiempo(tests.proy('Portal A')) -> 'plan' -> 'sprints'), 3, 'super admin: la linea de tiempo trae la propuesta');

-- ---------- Editar la propuesta (sin motivo) ----------
select is((select public.agregar_sprint(tests.proy('Portal A'), 'Documentos', '2026-12-14', '2026-12-18', '2026-12-18', array['Archivos']) ->> 'numero'), '4', 'agrega un sprint al final');
select is((select jsonb_array_length(public.agregar_sprint(tests.proy('Portal A'), 'Cruzado', '2026-12-16', '2026-12-22') -> 'avisos')), 1, 'avisa si dos sprints se cruzan (no lo impide)');
select is((select public.agregar_sprint(tests.proy('Portal A'), 'Cruzado', '2026-12-16', '2026-12-22') -> 'avisos' -> 0 -> 'sprints')::text, '[4, 5]', 'el aviso dice cuales sprints se cruzan');
select lives_ok($$select public.quitar_sprint(tests.sprint('Portal A', 6))$$, 'quita un sprint de la propuesta sin motivo');
select lives_ok($$select public.quitar_sprint(tests.sprint('Portal A', 5))$$, 'quita el otro');
select is((select string_agg(nombre, ',' order by numero) from public.sprints), 'Base y entrada segura,Proyectos e hitos,Revisiones,Documentos', 'quedan 4 sprints, renumerados');
select lives_ok($$select public.editar_sprint(tests.sprint('Portal A', 3), p_nombre => 'Revisiones y aprobaciones', p_fecha_fin => '2026-12-12')$$, 'edita nombre y fecha de un sprint de la propuesta');
select throws_ok($$select public.editar_sprint(tests.sprint('Portal A', 3), p_estado => 'en_curso')$$, 'P0001', 'plan_no_aprobado', 'no se inicia un sprint de un plan sin aprobar');
select throws_ok($$select public.editar_sprint(tests.sprint('Portal A', 3), p_fecha_fin => '2026-11-01')$$, '22023', 'fechas_invalidas', 'fin antes del inicio: rechazado');
select throws_ok($$select public.reordenar_sprints(tests.proy('Portal A'), array[tests.sprint('Portal A', 1)])$$, '22023', 'orden_invalido', 'reordenar con ids incompletos: rechazado');
select lives_ok($$select public.reordenar_sprints(tests.proy('Portal A'), array[tests.sprint('Portal A', 2), tests.sprint('Portal A', 1), tests.sprint('Portal A', 3), tests.sprint('Portal A', 4)])$$, 'reordena la propuesta');
select is((select nombre from public.sprints where numero = 1), 'Proyectos e hitos', 'el sprint movido quedo de primero');
select lives_ok($$select public.reordenar_sprints(tests.proy('Portal A'), array[tests.sprint('Portal A', 2), tests.sprint('Portal A', 1), tests.sprint('Portal A', 3), tests.sprint('Portal A', 4)])$$, 'y se puede devolver');
select is((select count(*)::int from public.cambios_plan), 0, 'cambiar la propuesta no genera "cambios del plan" (aun no lo ve nadie)');

-- ---------- Aprobar ----------
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.aprobar_plan_sprints(tests.proy('Portal A'))$$, '42501', 'no_autorizado', 'el admin del cliente no aprueba el plan');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.aprobar_plan_sprints(tests.proy('Portal B'))$$, 'P0001', 'plan_vacio', 'no se aprueba un plan sin sprints');
select is((select jsonb_array_length(public.aprobar_plan_sprints(tests.proy('Portal A')) -> 'avisos')), 0, 'aprobar el plan (sin cruces)');
select is((select string_agg(estado, ',' order by numero) from public.sprints), 'aprobado,aprobado,aprobado,aprobado', 'al aprobar, los sprints pasan a aprobado');
select throws_ok($$select public.aprobar_plan_sprints(tests.proy('Portal A'))$$, 'P0001', 'plan_ya_aprobado', 'aprobar dos veces: rechazado');
select throws_ok($$select public.cargar_plan_sprints(tests.proy('Portal A'), '[{"nombre": "Otro", "fecha_inicio": "2026-12-01", "fecha_fin": "2026-12-04"}]'::jsonb)$$, 'P0001', 'plan_ya_aprobado', 'ya aprobado: no se recarga (se cambia con motivo)');

-- ---------- Ahora el cliente lo ve ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.sprints), 4, 'admin A: ve los 4 sprints una vez aprobado');
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.sprints), 4, 'equipo A (sin permisos): tambien lo ve');
select is(public.linea_de_tiempo(tests.proy('Portal A')) -> 'plan' ->> 'estado', 'aprobado', 'la linea de tiempo del cliente trae el plan aprobado');

-- ---------- Plan aprobado: cambios con motivo ----------
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.editar_sprint(tests.sprint('Portal A', 1), p_fecha_fin => '2026-11-28')$$, '22023', 'plan_requiere_motivo', 'cambiar fechas de un plan aprobado sin motivo: rechazado');
select throws_ok($$select public.agregar_sprint(tests.proy('Portal A'), 'Extra', '2026-12-21', '2026-12-23')$$, '22023', 'plan_requiere_motivo', 'agregar a un plan aprobado sin motivo: rechazado');
select throws_ok($$select public.quitar_sprint(tests.sprint('Portal A', 4))$$, '22023', 'datos_invalidos', 'quitar de un plan aprobado sin motivo: rechazado');
select throws_ok($$select public.reordenar_sprints(tests.proy('Portal A'), array[tests.sprint('Portal A', 2), tests.sprint('Portal A', 1), tests.sprint('Portal A', 3), tests.sprint('Portal A', 4)])$$, '22023', 'plan_requiere_motivo', 'reordenar un plan aprobado sin motivo: rechazado');
select is((select count(*)::int from public.cambios_plan), 0, 'los rechazos no dejaron cambios a medias');

-- Corre este sprint un dia y los siguientes con la misma duracion.
select public.editar_sprint(tests.sprint('Portal A', 1), p_fecha_fin => '2026-11-28', p_fecha_demo => '2026-11-28', p_motivo => 'Se amplia un dia por la entrada segura', p_correr_siguientes => true);
select is((select fecha_inicio || '>' || fecha_fin from public.sprints where numero = 2), '2026-12-01>2026-12-05', 'correr siguientes: el sprint 2 se corre un dia con la misma duracion');
select is((select fecha_inicio || '>' || fecha_fin || '>' || fecha_demo from public.sprints where numero = 4), '2026-12-15>2026-12-19>2026-12-19', 'correr siguientes: el sprint 4 tambien (incluida su demo)');
select is((select tipo || ':' || motivo from public.cambios_plan order by id limit 1), 'fechas_corridas:Se amplia un dia por la entrada segura', 'el cambio queda con su motivo');

-- El cliente ve las fechas nuevas y el motivo.
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.cambios_plan), 1, 'admin A: ve el cambio al plan con su motivo');
select is((select motivo from public.cambios_plan), 'Se amplia un dia por la entrada segura', 'el cliente lee el motivo');
select throws_ok($$select public.editar_sprint(tests.sprint('Portal A', 1), p_nombre => 'Otro nombre')$$, '42501', 'no_autorizado', 'el admin del cliente no edita el plan');
select tests.como(tests.id('sa'), 'aal2');

-- Agregar, quitar y reordenar con motivo.
select is((select public.agregar_sprint(tests.proy('Portal A'), 'Extra', '2026-12-21', '2026-12-23', null, '{}', 'Pedido de ajuste del cliente') ->> 'numero'), '5', 'agregar a un plan aprobado con motivo: nace aprobado');
select is((select estado from public.sprints where numero = 5), 'aprobado', 'el sprint agregado a un plan aprobado nace aprobado');
select lives_ok($$select public.quitar_sprint(tests.sprint('Portal A', 5), 'Ya no se necesita')$$, 'quitar con motivo');
select lives_ok($$select public.reordenar_sprints(tests.proy('Portal A'), array[tests.sprint('Portal A', 1), tests.sprint('Portal A', 2), tests.sprint('Portal A', 4), tests.sprint('Portal A', 3)], 'Documentos pasa antes de revisiones')$$, 'reordenar con motivo');
select is((select count(*)::int from public.cambios_plan), 4, 'cada cambio con motivo queda en el plan: correr, agregar, quitar, reordenar');

-- Un sprint ya iniciado no se quita ni se mueve.
select public.editar_sprint(tests.sprint('Portal A', 1), p_estado => 'en_curso');
select throws_ok($$select public.quitar_sprint(tests.sprint('Portal A', 1), 'Ya no va')$$, 'P0001', 'sprint_ya_iniciado', 'un sprint en curso no se quita');
select throws_ok($$select public.reordenar_sprints(tests.proy('Portal A'), array[tests.sprint('Portal A', 2), tests.sprint('Portal A', 1), tests.sprint('Portal A', 3), tests.sprint('Portal A', 4)], 'Prueba de orden')$$, '22023', 'orden_invalido', 'un sprint iniciado no cambia de lugar');

select * from finish();
rollback;
