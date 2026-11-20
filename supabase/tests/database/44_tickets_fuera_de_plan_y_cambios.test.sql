-- Sprint 5 · Seccion 10b: fuera de garantia y sin mantenimiento activo no se atienden tickets de soporte;
-- solicitudes de cambio: no se trabajan hasta que el dueno decida (cobrar, regalar o rechazar) y, si se cobra,
-- hasta que el admin del cliente acepte.
begin;
select plan(56);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

select tests.hoy_mas(-30) as inicio \gset
select tests.hoy_mas(-2) as ayer \gset

-- ---------- Cobertura al crear el ticket ----------
select tests.como(tests.id('equipo_a'));
select public.crear_ticket('error', 'Error sin cobertura', 'Detalle', 'alta') as r1 \gset
select is((:'r1'::jsonb ->> 'fuera_de_plan')::boolean, true, 'error sin garantia ni mantenimiento: fuera de plan');
select is(:'r1'::jsonb ->> 'motivo_fuera_de_plan', 'sin_mantenimiento', 'motivo: sin mantenimiento');
select (:'r1'::jsonb ->> 'ticket_id') as t_fp \gset
select is((public.crear_ticket('pregunta', 'Pregunta sin cobertura', 'Detalle') ->> 'fuera_de_plan')::boolean, true, 'una pregunta de soporte tambien queda fuera de plan');
select is((public.crear_ticket('acceso', 'Acceso sin cobertura', 'Detalle') ->> 'fuera_de_plan')::boolean, true, 'un acceso tambien');
select is((public.crear_ticket('solicitud_cambio', 'Cambio pedido', 'Quiero un boton nuevo') ->> 'fuera_de_plan')::boolean, false, 'una solicitud de cambio no es soporte: sigue su propio camino (no es fuera de plan)');
select id as t_cambio from public.tickets where titulo = 'Cambio pedido' \gset

-- Garantia vigente: cubre
select tests.admin();
insert into public.garantias (empresa_id, inicia_en, vence_en) values (tests.id('empresa_a'), current_date - 5, current_date + 25);
select tests.como(tests.id('equipo_a'));
select is((public.crear_ticket('error', 'Error en garantia', 'Detalle') ->> 'fuera_de_plan')::boolean, false, 'con garantia vigente: cubierto');
-- Garantia vencida: no cubre
select tests.admin();
update public.garantias set inicia_en = current_date - 40, vence_en = current_date - 10 where empresa_id = tests.id('empresa_a');
select tests.como(tests.id('equipo_a'));
select is((public.crear_ticket('error', 'Error tras la garantia', 'Detalle') ->> 'fuera_de_plan')::boolean, true, 'garantia vencida: fuera de plan');
-- La garantia de B no cubre a A
select tests.admin();
insert into public.garantias (empresa_id, inicia_en, vence_en) values (tests.id('empresa_b'), current_date - 5, current_date + 25);
select tests.como(tests.id('equipo_a'));
select is((public.crear_ticket('error', 'Otro error', 'Detalle') ->> 'fuera_de_plan')::boolean, true, 'la garantia de otra empresa no cubre');

-- Mantenimiento activo: cubre errores si incluye correccion de errores
select tests.como(tests.id('sa'), 'aal2');
select lives_ok(format($$select public.activar_mantenimiento(%L, 'basico', %L)$$, tests.id('empresa_a'),
  jsonb_build_object('cuota_mensual', 400000, 'fecha_inicio', :'inicio')), 'activar mantenimiento basico en A');
