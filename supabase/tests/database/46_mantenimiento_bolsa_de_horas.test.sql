-- Sprint 6 · Bolsa de horas: horas anotadas a mano y revisadas por el dueno antes de descontarse (D-008),
-- aviso del 80 % y del 100 % con historial, horas extra con aprobacion del cliente, y corte mensual:
-- las horas no usadas se pierden salvo "acumular" por cliente (D-007).
begin;
select plan(67);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

select tests.hoy_mas(-3) as inicio \gset
select date_trunc('month', private.hoy()::timestamp)::date as mes_actual \gset
select (date_trunc('month', private.hoy()::timestamp) + interval '1 month' + interval '1 day')::date as corte1 \gset
select (date_trunc('month', private.hoy()::timestamp) + interval '2 months' + interval '1 day')::date as corte2 \gset
select (date_trunc('month', private.hoy()::timestamp) + interval '3 months' + interval '1 day')::date as corte3 \gset

-- Planes: A pierde las horas (por defecto); B acumula. 10 horas al mes cada uno.
select tests.como(tests.id('sa'), 'aal2');
select public.activar_mantenimiento(tests.id('empresa_a'), 'personalizado',
  jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 500000, 'horas_mes', 10, 'incluye', jsonb_build_array('correccion_errores'))) ->> 'activo' as x \gset
select public.activar_mantenimiento(tests.id('empresa_b'), 'personalizado',
  jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 500000, 'horas_mes', 10, 'acumular_horas', true, 'incluye', jsonb_build_array('correccion_errores'))) ->> 'activo' as x \gset
select tests.admin();
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'alta') as t1 \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'alta') as t2 \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'solicitud_cambio', 'normal') as t_cambio \gset
select tests.ticket_directo(tests.id('empresa_b'), tests.id('miembro_equipo_b'), tests.id('equipo_b'), 'error', 'alta') as tb \gset
select tests.ticket_directo(tests.id('empresa_c'), tests.id('miembro_admin_c'), tests.id('admin_c'), 'error', 'alta') as tc \gset
select id as bolsa_a from public.bolsa_mensual where empresa_id = tests.id('empresa_a') \gset
select id as bolsa_b from public.bolsa_mensual where empresa_id = tests.id('empresa_b') \gset
select is((select horas_incluidas from public.bolsa_mensual where id = :'bolsa_a'), 10.00::numeric, 'la bolsa de A nace con 10 horas');

-- ---------- Anotar (solo el super admin; nada se descuenta todavia) ----------
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.anotar_horas_ticket(%L, 0)$$, :'t1'), 'datos_invalidos'), 'cero horas no vale');
select ok(tests.error_es(format($$select public.anotar_horas_ticket(%L, 25)$$, :'t1'), 'datos_invalidos'), 'mas de 24 horas en un registro no vale');
select ok(tests.error_es(format($$select public.anotar_horas_ticket(%L, 1, null, current_date + 3)$$, :'t1'), 'fecha_invalida'), 'no se anotan horas del futuro');
select ok(tests.error_es(format($$select public.anotar_horas_ticket(%L, 1)$$, :'t_cambio'), 'ticket_fuera_de_bolsa'), 'una solicitud de cambio se cobra aparte: no descuenta de la bolsa');
select ok(tests.error_es(format($$select public.anotar_horas_ticket(%L, 1)$$, :'tc'), 'mantenimiento_no_activo'), 'una empresa sin plan activo no tiene bolsa');
select public.anotar_horas_ticket(:'t1', 3, 'Revise logs y reinicie el servicio') ->> 'estado' as est \gset
select is(:'est'::text, 'pendiente_dueno', 'las horas anotadas quedan pendientes de revision del dueno');
select id as h1 from public.horas_registradas where ticket_id = :'t1' and horas = 3 \gset
select is((select horas_usadas from public.bolsa_mensual where id = :'bolsa_a'), 0.00::numeric, 'todavia no se descuentan de la bolsa');
select is((select nota from public.horas_notas_internas where hora_id = :'h1'), 'Revise logs y reinicie el servicio', 'la nota interna queda aparte');
select tests.como(tests.id('admin_a'));
select is(tests.contar('select 1 from public.horas_registradas'), 0::bigint, 'el cliente no ve horas pendientes');
select is((select horas_usadas from public.bolsa_mensual_resumen), 0.00::numeric, 'el cliente ve 0 horas usadas');
select tests.como(tests.id('sa'), 'aal2');

