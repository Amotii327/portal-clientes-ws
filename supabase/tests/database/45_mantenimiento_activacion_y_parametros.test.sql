-- Sprint 6 · Mantenimiento por empresa: apagado por defecto, solo el super admin (2FA) lo activa, planes base
-- como punto de partida, parametros personalizables, historial con motivo, cambios "desde hoy" o "desde el
-- proximo mes", y sin activacion no hay mantenimiento.
begin;
select plan(78);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

select tests.hoy_mas(-3) as inicio \gset
select tests.hoy_mas(40) as futuro \gset

-- ---------- Sin activacion no hay mantenimiento ----------
select is((select count(*)::int from public.planes_mantenimiento), 0, 'una empresa nueva no tiene plan: el mantenimiento esta apagado por defecto');
select is(private.mantenimiento_vigente(tests.id('empresa_a')), false, 'sin plan, el mantenimiento no esta vigente');
select is((select count(*)::int from public.bolsa_mensual), 0, 'sin plan no hay bolsa de horas');
select tests.como(tests.id('admin_a'));
select is(public.mi_mantenimiento_activo(), false, 'el cliente no ve el modulo (ni el hito 13 activo)');
select is(tests.contar('select 1 from public.planes_mantenimiento'), 0::bigint, 'el cliente no ve ningun plan');
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.anotar_horas_ticket(%L, 1)$$, gen_random_uuid()), 'ticket_no_encontrado'), 'no se anotan horas de un ticket que no existe');
select tests.admin();
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'alta') as t1 \gset
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.anotar_horas_ticket(%L, 1)$$, :'t1'), 'mantenimiento_no_activo'), 'sin mantenimiento activo no se anotan horas a la bolsa');
select ok(tests.error_es(format($$select public.configurar_mantenimiento(%L, '{"horas_mes": 5}', 'cambio')$$, tests.id('empresa_a')), 'mantenimiento_no_activo'), 'no se configura lo que no esta activo');
select ok(tests.error_es(format($$select public.apagar_mantenimiento(%L, 'motivo')$$, tests.id('empresa_a')), 'mantenimiento_no_activo'), 'no se apaga lo que no esta activo');

-- ---------- Planes base: punto de partida, sin precios ----------
select is((select count(*)::int from public.planes_base_mantenimiento), 3, 'hay 3 planes base: Basico, Estandar y Premium');
select is((select count(*)::int from public.planes_base_mantenimiento where parametros ? 'cuota_mensual' or parametros ? 'valor_hora_extra' or parametros ? 'fecha_inicio'), 0, 'los planes base no traen precios ni fechas (el portal no inventa precios)');
select throws_ok($$update public.planes_base_mantenimiento set parametros = '{"cuota_mensual": 100}' where plan = 'basico'$$, '23514', null, 'un plan base no puede traer cuota');
select throws_ok($$update public.planes_base_mantenimiento set parametros = '{"inventado": 1}' where plan = 'basico'$$, '23514', null, 'un plan base solo admite parametros conocidos');

-- ---------- Activar ----------
select tests.como(tests.id('equipo_a'));
select ok(tests.error_es($$select public.activar_mantenimiento(tests.id('empresa_a'), 'basico', '{}')$$, 'no_autorizado'), 'el equipo del cliente no activa');
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', '{}')$$, gen_random_uuid()), 'empresa_no_encontrada'), 'empresa que no existe');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', '{}')$$, tests.id('empresa_c')), 'empresa_no_disponible'), 'no se activa en una empresa pausada');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'gold', '{}')$$, tests.id('empresa_a')), 'datos_invalidos'), 'plan base desconocido');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', %L)$$, tests.id('empresa_a'), jsonb_build_object('fecha_inicio', :'inicio')), 'cuota_requerida'), 'sin cuota no se activa (el portal no inventa precios)');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', '{"cuota_mensual": 100000}')$$, tests.id('empresa_a')), 'fecha_inicio_requerida'), 'sin fecha de inicio no se activa');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', %L)$$, tests.id('empresa_a'), jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 100000, 'precio_magico', 1)), 'parametro_invalido'), 'un parametro desconocido se rechaza');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', %L)$$, tests.id('empresa_a'), jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', -5)), 'parametros_invalidos'), 'cuota negativa se rechaza');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', %L)$$, tests.id('empresa_a'), jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 100000, 'horario_desde', '19:00')), 'parametros_invalidos'), 'horario al reves se rechaza');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', %L)$$, tests.id('empresa_a'), jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 100000, 'tiempos_respuesta', '{"urgente": {"horas_habiles": 0}}'::jsonb)), 'parametros_invalidos'), 'tiempos de respuesta invalidos se rechazan');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', %L)$$, tests.id('empresa_a'), jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 100000, 'incluye', array['regalos'])), 'parametros_invalidos'), 'solo las casillas conocidas en "incluye"');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', %L)$$, tests.id('empresa_a'), jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 100000, 'zona_horaria', 'Marte/Olimpo')), 'parametros_invalidos'), 'zona horaria inexistente');
select is((select count(*)::int from public.planes_mantenimiento), 0, 'los intentos fallidos no dejaron nada a medias');
select lives_ok(format($$select public.activar_mantenimiento(%L, 'estandar', %L, 'Contrato firmado')$$, tests.id('empresa_a'),
  jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 850000, 'valor_hora_extra', 90000, 'horas_mes', 10)), 'el super admin activa el plan Estandar de A, ajustando las horas');