select tests.como(tests.id('equipo_a'));
select is((public.crear_ticket('error', 'Error con plan', 'Detalle') ->> 'fuera_de_plan')::boolean, false, 'con mantenimiento vigente: cubierto');
select is((public.crear_ticket('pregunta', 'Pregunta con plan', 'Detalle') ->> 'fuera_de_plan')::boolean, false, 'una pregunta con plan: cubierta');
-- Plan sin "correccion de errores": un error queda fuera de plan
select tests.como(tests.id('sa'), 'aal2');
select lives_ok(format($$select public.configurar_mantenimiento(%L, '{"incluye": ["monitoreo"]}', 'Solo monitoreo', 'hoy')$$, tests.id('empresa_a')), 'el plan ya no incluye correccion de errores');
select tests.como(tests.id('equipo_a'));
select is(public.crear_ticket('error', 'Error sin cobertura de errores', 'Detalle') ->> 'motivo_fuera_de_plan', 'sin_cobertura_errores', 'plan sin correccion de errores: motivo sin_cobertura_errores');
select is((public.crear_ticket('pregunta', 'Pregunta cubierta', 'Detalle') ->> 'fuera_de_plan')::boolean, false, 'pero las preguntas siguen cubiertas');
-- Plan vencido (sin renovacion automatica)
select tests.como(tests.id('sa'), 'aal2');
select lives_ok(format($$select public.configurar_mantenimiento(%L, %L, 'Contrato por periodo fijo', 'hoy')$$, tests.id('empresa_a'),
  jsonb_build_object('renovacion_automatica', false, 'fecha_fin', :'ayer', 'incluye', array['correccion_errores'])), 'el plan vence antes de hoy');
select tests.como(tests.id('equipo_a'));
select is(public.crear_ticket('error', 'Error con plan vencido', 'Detalle') ->> 'motivo_fuera_de_plan', 'mantenimiento_vencido', 'plan vencido: motivo mantenimiento_vencido');
-- Plan apagado
select tests.como(tests.id('sa'), 'aal2');
select lives_ok(format($$select public.configurar_mantenimiento(%L, %L, 'Se renueva', 'hoy')$$, tests.id('empresa_a'), jsonb_build_object('renovacion_automatica', true)), 'se renueva');
select lives_ok(format($$select public.apagar_mantenimiento(%L, 'El cliente no renovo')$$, tests.id('empresa_a')), 'apagar el mantenimiento');
select tests.como(tests.id('equipo_a'));
select is(public.crear_ticket('error', 'Error con plan apagado', 'Detalle') ->> 'motivo_fuera_de_plan', 'sin_mantenimiento', 'plan apagado: sin mantenimiento');