-- ---------- Revisar ----------
select ok(tests.error_es(format($$select public.revisar_horas(%L, false)$$, :'h1'), 'motivo_requerido'), 'rechazar horas exige motivo');
select ok(tests.error_es(format($$select public.revisar_horas(%L, true)$$, gen_random_uuid()), 'hora_no_encontrada'), 'horas que no existen');
select is(public.revisar_horas(:'h1', false, 'Eran horas de otro proyecto') ->> 'estado', 'rechazada', 'el dueno rechaza unas horas');
select is((select horas_usadas from public.bolsa_mensual where id = :'bolsa_a'), 0.00::numeric, 'rechazadas: no se descuentan');
select ok(tests.error_es(format($$select public.revisar_horas(%L, true)$$, :'h1'), 'horas_ya_revisadas'), 'unas horas ya revisadas no se vuelven a revisar');
select public.anotar_horas_ticket(:'t1', 3);
select id as h2 from public.horas_registradas where ticket_id = :'t1' and estado = 'pendiente_dueno' \gset
select is(public.revisar_horas(:'h2', true) ->> 'estado', 'aprobada', 'el dueno aprueba');
select is((select horas_usadas from public.bolsa_mensual where id = :'bolsa_a'), 3.00::numeric, 'al aprobar se descuentan de la bolsa');
select is((select count(*)::int from public.bolsa_avisos), 0, 'con 30 % no hay aviso');
select is((select horas_disponibles from public.bolsa_mensual_resumen where bolsa_id = :'bolsa_a'), 7.00::numeric, 'quedan 7 horas disponibles');

-- ---------- Aviso del 80 % ----------
select public.anotar_horas_ticket(:'t1', 5);
select id as h3 from public.horas_registradas where ticket_id = :'t1' and estado = 'pendiente_dueno' \gset
select public.revisar_horas(:'h3', true);
select is((select count(*)::int from public.bolsa_avisos where bolsa_id = :'bolsa_a' and tipo = '80_por_ciento'), 1, 'al llegar al 80 % queda el aviso en el historial');
select is((select porcentaje from public.bolsa_avisos where bolsa_id = :'bolsa_a' and tipo = '80_por_ciento'), 80.00::numeric, 'con su porcentaje');
select is((select count(*)::int from public.bolsa_avisos where bolsa_id = :'bolsa_a' and tipo = '100_por_ciento'), 0, 'todavia no hay aviso de 100 %');
select isnt((select aviso_80_en from public.bolsa_mensual where id = :'bolsa_a'), null::timestamptz, 'la bolsa recuerda que ya aviso');
select tests.admin();
select is((select count(*)::int from public.outbox_correos where tipo = 'mantenimiento_aviso_80_por_ciento' and destinatario_user_id = tests.id('sa')), 1, 'el 80 % avisa al super admin (cola de correos)');
select is((select count(*)::int from public.outbox_correos where tipo = 'mantenimiento_aviso_80_por_ciento' and destinatario_user_id = tests.id('admin_a')), 1, 'y al admin del cliente');
select is((select count(*)::int from public.outbox_correos where tipo = 'mantenimiento_aviso_80_por_ciento' and destinatario_user_id = tests.id('equipo_a')), 0, 'pero no al equipo del cliente');
select is((select count(*)::int from public.outbox_correos where tipo like 'mantenimiento_aviso%' and empresa_id = tests.id('empresa_b')), 0, 'ni a otra empresa');
select tests.como(tests.id('sa'), 'aal2');

-- ---------- Pasar el 100 %: horas extra ----------
select public.anotar_horas_ticket(:'t1', 4);
select id as h4 from public.horas_registradas where ticket_id = :'t1' and estado = 'pendiente_dueno' \gset
select is(public.revisar_horas(:'h4', true) ->> 'estado', 'extra_pendiente_cliente', 'lo que pasa de la bolsa se marca como extra');
select is((select horas || '/' || estado from public.horas_registradas where id = :'h4'), '2.00/aprobada', 'la parte que cabia (2 h) queda aprobada en la bolsa');
select is((select horas || '/' || estado || '/' || (origen_id = :'h4')::text from public.horas_registradas where origen_id = :'h4'), '2.00/extra_pendiente_cliente/true', 'y el sobrante (2 h) queda como extra pendiente del cliente');
select is((select horas_usadas || '/' || horas_extra from public.bolsa_mensual where id = :'bolsa_a'), '10.00/2.00', 'la bolsa queda llena y cuenta 2 horas extra');
select is((select count(*)::int from public.bolsa_avisos where bolsa_id = :'bolsa_a'), 2, 'el historial de avisos tiene el 80 % y el 100 %');
select is((select porcentaje from public.bolsa_avisos where bolsa_id = :'bolsa_a' and tipo = '100_por_ciento'), 100.00::numeric, 'aviso del 100 %');
select tests.admin();
select is((select count(*)::int from public.outbox_correos where tipo = 'horas_extra_pendientes' and destinatario_user_id = tests.id('admin_a')), 1, 'las horas extra avisan al admin del cliente para que decida');
select tests.como(tests.id('admin_a'));
select is(tests.contar('select 1 from public.horas_registradas where estado = ''extra_pendiente_cliente'''), 1::bigint, 'el admin del cliente ve las horas extra pendientes');
select is(tests.contar('select 1 from public.bolsa_avisos'), 2::bigint, 'y el historial de avisos de su bolsa');
select tests.como(tests.id('equipo_a'));
select ok(tests.error_es(format($$select public.decidir_horas_extra(%L, true)$$, (select id from public.horas_registradas where origen_id = :'h4')), 'no_autorizado'), 'el equipo del cliente no decide horas extra');
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.decidir_horas_extra(%L, true)$$, :'h4'), 'no_autorizado'), 'el super admin no decide por el cliente');
select tests.admin();
select id as h4x from public.horas_registradas where origen_id = :'h4' \gset
select tests.como(tests.id('admin_a'));
select is(public.decidir_horas_extra(:'h4x', true) ->> 'estado', 'extra_aprobada', 'el admin del cliente aprueba las horas extra');
select ok(tests.error_es(format($$select public.decidir_horas_extra(%L, false)$$, :'h4x'), 'hora_no_encontrada'), 'una decision ya tomada no se cambia');
select is((select decidido_cliente_por from public.horas_registradas where id = :'h4x'), tests.id('admin_a'), 'queda quien decidio');