select is((select activo from public.planes_mantenimiento where empresa_id = tests.id('empresa_a')), true, 'queda activo');
select is((select plan_base || '/' || horas_mes::text || '/' || revisiones_por_semana::text || '/' || acumular_horas::text from public.planes_mantenimiento where empresa_id = tests.id('empresa_a')), 'estandar/10.00/2/false', 'parte del plan base y respeta lo que el super admin ajusto; por defecto las horas se pierden (D-007)');
select is((select cuota_mensual from public.planes_mantenimiento where empresa_id = tests.id('empresa_a')), 850000.00::numeric, 'la cuota la escribe el super admin');
select is((select count(*)::int from public.bolsa_mensual where empresa_id = tests.id('empresa_a')), 1, 'al activar nace la bolsa del mes');
select is((select horas_incluidas from public.bolsa_mensual where empresa_id = tests.id('empresa_a')), 10.00::numeric, 'con las horas del plan');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'basico', '{}')$$, tests.id('empresa_a')), 'mantenimiento_ya_activo'), 'no se activa dos veces');
select is((select count(*)::int from public.planes_mantenimiento_historial where tipo = 'activacion' and motivo = 'Contrato firmado'), 1, 'la activacion queda en el historial con su motivo');
select is((select count(*)::int from public.registro_actividad where accion = 'mantenimiento_activado' and empresa_id = tests.id('empresa_a') and actor_id = tests.id('sa')), 1, 'y en el registro de actividad (quien y cuando)');
-- Visibilidad
select tests.como(tests.id('admin_a'));
select is(public.mi_mantenimiento_activo(), true, 'el admin del cliente ya ve el modulo');
select is((select horas_mes from public.planes_mantenimiento), 10.00::numeric, 'el admin ve su plan');
select tests.como(tests.id('admin_b'));
select is(public.mi_mantenimiento_activo(), false, 'otra empresa sin plan no lo ve');
select is(tests.contar('select 1 from public.planes_mantenimiento'), 0::bigint, 'y no ve el plan de A');

-- ---------- Personalizado ----------
select tests.como(tests.id('sa'), 'aal2');
select lives_ok(format($$select public.activar_mantenimiento(%L, 'personalizado', %L)$$, tests.id('empresa_b'),
  jsonb_build_object('fecha_inicio', :'inicio', 'fecha_fin', :'futuro', 'renovacion_automatica', false, 'cuota_mensual', 200000,
    'horas_mes', 3, 'acumular_horas', true, 'revisiones_por_semana', 5, 'dias_atencion', array[1,2,3], 'horario_desde', '09:00',
    'horario_hasta', '13:00', 'copias_frecuencia', 'semanal', 'parches_frecuencia', 'trimestral', 'auditoria', true,
    'auditoria_cada_meses', 6, 'reuniones_por_mes', 2, 'reporte_tipo', 'detallado', 'servidores_incluidos', true,
    'servidores_costo_mensual', 45000, 'incluye', array['monitoreo', 'copias_seguridad'], 'incluye_otros', 'Soporte de dominio')),
  'activar un plan a la medida con todos los parametros');