-- ---------- Un ticket fuera de plan no se trabaja sin decision ----------
select tests.como(tests.id('sa'), 'aal2');
select public.clasificar_ticket(:'t_fp', 'alta');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'en_progreso')$$, :'t_fp'), 'ticket_requiere_decision'), 'fuera de plan: no pasa a en progreso sin decision del dueno');
select ok(tests.error_es(format($$select public.decidir_ticket(%L, 'esperar')$$, :'t_fp'), 'decision_invalida'), 'decision invalida');
select ok(tests.error_es(format($$select public.decidir_ticket(%L, 'cobrar')$$, :'t_fp'), 'valor_cobro_requerido'), 'cobrar exige valor');
select ok(tests.error_es(format($$select public.decidir_ticket(%L, 'cobrar', null, -5)$$, :'t_fp'), 'valor_cobro_requerido'), 'el valor debe ser positivo');
select ok(tests.error_es(format($$select public.decidir_ticket(%L, 'cobrar', null, 100000, 'EUR')$$, :'t_fp'), 'valor_cobro_requerido'), 'moneda solo COP o USD');
select ok(tests.error_es(format($$select public.decidir_ticket(%L, 'rechazar')$$, :'t_fp'), 'motivo_requerido'), 'rechazar exige motivo');
select is(public.decidir_ticket(:'t_fp', 'cobrar', 'Fuera de garantia', 150000, 'COP') ->> 'decision', 'cobrar', 'el dueno decide cobrar');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'en_progreso')$$, :'t_fp'), 'ticket_requiere_decision'), 'cobrar sin aceptacion del admin del cliente: aun no se trabaja');
select is((select cobro_valor from public.tickets where id = :'t_fp'), 150000.00::numeric, 'el valor lo escribe el dueno');
-- El admin del cliente acepta (equipo no puede)
select tests.como(tests.id('equipo_a'));
select ok(tests.error_es(format($$select public.aceptar_cobro_ticket(%L)$$, :'t_fp'), 'no_autorizado'), 'el equipo del cliente no acepta cobros');
select tests.como(tests.id('equipo_b'));
select ok(tests.error_es(format($$select public.aceptar_cobro_ticket(%L)$$, :'t_fp'), 'no_autorizado'), 'otra empresa tampoco');
select tests.como(tests.id('admin_a'));
select is(public.aceptar_cobro_ticket(:'t_fp') ->> 'cobro_aceptado_en' is not null, true, 'el admin del cliente acepta el cobro');
select ok(tests.error_es(format($$select public.aceptar_cobro_ticket(%L)$$, :'t_fp'), 'cobro_ya_aceptado'), 'no se acepta dos veces');
select ok(tests.error_es(format($$select public.rechazar_cobro_ticket(%L)$$, :'t_fp'), 'cobro_ya_aceptado'), 'tras aceptar no se rechaza');
select is((select cobro_aceptado_por from public.tickets where id = :'t_fp'), tests.id('admin_a'), 'queda quien acepto');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.registro_actividad where accion = 'ticket_cobro_aceptado' and entidad_id = :'t_fp'::text and actor_id = tests.id('admin_a')), 1, 'la aceptacion queda en el registro (quien y cuando)');
select ok(tests.error_es(format($$select public.decidir_ticket(%L, 'regalar')$$, :'t_fp'), 'cobro_ya_aceptado'), 'tras aceptar, el dueno ya no cambia la decision');
select is(public.cambiar_estado_ticket(:'t_fp', 'en_progreso') ->> 'estado', 'en_progreso', 'aceptado el cobro, ya se puede trabajar');

-- ---------- Regalar ----------
select tests.como(tests.id('equipo_a'));
select (public.crear_ticket('error', 'Error para regalar', 'Detalle', 'normal') ->> 'ticket_id') as t_reg \gset
select tests.como(tests.id('sa'), 'aal2');
select public.clasificar_ticket(:'t_reg', 'normal');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'en_progreso')$$, :'t_reg'), 'ticket_requiere_decision'), 'regalo sin decidir: no se trabaja');
select is(public.decidir_ticket(:'t_reg', 'regalar') ->> 'decision', 'regalar', 'el dueno regala');
select is(public.cambiar_estado_ticket(:'t_reg', 'en_progreso') ->> 'estado', 'en_progreso', 'regalado: se trabaja de inmediato');

-- ---------- Rechazar ----------
select tests.como(tests.id('equipo_a'));
select (public.crear_ticket('error', 'Error para rechazar', 'Detalle', 'baja') ->> 'ticket_id') as t_rech \gset
select tests.como(tests.id('sa'), 'aal2');
select is(public.decidir_ticket(:'t_rech', 'rechazar', 'Fuera del alcance del contrato') ->> 'estado', 'cerrado', 'rechazar cierra el ticket');
select is((select cierre_motivo || '/' || decision_motivo from public.tickets where id = :'t_rech'), 'rechazado/Fuera del alcance del contrato', 'queda el motivo que ve el cliente');
select tests.como(tests.id('equipo_a'));
select is((select decision_motivo from public.tickets where id = :'t_rech'), 'Fuera del alcance del contrato', 'el cliente ve el motivo del rechazo');

-- ---------- Cliente rechaza el cobro ----------
select tests.como(tests.id('equipo_a'));
select (public.crear_ticket('error', 'Error cobro rechazado', 'Detalle') ->> 'ticket_id') as t_nocobro \gset
select tests.como(tests.id('sa'), 'aal2');
select public.decidir_ticket(:'t_nocobro', 'cobrar', null, 99, 'USD');
select tests.como(tests.id('admin_a'));
select is(public.rechazar_cobro_ticket(:'t_nocobro') ->> 'estado', 'cerrado', 'el admin del cliente rechaza el cobro: se cierra');
select is((select cierre_motivo from public.tickets where id = :'t_nocobro'), 'cobro_rechazado', 'cierre por cobro rechazado');

