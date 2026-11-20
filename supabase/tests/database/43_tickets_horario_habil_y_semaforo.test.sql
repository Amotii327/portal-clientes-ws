-- Sprint 5 · Tiempo de primera respuesta con horario habil (D-002: lunes a viernes, 8 a. m. a 6 p. m.,
-- hora Colombia, sin festivos), tiempos por defecto (D-003), tiempos del plan de mantenimiento y semaforo.
-- 2027-01-08 es viernes; 2027-01-11 es lunes. Hora de Colombia = UTC-5.
begin;
select plan(65);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

-- ---------- Las piezas: sumar y contar minutos habiles ----------
select is(private.sumar_minutos_habiles('2027-01-08 17:00-05', 120, '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), '2027-01-11 09:00-05'::timestamptz, 'viernes 5 p. m. + 2 horas habiles = lunes 9 a. m.');
select is(private.sumar_minutos_habiles('2027-01-09 10:00-05', 120, '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), '2027-01-11 10:00-05'::timestamptz, 'el sabado no cuenta: el reloj arranca el lunes a las 8');
select is(private.sumar_minutos_habiles('2027-01-11 07:00-05', 120, '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), '2027-01-11 10:00-05'::timestamptz, 'antes de abrir: el reloj arranca a las 8');
select is(private.sumar_minutos_habiles('2027-01-11 16:00-05', 120, '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), '2027-01-11 18:00-05'::timestamptz, 'justo hasta el cierre');
select is(private.sumar_minutos_habiles('2027-01-11 17:30-05', 120, '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), '2027-01-12 09:30-05'::timestamptz, 'lo que sobra pasa al siguiente dia habil');
select is(private.sumar_minutos_habiles('2027-01-11 19:00-05', 60, '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), '2027-01-12 09:00-05'::timestamptz, 'despues del cierre arranca al dia siguiente');
select is(private.minutos_habiles_entre('2027-01-08 16:00-05', '2027-01-11 10:00-05', '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), 240::numeric, 'de viernes 4 p. m. a lunes 10 a. m. hay 4 horas habiles');
select is(private.minutos_habiles_entre('2027-01-08 12:00-05', '2027-01-09 12:00-05', '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), 360::numeric, 'viernes 12 a sabado 12: solo cuenta el viernes (6 horas)');
select is(private.minutos_habiles_entre('2027-01-13 08:00-05', '2027-01-14 18:00-05', '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), 1200::numeric, 'dos jornadas completas = 20 horas');
select is(private.minutos_habiles_entre('2027-01-11 10:00-05', '2027-01-11 09:00-05', '{1,2,3,4,5}', '08:00', '18:00', 'America/Bogota'), 0::numeric, 'un rango al reves da cero');
select ok(tests.error_es($$select private.sumar_minutos_habiles(now(), 60, '{}', '08:00', '18:00', 'America/Bogota')$$, 'horario_invalido'), 'un horario sin dias se rechaza');
select ok(tests.error_es($$select private.sumar_minutos_habiles(now(), 60, '{1}', '18:00', '08:00', 'America/Bogota')$$, 'horario_invalido'), 'un horario al reves se rechaza');

-- ---------- Tiempos por defecto (D-003) al crear el ticket ----------
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'urgente', '2027-01-08 17:00-05') as u_vie \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'urgente', '2027-01-09 10:00-05') as u_sab \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'urgente', '2027-01-10 12:00-05') as u_dom \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'urgente', '2027-01-11 07:00-05') as u_antes \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'urgente', '2027-01-11 17:30-05') as u_tarde \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'urgente', '2027-01-11 09:00-05') as u_lun \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'alta', '2027-01-11 09:00-05') as a_lun \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'alta', '2027-01-08 14:00-05') as a_vie \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'pregunta', 'normal', '2027-01-11 09:00-05') as n_lun \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'pregunta', 'normal', '2027-01-14 15:00-05') as n_jue \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'pregunta', 'baja', '2027-01-11 09:00-05') as b_lun \gset

select is((select vence_primera_respuesta from public.tickets where id = :'u_vie'), '2027-01-11 09:00-05'::timestamptz, 'urgente creado viernes 5 p. m. vence lunes 9 a. m.');
select is((select vence_primera_respuesta from public.tickets where id = :'u_sab'), '2027-01-11 10:00-05'::timestamptz, 'urgente creado sabado vence lunes 10 a. m.');
select is((select vence_primera_respuesta from public.tickets where id = :'u_dom'), '2027-01-11 10:00-05'::timestamptz, 'urgente creado domingo vence lunes 10 a. m.');
select is((select vence_primera_respuesta from public.tickets where id = :'u_antes'), '2027-01-11 10:00-05'::timestamptz, 'urgente creado antes de las 8 vence a las 10');
select is((select vence_primera_respuesta from public.tickets where id = :'u_tarde'), '2027-01-12 09:30-05'::timestamptz, 'urgente creado a las 5:30 p. m. vence al dia siguiente 9:30 a. m.');
select is((select vence_primera_respuesta from public.tickets where id = :'a_lun'), '2027-01-12 09:00-05'::timestamptz, 'alta: 1 dia habil = misma hora del siguiente dia habil');
select is((select vence_primera_respuesta from public.tickets where id = :'a_vie'), '2027-01-11 14:00-05'::timestamptz, 'alta creada viernes 2 p. m. vence lunes 2 p. m.');
select is((select vence_primera_respuesta from public.tickets where id = :'n_lun'), '2027-01-13 09:00-05'::timestamptz, 'normal: 2 dias habiles');
select is((select vence_primera_respuesta from public.tickets where id = :'n_jue'), '2027-01-18 15:00-05'::timestamptz, 'normal creado jueves 3 p. m. vence el lunes 3 p. m. (salta el fin de semana)');
select is((select vence_primera_respuesta from public.tickets where id = :'b_lun'), null::timestamptz, 'baja: siguiente planeacion, sin fecha limite');
select is((select plazo_habil_minutos from public.tickets where id = :'u_vie'), 120::numeric, 'urgente: 120 minutos habiles');
select is((select plazo_habil_minutos from public.tickets where id = :'a_lun'), 600::numeric, 'alta: 600 minutos habiles (una jornada)');
select is((select sla_origen from public.tickets where id = :'u_vie'), 'predeterminado', 'sin mantenimiento valen los tiempos por defecto');

-- ---------- Semaforo ----------
-- urgente creado lunes 9 a. m.: vence 11 a. m., plazo 120 min
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, null, '2027-01-11 09:00-05'), 'verde', 'recien creado: verde');
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, null, '2027-01-11 09:59-05'), 'verde', 'con mas de la mitad del plazo: verde');
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, null, '2027-01-11 10:00-05'), 'amarillo', 'con la mitad del plazo: amarillo');
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, null, '2027-01-11 11:00-05'), 'amarillo', 'justo en el limite aun no esta vencido');
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, null, '2027-01-11 11:01-05'), 'rojo', 'vencido: rojo');
select is(private.semaforo_en(tests.id('empresa_a'), 'clasificado', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, '2027-01-11 10:30-05', '2027-01-12 09:00-05'), 'cumplido', 'respondido a tiempo: cumplido');
select is(private.semaforo_en(tests.id('empresa_a'), 'clasificado', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, '2027-01-11 11:30-05', '2027-01-12 09:00-05'), 'incumplido', 'respondido tarde: incumplido');
select is(private.semaforo_en(tests.id('empresa_a'), 'cerrado', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, null, '2027-01-13 09:00-05'), 'cerrado', 'cerrado sin respuesta no se pinta de rojo');
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-11 09:00-05', null, null, null, '2027-01-13 09:00-05'), 'sin_plazo', 'baja: sin plazo');
-- fin de semana: el reloj no corre
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-08 17:00-05', '2027-01-11 09:00-05', 120, null, '2027-01-08 17:00-05'), 'verde', 'creado viernes 5 p. m.: verde');
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-08 17:00-05', '2027-01-11 09:00-05', 120, null, '2027-01-08 17:30-05'), 'verde', 'viernes 5:30: aun verde (quedan 90 de 120)');
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-08 17:00-05', '2027-01-11 09:00-05', 120, null, '2027-01-08 18:00-05'), 'amarillo', 'al cierre del viernes: amarillo');
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-08 17:00-05', '2027-01-11 09:00-05', 120, null, '2027-01-10 12:00-05'), 'amarillo', 'el domingo sigue igual (el fin de semana no gasta tiempo)');
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-08 17:00-05', '2027-01-11 09:00-05', 120, null, '2027-01-11 09:01-05'), 'rojo', 'el lunes a las 9:01 ya vencio');
-- minutos que faltan o de retraso
select is(private.minutos_restantes_en(tests.id('empresa_a'), 'nuevo', '2027-01-08 17:00-05', '2027-01-11 09:00-05', null, '2027-01-10 12:00-05'), 60::numeric, 'quedan 60 minutos habiles el domingo');
select is(private.minutos_restantes_en(tests.id('empresa_a'), 'nuevo', '2027-01-11 09:00-05', '2027-01-11 11:00-05', null, '2027-01-11 11:30-05'), -30::numeric, 'retraso de 30 minutos habiles (negativo)');
select is(private.minutos_restantes_en(tests.id('empresa_a'), 'clasificado', '2027-01-11 09:00-05', '2027-01-11 11:00-05', '2027-01-11 10:00-05', '2027-01-11 11:30-05'), null::numeric, 'respondido: no hay tiempo pendiente');
-- el umbral amarillo se lee de la configuracion (y un valor roto vuelve al 50 %)
update public.configuracion set valor = '{"amarillo_restante_pct": 80}' where clave = 'semaforo_tickets';
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, null, '2027-01-11 09:30-05'), 'amarillo', 'con umbral 80 %, a 75 % restante ya es amarillo');
update public.configuracion set valor = '{"amarillo_restante_pct": "abc"}' where clave = 'semaforo_tickets';
select is(private.semaforo_en(tests.id('empresa_a'), 'nuevo', '2027-01-11 09:00-05', '2027-01-11 11:00-05', 120, null, '2027-01-11 09:30-05'), 'verde', 'un umbral invalido vuelve al 50 %');
update public.configuracion set valor = '{"amarillo_restante_pct": 50}' where clave = 'semaforo_tickets';