-- ---------- Con la bolsa llena no se sigue trabajando sin autorizacion del cliente ----------
select tests.como(tests.id('sa'), 'aal2');
select public.clasificar_ticket(:'t2', 'alta');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'en_progreso')$$, :'t2'), 'bolsa_agotada_sin_autorizacion'), 'bolsa agotada: no se empieza trabajo nuevo sin aprobacion del cliente');
select tests.como(tests.id('equipo_a'));
select ok(tests.error_es(format($$select public.autorizar_horas_extra(%L)$$, :'bolsa_a'), 'no_autorizado'), 'el equipo no autoriza horas extra');
select tests.como(tests.id('admin_a'));
select is(public.autorizar_horas_extra(:'bolsa_a') ->> 'extra_autorizado', 'true', 'el admin del cliente autoriza las horas extra del mes');
select tests.como(tests.id('sa'), 'aal2');
select is(public.cambiar_estado_ticket(:'t2', 'en_progreso') ->> 'estado', 'en_progreso', 'con autorizacion, el trabajo sigue');
select public.anotar_horas_ticket(:'t2', 1.5);
select id as h5 from public.horas_registradas where ticket_id = :'t2' and estado = 'pendiente_dueno' \gset
select is(public.revisar_horas(:'h5', true) ->> 'estado', 'extra_aprobada', 'con la bolsa llena y horas autorizadas, lo nuevo nace como extra aprobada');
select is((select horas_usadas || '/' || horas_extra from public.bolsa_mensual where id = :'bolsa_a'), '10.00/3.50', 'la bolsa sigue en 10 y las extra suben a 3.5');
select is((select count(*)::int from public.bolsa_avisos where bolsa_id = :'bolsa_a'), 2, 'no se repiten los avisos');

-- ---------- Bolsa de B (acumula): 4 h usadas de 10 ----------
select public.anotar_horas_ticket(:'tb', 4);
select id as hb from public.horas_registradas where ticket_id = :'tb' \gset
select public.revisar_horas(:'hb', true);
-- Pendiente al cortar el mes: se anota otra hora y no se revisa
select public.anotar_horas_ticket(:'t1', 1) ->> 'estado' as x \gset
select id as h_pend from public.horas_registradas where ticket_id = :'t1' and estado = 'pendiente_dueno' \gset

-- Empresa pausada con una bolsa vieja abierta
select tests.admin();
insert into public.planes_mantenimiento (empresa_id, activo, fecha_inicio, cuota_mensual, horas_mes) values (tests.id('empresa_c'), true, current_date - 90, 1000, 5);
insert into public.bolsa_mensual (empresa_id, plan_id, mes, horas_incluidas)
  select empresa_id, id, (:'mes_actual'::date - interval '1 month')::date, 5 from public.planes_mantenimiento where empresa_id = tests.id('empresa_c');