select is((select plan_base || '/' || acumular_horas::text || '/' || auditoria_cada_meses::text || '/' || reporte_tipo from public.planes_mantenimiento where empresa_id = tests.id('empresa_b')),
  'personalizado/true/6/detallado', 'los parametros quedan como se pidieron (acumular por cliente, D-007)');
select is((select incluye from public.planes_mantenimiento where empresa_id = tests.id('empresa_b')), array['monitoreo', 'copias_seguridad'], 'las casillas de lo que incluye');

-- ---------- Configurar ----------
select ok(tests.error_es(format($$select public.configurar_mantenimiento(%L, '{}', 'motivo')$$, tests.id('empresa_a')), 'datos_invalidos'), 'sin cambios no hay nada que hacer');
select ok(tests.error_es(format($$select public.configurar_mantenimiento(%L, '{"horas_mes": 12}', '')$$, tests.id('empresa_a')), 'motivo_requerido'), 'todo cambio lleva motivo');
select ok(tests.error_es(format($$select public.configurar_mantenimiento(%L, '{"horas_mes": 12}', 'x')$$, tests.id('empresa_a')), 'motivo_requerido'), 'el motivo debe tener sentido');
select ok(tests.error_es(format($$select public.configurar_mantenimiento(%L, '{"activo": false}', 'apagar por la puerta de atras')$$, tests.id('empresa_a')), 'parametro_invalido'), 'apagar no se hace como parametro: tiene su propia funcion');
select ok(tests.error_es(format($$select public.configurar_mantenimiento(%L, '{"horas_mes": 12}', 'motivo', 'ayer')$$, tests.id('empresa_a')), 'datos_invalidos'), 'solo "hoy" o "proximo_mes"');
select ok(tests.error_es(format($$select public.configurar_mantenimiento(%L, '{"horas_mes": 5000}', 'motivo')$$, tests.id('empresa_a')), 'parametros_invalidos'), 'un valor fuera de rango se rechaza ya, no en el corte del mes');
-- Desde hoy
select is(public.configurar_mantenimiento(tests.id('empresa_a')::uuid, '{"horas_mes": 12, "revisiones_por_semana": 3}', 'Ampliacion pactada', 'hoy') ->> 'aplicado', 'true', 'cambio desde hoy: se aplica ya');
select is((select horas_mes || '/' || revisiones_por_semana from public.planes_mantenimiento where empresa_id = tests.id('empresa_a')), '12.00/3', 'el plan cambia');
select is((select horas_incluidas from public.bolsa_mensual where empresa_id = tests.id('empresa_a')), 12.00::numeric, 'y la bolsa abierta del mes toma las nuevas horas');
select is((select parametros_anteriores ->> 'horas_mes' from public.planes_mantenimiento_historial where motivo = 'Ampliacion pactada'), '10.00', 'el historial guarda el valor anterior');
select is((select parametros_nuevos ->> 'horas_mes' from public.planes_mantenimiento_historial where motivo = 'Ampliacion pactada'), '12', 'y el nuevo');
-- Desde el proximo mes (por defecto)
select is(public.configurar_mantenimiento(tests.id('empresa_a')::uuid, '{"horas_mes": 20, "acumular_horas": true}', 'Plan superior desde el mes que viene') ->> 'aplicado', 'false', 'por defecto el cambio aplica desde el proximo mes');
select is((select horas_mes from public.planes_mantenimiento where empresa_id = tests.id('empresa_a')), 12.00::numeric, 'todavia no cambia nada');
select is((select efectivo_desde from public.planes_mantenimiento_historial where motivo = 'Plan superior desde el mes que viene'), (date_trunc('month', private.hoy()::timestamp) + interval '1 month')::date, 'efectivo desde el primer dia del proximo mes');
select is((select aplicado_en is null from public.planes_mantenimiento_historial where motivo = 'Plan superior desde el mes que viene'), true, 'queda programado (sin aplicar)');
-- El corte del mes lo aplica (y no lo repite)
select tests.admin();
select is((private.cerrar_mes_bolsas((date_trunc('month', private.hoy()::timestamp) + interval '1 month')::date) ->> 'cambios_aplicados')::int, 1, 'el corte del mes aplica el cambio programado');
select is((select horas_mes || '/' || acumular_horas::text from public.planes_mantenimiento where empresa_id = tests.id('empresa_a')), '20.00/true', 'el plan ya tiene los nuevos valores');
select is((private.cerrar_mes_bolsas((date_trunc('month', private.hoy()::timestamp) + interval '1 month')::date) ->> 'cambios_aplicados')::int, 0, 'correrlo otra vez no repite el cambio');
select is((select aplicado_en is not null from public.planes_mantenimiento_historial where motivo = 'Plan superior desde el mes que viene'), true, 'queda marcado como aplicado');
select is((select count(*)::int from public.registro_actividad where accion = 'mantenimiento_cambio_programado' and empresa_id = tests.id('empresa_a')), 1, 'programar un cambio queda en el registro');
select cmp_ok((select count(*)::int from public.registro_actividad where accion = 'mantenimiento_parametros_cambiados' and empresa_id = tests.id('empresa_a')), '>=', 2, 'cada cambio de parametros queda en el registro');
-- Un cambio programado que dejo de ser valido no frena a los demas
select tests.como(tests.id('sa'), 'aal2');
select public.configurar_mantenimiento(tests.id('empresa_b')::uuid, '{"fecha_fin": null, "renovacion_automatica": true}', 'Se vuelve renovable');
select public.configurar_mantenimiento(tests.id('empresa_a')::uuid, '{"reuniones_por_mes": 4}', 'Reuniones adicionales');
select tests.admin();
select tests.como(tests.id('sa'), 'aal2');