-- La vista que ve el super admin usa la hora de ahora
select tests.hoy_mas(-30) as inicio \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'urgente', now() - interval '30 days') as v_viejo \gset
select tests.como(tests.id('sa'), 'aal2');
select is((select semaforo from public.tickets_semaforo where ticket_id = :'v_viejo'), 'rojo', 'vista: un urgente de hace 30 dias sin respuesta esta en rojo');
select is((select semaforo from public.tickets_semaforo where ticket_id = :'b_lun'), 'sin_plazo', 'vista: la prioridad baja no tiene plazo');
select is((select semaforo from public.tickets_semaforo where ticket_id = :'u_lun'), 'verde', 'vista: un ticket con plazo lejano esta en verde');
select cmp_ok((select minutos_habiles_restantes from public.tickets_semaforo where ticket_id = :'v_viejo'), '<', 0::numeric, 'vista: muestra el retraso en minutos habiles (negativo)');

-- ---------- Tiempos y horario del plan de mantenimiento (si esta activo) ----------
select lives_ok(format($$select public.activar_mantenimiento(%L, 'premium', %L)$$, tests.id('empresa_a'),
  jsonb_build_object('cuota_mensual', 1500000, 'fecha_inicio', :'inicio')), 'activar el plan premium de A');
select lives_ok(format($$select public.activar_mantenimiento(%L, 'personalizado', %L)$$, tests.id('empresa_b'),
  jsonb_build_object('cuota_mensual', 300000, 'horas_mes', 5, 'fecha_inicio', :'inicio', 'dias_atencion', array[1,2,3,4,5,6],
                     'horario_desde', '07:00', 'horario_hasta', '12:00', 'tiempos_respuesta', jsonb_build_object('urgente', jsonb_build_object('horas_habiles', 1)))),
  'activar un plan personalizado de B con horario propio (lunes a sabado, 7 a 12)');