-- ---------- Corte del mes 1 ----------
select is((private.cerrar_mes_bolsas(:'corte1') ->> 'bolsas_cerradas')::int, 2, 'el corte cierra las bolsas de A y B (la empresa pausada se salta)');
select is((select horas_perdidas || '/' || horas_acumuladas from public.bolsa_mensual where id = :'bolsa_a'), '0.00/0.00', 'A: la bolsa estaba llena: nada que perder');
select is((select horas_perdidas || '/' || horas_acumuladas from public.bolsa_mensual where id = :'bolsa_b'), '0.00/6.00', 'B (acumula): 6 horas sin usar pasan al mes siguiente');
select is((select horas_arrastradas || '/' || horas_incluidas from public.bolsa_mensual where empresa_id = tests.id('empresa_b') and mes = :'corte1'::date - 1 + 1 - extract(day from :'corte1'::date)::int + 1 + 0), '6.00/10.00', 'la bolsa del mes siguiente de B trae 6 arrastradas y sus 10 horas');
select is((select count(*)::int from public.bolsa_mensual where empresa_id = tests.id('empresa_c') and cerrada_en is not null), 0, 'las empresas pausadas se saltan');
select is((private.cerrar_mes_bolsas(:'corte1') ->> 'bolsas_cerradas')::int, 0, 'correr el corte dos veces no repite trabajo');
select is((select count(*)::int from public.bolsa_mensual where empresa_id = tests.id('empresa_a')), 2, 'y no duplica las bolsas del mes siguiente');
select is((select count(*)::int from public.registro_actividad where accion = 'bolsa_cerrada' and actor_tipo = 'sistema'), 2, 'el corte queda en el registro como "sistema"');
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.revisar_horas(%L, true)$$, :'h_pend'), 'bolsa_cerrada'), 'unas horas pendientes de un mes ya cerrado no se descuentan en silencio');
select ok(tests.error_es(format($$select public.anotar_horas_ticket(%L, 1, null, %L)$$, :'t1', private.hoy()), 'bolsa_cerrada'), 'no se anotan horas en un mes cerrado');
select tests.admin();

-- A (no acumula): mes 2 con 4 usadas: se pierden 6
select id as bolsa_a2 from public.bolsa_mensual where empresa_id = tests.id('empresa_a') and mes > :'mes_actual'::date \gset
select id as bolsa_b2 from public.bolsa_mensual where empresa_id = tests.id('empresa_b') and mes > :'mes_actual'::date \gset
update public.bolsa_mensual set horas_usadas = 4 where id = :'bolsa_a2';
update public.bolsa_mensual set horas_usadas = 8 where id = :'bolsa_b2';
select is((private.cerrar_mes_bolsas(:'corte2') ->> 'bolsas_cerradas')::int, 2, 'corte del mes 2');
select is((select horas_perdidas || '/' || horas_acumuladas from public.bolsa_mensual where id = :'bolsa_a2'), '6.00/0.00', 'A (por defecto): las 6 horas sin usar se pierden (D-007)');
select is((select horas_arrastradas from public.bolsa_mensual where empresa_id = tests.id('empresa_a') and mes > (select mes from public.bolsa_mensual where id = :'bolsa_a2')), 0.00::numeric, 'y la bolsa siguiente de A empieza en cero');
-- B: 6 arrastradas + 10 propias, usa 8 (primero gasta lo arrastrado): sobran 8 propias -> pasan 8; las arrastradas no pasan otra vez
select is((select horas_perdidas || '/' || horas_acumuladas from public.bolsa_mensual where id = :'bolsa_b2'), '0.00/8.00', 'B (acumula): usa primero lo arrastrado; pasan solo las 8 horas propias sin usar');
-- Mes 3 sin uso: solo pasa como maximo UN mes de horas
select id as bolsa_b3 from public.bolsa_mensual where empresa_id = tests.id('empresa_b') and mes > (select mes from public.bolsa_mensual where id = :'bolsa_b2') \gset
select is((select horas_arrastradas from public.bolsa_mensual where id = :'bolsa_b3'), 8.00::numeric, 'el mes 3 de B arranca con 8 arrastradas');
select private.cerrar_mes_bolsas(:'corte3');
select is((select horas_acumuladas from public.bolsa_mensual where id = :'bolsa_b3'), 10.00::numeric, 'sin usar nada: pasa como maximo un mes de horas (10), no se acumula sin limite');
select is((select horas_perdidas from public.bolsa_mensual where id = :'bolsa_b3'), 8.00::numeric, 'las 8 arrastradas ya vencieron');

-- ---------- Plan apagado en el corte: no se crea bolsa nueva ----------
select tests.como(tests.id('sa'), 'aal2');
select public.apagar_mantenimiento(tests.id('empresa_a'), 'Termino el contrato');
select tests.admin();
select (date_trunc('month', private.hoy()::timestamp) + interval '4 months' + interval '1 day')::date as corte4 \gset
select count(*)::int as antes from public.bolsa_mensual where empresa_id = tests.id('empresa_a') \gset
select private.cerrar_mes_bolsas(:'corte4');
select is((select count(*)::int from public.bolsa_mensual where empresa_id = tests.id('empresa_a')), :'antes'::int, 'con el plan apagado el corte no crea mas bolsas');

select * from finish();
rollback;
