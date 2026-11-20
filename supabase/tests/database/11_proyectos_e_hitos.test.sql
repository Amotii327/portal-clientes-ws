-- Proyectos y los 13 hitos: creacion, quien puede, estados, retrasos con motivo y lado, hito 6 derivado.
begin;
select plan(45);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql

-- ---------- Quien puede crear ----------
select tests.anonimo();
select throws_ok($$select public.crear_proyecto(tests.id('empresa_a'), 'X proyecto')$$, '42501', null, 'visitante: no crea proyectos');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.crear_proyecto(tests.id('empresa_a'), 'X proyecto')$$, '42501', 'no_autorizado', 'admin del cliente: no crea proyectos');
select tests.como(tests.id('equipo_a'));
select throws_ok($$select public.crear_proyecto(tests.id('empresa_a'), 'X proyecto')$$, '42501', 'no_autorizado', 'equipo del cliente: no crea proyectos');
select tests.como(tests.id('sa'), 'aal1');
select throws_ok($$select public.crear_proyecto(tests.id('empresa_a'), 'X proyecto')$$, '42501', 'no_autorizado', 'super admin sin 2FA: no crea proyectos');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.crear_proyecto(tests.id('empresa_c'), 'X proyecto')$$, 'P0001', 'empresa_no_disponible', 'no se crea proyecto en empresa pausada');
select throws_ok($$select public.crear_proyecto(gen_random_uuid(), 'X proyecto')$$, 'P0001', 'empresa_no_disponible', 'no se crea proyecto en empresa inexistente');
select throws_ok($$select public.crear_proyecto(tests.id('empresa_a'), ' ')$$, '22023', 'datos_invalidos', 'rechaza nombre vacio');
select throws_ok($$select public.crear_proyecto(tests.id('empresa_a'), 'X proyecto', null, '2026-12-10', '2026-12-01')$$, '22023', 'fechas_invalidas', 'rechaza fin antes del inicio');

-- ---------- Creacion ----------
select tests.crear_proyectos();
select is((select count(*)::int from public.hitos where proyecto_id = tests.proy('Portal A')), 13, 'nace con 13 hitos');
select is((select string_agg(numero::text, ',' order by numero) from public.hitos where proyecto_id = tests.proy('Portal A')), '1,2,3,4,5,6,7,8,9,10,11,12,13', 'hitos numerados 1 a 13');
select is((select nombre from public.hitos where id = tests.hito('Portal A', 11)), 'Entrega final', 'nombres estandar (hito 11)');
select is((select count(*)::int from public.hitos where proyecto_id = tests.proy('Portal A') and estado = 'pendiente'), 13, 'todos nacen pendientes');
select is((select numero::int from public.hitos where proyecto_id = tests.proy('Portal A') and not visible), 13, 'solo el hito 13 nace oculto');
select is((select string_agg(h.numero || ':' || pa.concepto, ',' order by h.numero) from public.hitos_pago_asociado pa join public.hitos h on h.id = pa.hito_id where h.proyecto_id = tests.proy('Portal A')),
  '1:Anticipo,5:Segundo pago,11:Saldo final,13:Cuota mensual', 'pagos asociados por defecto');
select is(tests.avance('Portal A'), '0/12=0.00', 'avance inicial 0 de 12 partes');
select is((select plan_estado from public.proyectos where nombre = 'Portal A'), 'propuesta', 'el plan nace como propuesta');