-- ---------- Apagar ----------
select ok(tests.error_es(format($$select public.apagar_mantenimiento(%L, '')$$, tests.id('empresa_a')), 'motivo_requerido'), 'apagar exige motivo');
select lives_ok(format($$select public.apagar_mantenimiento(%L, 'El cliente no renovo')$$, tests.id('empresa_b')), 'el super admin apaga el plan de B');
select is((select activo from public.planes_mantenimiento where empresa_id = tests.id('empresa_b')), false, 'queda apagado (sus parametros se conservan)');
select tests.admin();
select is(private.mantenimiento_vigente(tests.id('empresa_b')), false, 'apagado = no vigente');
select tests.como(tests.id('admin_b'));
select is(tests.contar('select 1 from public.planes_mantenimiento'), 0::bigint, 'el cliente ya no ve el plan apagado');
select is(tests.contar('select 1 from public.bolsa_mensual'), 0::bigint, 'ni la bolsa');
select is(public.mi_mantenimiento_activo(), false, 'ni el modulo');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.planes_mantenimiento_historial where empresa_id = tests.id('empresa_b') and tipo = 'apagado' and motivo = 'El cliente no renovo'), 1, 'apagar queda en el historial');
-- Reactivar
select lives_ok(format($$select public.activar_mantenimiento(%L, 'basico', %L)$$, tests.id('empresa_b'), jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 250000)), 'se puede reactivar');
select is((select activo from public.planes_mantenimiento where empresa_id = tests.id('empresa_b')), true, 'queda activo otra vez');
select is((select count(*)::int from public.planes_mantenimiento where empresa_id = tests.id('empresa_b')), 1, 'sigue habiendo un solo plan por empresa');

-- ---------- Restricciones de la tabla (como superusuario) ----------
select tests.admin();
select throws_ok($$insert into public.planes_mantenimiento (empresa_id, activo) values (tests.id('empresa_c'), true)$$, '23514', null, 'un plan activo exige cuota y fecha de inicio');
select throws_ok(format($$insert into public.planes_mantenimiento (empresa_id) values (%L)$$, tests.id('empresa_a')), '23505', null, 'una empresa no puede tener dos planes');
select throws_ok(format($$update public.planes_mantenimiento set auditoria = true where empresa_id = %L$$, tests.id('empresa_b')), '23514', null, 'auditoria si/no coherente con "cada cuantos meses"');
select throws_ok(format($$update public.planes_mantenimiento set renovacion_automatica = false, fecha_fin = null where empresa_id = %L$$, tests.id('empresa_b')), '23514', null, 'sin renovacion automatica debe tener fecha de fin');

select * from finish();
rollback;