-- ---------- Solicitud de cambio ----------
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'en_progreso')$$, :'t_cambio'), 'transicion_invalida'), 'solicitud de cambio sin clasificar: no avanza');
select public.clasificar_ticket(:'t_cambio', 'normal');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'en_progreso')$$, :'t_cambio'), 'ticket_requiere_decision'), 'solicitud de cambio: no se trabaja hasta que el dueno decida');
select ok(tests.error_es(format($$select public.marcar_solicitud_cambio(%L)$$, :'t_cambio'), 'ya_es_solicitud_cambio'), 'ya era solicitud de cambio');
-- Marcar un error comun como solicitud de cambio
select tests.como(tests.id('equipo_a'));
select (public.crear_ticket('pregunta', 'Eso no es un error', 'Quiero otra pantalla') ->> 'ticket_id') as t_marcar \gset
select tests.como(tests.id('sa'), 'aal2');
select public.clasificar_ticket(:'t_marcar', 'normal');
select public.decidir_ticket(:'t_marcar', 'regalar');
select public.cambiar_estado_ticket(:'t_marcar', 'en_progreso');
select is(public.marcar_solicitud_cambio(:'t_marcar') ->> 'estado', 'clasificado', 'marcar como cambio un ticket en progreso lo devuelve a clasificado (se frena el trabajo)');
select is((select tipo || '/' || tipo_original || '/' || fuera_de_plan::text from public.tickets where id = :'t_marcar'), 'solicitud_cambio/pregunta/false', 'queda como solicitud de cambio, con el tipo original y sin marca de fuera de plan');
select is((select count(*)::int from public.registro_actividad where accion = 'ticket_marcado_solicitud_cambio' and entidad_id = :'t_marcar'::text), 1, 'marcar como cambio queda en el registro');
-- Cambio con cobro: dueno cotiza, admin acepta, luego se trabaja
select public.decidir_ticket(:'t_cambio', 'cobrar', 'Mini cotizacion', 800000, 'COP');
select tests.como(tests.id('admin_a'));
select public.aceptar_cobro_ticket(:'t_cambio');
select tests.como(tests.id('sa'), 'aal2');
select is(public.cambiar_estado_ticket(:'t_cambio', 'en_progreso') ->> 'estado', 'en_progreso', 'cambio cobrado y aceptado: se trabaja');
-- La decision no aplica a un ticket cubierto
select tests.como(tests.id('equipo_a'));
select (public.crear_ticket('pregunta', 'Pregunta cubierta otra vez', 'Detalle') ->> 'ticket_id') as t_cub \gset
select tests.admin();
update public.tickets set fuera_de_plan = false, motivo_fuera_de_plan = null where id = :'t_cub';
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.decidir_ticket(%L, 'cobrar', null, 5, 'COP')$$, :'t_cub'), 'decision_no_aplica'), 'solo aplica a cambios y tickets fuera de plan');

-- ---------- Avisos (cola de correos) ----------
select tests.admin();
select cmp_ok((select count(*)::int from public.outbox_correos where tipo = 'ticket_cobro_pendiente' and destinatario_user_id = tests.id('admin_a')), '>=', 1, 'cobrar avisa al admin del cliente');
select cmp_ok((select count(*)::int from public.outbox_correos where tipo = 'ticket_requiere_decision' and destinatario_user_id = tests.id('sa')), '>=', 1, 'un ticket fuera de plan avisa al dueno que debe decidir');
select cmp_ok((select count(*)::int from public.outbox_correos where tipo = 'ticket_cobro_aceptado' and destinatario_user_id = tests.id('sa')), '>=', 1, 'cuando el cliente acepta, se avisa al dueno');

select * from finish();
rollback;