select tests.admin();
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'urgente', '2027-01-11 09:00-05') as p_urg \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'alta', '2027-01-11 09:00-05') as p_alta \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'normal', '2027-01-11 09:00-05') as p_norm \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'baja', '2027-01-11 09:00-05') as p_baja \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'urgente', '2026-10-01 09:00-05') as p_antes \gset
select is((select vence_primera_respuesta from public.tickets where id = :'p_urg'), '2027-01-11 10:00-05'::timestamptz, 'con plan premium: urgente = 1 hora habil');
select is((select sla_origen from public.tickets where id = :'p_urg'), 'mantenimiento', 'se marca que los tiempos vienen del plan');
select is((select vence_primera_respuesta from public.tickets where id = :'p_alta'), '2027-01-11 13:00-05'::timestamptz, 'con plan premium: alta = 4 horas habiles');
select is((select vence_primera_respuesta from public.tickets where id = :'p_norm'), '2027-01-12 09:00-05'::timestamptz, 'con plan premium: normal = 1 dia habil');
select is((select vence_primera_respuesta from public.tickets where id = :'p_baja'), null::timestamptz, 'prioridad baja sin tiempo en el plan: siguiente planeacion');
select is((select sla_origen from public.tickets where id = :'p_baja'), 'predeterminado', 'lo que el plan no define usa el valor por defecto');
select is((select vence_primera_respuesta from public.tickets where id = :'p_antes'), '2026-10-01 11:00-05'::timestamptz, 'un ticket anterior al inicio del plan usa los tiempos por defecto');
select tests.como(tests.id('sa'), 'aal2');
select is((public.clasificar_ticket(:'u_lun', 'normal') ->> 'vence_primera_respuesta')::timestamptz, '2027-01-12 09:00-05'::timestamptz, 'reclasificar a normal recalcula desde la creacion con el plan (1 dia)');
select is((select sla_origen from public.tickets where id = :'u_lun'), 'mantenimiento', 'y marca el origen del plan');
select tests.admin();
select tests.ticket_directo(tests.id('empresa_b'), tests.id('miembro_equipo_b'), tests.id('equipo_b'), 'error', 'urgente', '2027-01-09 08:00-05') as b_sab \gset
select tests.ticket_directo(tests.id('empresa_b'), tests.id('miembro_equipo_b'), tests.id('equipo_b'), 'error', 'urgente', '2027-01-09 11:30-05') as b_sab2 \gset
select tests.ticket_directo(tests.id('empresa_b'), tests.id('miembro_equipo_b'), tests.id('equipo_b'), 'error', 'alta', '2027-01-11 08:00-05') as b_alta \gset
select is((select vence_primera_respuesta from public.tickets where id = :'b_sab'), '2027-01-09 09:00-05'::timestamptz, 'plan con sabado habil: el sabado 8 a. m. + 1 hora = 9 a. m.');
select is((select vence_primera_respuesta from public.tickets where id = :'b_sab2'), '2027-01-11 07:30-05'::timestamptz, 'sabado 11:30 + 1 hora: 30 min el sabado y 30 min el lunes desde las 7');
select is((select vence_primera_respuesta from public.tickets where id = :'b_alta'), '2027-01-12 08:00-05'::timestamptz, 'alta (1 dia por defecto) con jornada de 5 horas: lunes 8 a. m. vence martes 8 a. m.');
select is((select plazo_habil_minutos from public.tickets where id = :'b_alta'), 300::numeric, 'un dia habil dura lo que dura la jornada del plan');
-- plan apagado: vuelven los valores por defecto
select tests.como(tests.id('sa'), 'aal2');
select lives_ok(format($$select public.apagar_mantenimiento(%L, 'Contrato terminado')$$, tests.id('empresa_b')), 'apagar el plan de B');
select tests.admin();
select tests.ticket_directo(tests.id('empresa_b'), tests.id('miembro_equipo_b'), tests.id('equipo_b'), 'error', 'urgente', '2027-01-09 08:00-05') as b_apagado \gset
select is((select vence_primera_respuesta from public.tickets where id = :'b_apagado'), '2027-01-11 10:00-05'::timestamptz, 'plan apagado: vale el horario por defecto (sabado no es habil)');

select * from finish();
rollback;