-- ---------- Hitos: nombres, estados, fechas ----------
select tests.como(tests.id('sa'), 'aal2');
select lives_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_nombre => 'Descubrimiento y alcance')$$, 'super admin renombra un hito');
select is((select nombre from public.hitos where id = tests.hito('Portal A', 2)), 'Descubrimiento y alcance', 'el nombre cambio');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_nombre => 'x')$$, '22023', 'datos_invalidos', 'rechaza nombre de hito muy corto');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_estado => 'inventado')$$, '22023', 'datos_invalidos', 'rechaza estado desconocido');
select lives_ok($$select public.editar_hito(tests.hito('Portal A', 1), p_estado => 'terminado')$$, 'marca terminado el hito 1');
select is((select fecha_real from public.hitos where id = tests.hito('Portal A', 1)), (now() at time zone 'America/Bogota')::date, 'terminado: la fecha real es hoy (hora Colombia)');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 1), p_fecha_real => '2999-01-01')$$, '22023', null, 'la fecha real no puede ser futura');
select lives_ok($$select public.editar_hito(tests.hito('Portal A', 1), p_estado => 'en_curso')$$, 'reabrir un hito terminado: vuelve a en curso');
select is((select fecha_real from public.hitos where id = tests.hito('Portal A', 1)), null, 'reabierto: se borra la fecha real');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 3), p_fecha_real => '2026-11-01')$$, '22023', 'datos_invalidos', 'fecha real solo si esta terminado');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 6), p_estado => 'terminado')$$, 'P0001', 'hito_derivado', 'el hito 6 no se cambia a mano (sale de sus sprints)');
select throws_ok($$select public.editar_hito(gen_random_uuid(), p_nombre => 'Otro nombre')$$, 'P0001', 'hito_no_encontrado', 'hito inexistente');

-- Primera fecha: no es retraso.
select lives_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-04')$$, 'fijar la primera fecha no pide motivo');
select is((select count(*)::int from public.retrasos), 0, 'fijar la primera fecha no crea retraso');
-- Cambiar una fecha ya fijada: motivo y lado obligatorios.
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-11')$$, '22023', 'retraso_requiere_lado', 'cambiar fecha sin lado: rechazado');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-11', p_lado => 'websourcing')$$, '22023', 'retraso_requiere_motivo', 'cambiar fecha sin motivo: rechazado');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-11', p_lado => 'websourcing', p_motivo => 'ab')$$, '22023', 'retraso_requiere_motivo', 'motivo demasiado corto: rechazado');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-11', p_lado => 'otro', p_motivo => 'Cambio de alcance')$$, '22023', 'retraso_requiere_lado', 'lado desconocido: rechazado');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-11', p_lado => 'cliente', p_motivo => 'Falta el material')$$, '22023', 'retraso_requiere_que_falta', 'lado cliente sin "que falta": rechazado');
select is((select fecha_planeada from public.hitos where id = tests.hito('Portal A', 2)), '2026-12-04'::date, 'los rechazos no movieron la fecha');
select is((select count(*)::int from public.retrasos), 0, 'los rechazos no dejaron retrasos a medias');
select lives_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_fecha_planeada => '2026-12-11', p_lado => 'cliente', p_motivo => 'Falta el material de marca', p_que_falta => 'Logo en vectores')$$, 'retraso del lado del cliente con motivo y que falta');
select is((select fecha_anterior || '>' || fecha_nueva || ' ' || lado from public.retrasos), '2026-12-04>2026-12-11 cliente', 'el retraso guarda fecha anterior, nueva y lado');
select throws_ok($$update public.retrasos set motivo = 'cambiado'$$, '42501', null, 'los retrasos solo se agregan (no se editan)');

-- Hito 13: visibilidad solo para el 13.
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 4), p_visible => false)$$, 'P0001', 'hito_no_ocultable', 'solo el hito 13 se puede ocultar');
select lives_ok($$select public.editar_hito(tests.hito('Portal A', 13), p_visible => true)$$, 'el hito 13 se hace visible (mantenimiento activado)');
select is((select visible from public.hitos where id = tests.hito('Portal A', 13)), true, 'hito 13 visible');
select lives_ok($$select public.fijar_pago_hito(tests.hito('Portal A', 6), 'Pago por sprint')$$, 'fijar pago asociado del hito 6');
select lives_ok($$select public.fijar_pago_hito(tests.hito('Portal A', 6), '')$$, 'vaciar el pago asociado lo quita');

select * from finish();
rollback;
