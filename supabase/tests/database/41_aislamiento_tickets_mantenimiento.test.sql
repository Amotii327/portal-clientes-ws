-- Sprint 5 y 6 · Un usuario de la empresa A no puede ver ni tocar tickets, mensajes, adjuntos, plan,
-- bolsa ni horas de la B (y viceversa), y cada rol ve solo lo que la matriz permite.
begin;
select plan(106);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

-- ---- Datos (como superusuario) ----
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_admin_a'),  tests.id('admin_a'),  'error', 'alta')    as ta_admin \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'pregunta', 'normal') as ta_eq \gset
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a2'), tests.id('equipo_a2'), 'acceso', 'baja') as ta_eq2 \gset
select tests.ticket_directo(tests.id('empresa_b'), tests.id('miembro_equipo_b'), tests.id('equipo_b'), 'error', 'alta')    as tb \gset
select tests.ticket_directo(tests.id('empresa_c'), tests.id('miembro_admin_c'), tests.id('admin_c'), 'error', 'alta')      as tc \gset

insert into public.ticket_mensajes (empresa_id, ticket_id, autor_id, autor_tipo, texto) values
  (tests.id('empresa_a'), :'ta_eq', tests.id('equipo_a'), 'cliente', 'Mensaje del cliente A');
insert into public.ticket_mensajes (empresa_id, ticket_id, autor_tipo, area, texto) values
  (tests.id('empresa_a'), :'ta_eq', 'websourcing', 'Desarrollo', 'Respuesta publica A');
insert into public.ticket_mensajes (empresa_id, ticket_id, autor_tipo, texto, interno) values
  (tests.id('empresa_a'), :'ta_eq', 'websourcing', 'Nota interna A', true);
insert into public.ticket_mensajes (empresa_id, ticket_id, autor_tipo, area, texto) values
  (tests.id('empresa_b'), :'tb', 'websourcing', 'Desarrollo', 'Respuesta publica B');

-- Un adjunto de A (publico) y otro de A colgado de la nota interna; uno de B.
select id as m_int from public.ticket_mensajes where texto = 'Nota interna A' \gset
insert into public.ticket_adjuntos (empresa_id, ticket_id, subido_por, nombre_original, mime, tamano_bytes, storage_path) values
  (tests.id('empresa_a'), :'ta_eq', tests.id('equipo_a'), 'captura.png', 'image/png', 1000,
   tests.id('empresa_a')::text || '/tickets/' || :'ta_eq' || '/11111111-1111-1111-1111-111111111111.png');
insert into public.ticket_adjuntos (empresa_id, ticket_id, mensaje_id, subido_por, nombre_original, mime, tamano_bytes, storage_path) values
  (tests.id('empresa_a'), :'ta_eq', :'m_int', tests.id('equipo_a'), 'interna.png', 'image/png', 1000,
   tests.id('empresa_a')::text || '/tickets/' || :'ta_eq' || '/22222222-2222-2222-2222-222222222222.png');
insert into public.ticket_adjuntos (empresa_id, ticket_id, subido_por, nombre_original, mime, tamano_bytes, storage_path) values
  (tests.id('empresa_b'), :'tb', tests.id('equipo_b'), 'captura.png', 'image/png', 1000,
   tests.id('empresa_b')::text || '/tickets/' || :'tb' || '/33333333-3333-3333-3333-333333333333.png');

insert into public.garantias (empresa_id, inicia_en, vence_en) values
  (tests.id('empresa_a'), current_date - 10, current_date + 20), (tests.id('empresa_b'), current_date - 10, current_date + 20);

-- Planes activos de A y B con su bolsa y horas.
insert into public.planes_mantenimiento (empresa_id, activo, fecha_inicio, cuota_mensual, horas_mes, incluye)
values (tests.id('empresa_a'), true, current_date - 60, 500000, 10, '{correccion_errores}'),
       (tests.id('empresa_b'), true, current_date - 60, 600000, 8,  '{correccion_errores}');
select private.asegurar_bolsa(p.id, date_trunc('month', private.hoy()::timestamp)::date) from public.planes_mantenimiento p;
insert into public.planes_mantenimiento_historial (empresa_id, plan_id, tipo, motivo, efectivo_desde)
  select empresa_id, id, 'activacion', 'Activacion de prueba', current_date from public.planes_mantenimiento;
insert into public.horas_registradas (empresa_id, ticket_id, bolsa_id, mes, fecha_trabajo, horas, estado, revisado_en, registrado_por)
  select b.empresa_id, case when b.empresa_id = tests.id('empresa_a') then :'ta_admin'::uuid else :'tb'::uuid end, b.id, b.mes,
         b.mes, x.h, x.e, case when x.e = 'pendiente_dueno' then null else now() end, tests.id('sa')
    from public.bolsa_mensual b cross join (values (1, 'aprobada'), (2, 'pendiente_dueno'), (3, 'extra_pendiente_cliente'), (4, 'rechazada')) x(h, e);
select id as hora_a_pend from public.horas_registradas where empresa_id = tests.id('empresa_a') and estado = 'pendiente_dueno' \gset
select id as hora_a_extra from public.horas_registradas where empresa_id = tests.id('empresa_a') and estado = 'extra_pendiente_cliente' \gset
select id as bolsa_a from public.bolsa_mensual where empresa_id = tests.id('empresa_a') \gset
select id as bolsa_b from public.bolsa_mensual where empresa_id = tests.id('empresa_b') \gset
insert into public.horas_notas_internas (hora_id, empresa_id, nota) values (:'hora_a_pend', tests.id('empresa_a'), 'Nota interna de horas');
-- Un correo en la cola
select count(*) > 0 as hay_outbox from public.outbox_correos \gset

-- ---------- Admin de A ----------
select tests.como(tests.id('admin_a'));
select is(tests.contar('select 1 from public.tickets'), 3::bigint, 'admin A: ve los 3 tickets de A');
select is(tests.contar(format('select 1 from public.tickets where id = %L', :'tb')), 0::bigint, 'admin A: no ve el ticket de B ni por id directo');
select is(tests.contar('select 1 from public.ticket_mensajes'), 2::bigint, 'admin A: ve los mensajes publicos de A (sin la nota interna)');
select is(tests.contar($$select 1 from public.ticket_mensajes where interno$$), 0::bigint, 'admin A: nunca ve notas internas');
select is(tests.contar('select 1 from public.ticket_adjuntos'), 1::bigint, 'admin A: ve el adjunto publico de A, no el de la nota interna ni el de B');
select is(tests.contar('select 1 from public.garantias'), 1::bigint, 'admin A: ve su garantia, no la de B');
select is(tests.contar('select 1 from public.planes_mantenimiento'), 1::bigint, 'admin A: ve el plan de A (activo), no el de B');
select is(tests.contar('select 1 from public.planes_mantenimiento_historial'), 0::bigint, 'admin A: no ve el historial de cambios del plan');
select is(tests.contar('select 1 from public.planes_base_mantenimiento'), 0::bigint, 'admin A: no ve los planes base');
select is(tests.contar('select 1 from public.bolsa_mensual'), 1::bigint, 'admin A: ve la bolsa de A, no la de B');
select is(tests.contar('select 1 from public.horas_registradas'), 2::bigint, 'admin A: ve solo horas ya revisadas (aprobada y extra pendiente), no pendientes ni rechazadas');
select is(tests.contar('select 1 from public.horas_notas_internas'), 0::bigint, 'admin A: no ve la nota interna de las horas');
select is(tests.contar('select 1 from public.outbox_correos'), 0::bigint, 'admin A: no ve la cola de correos');
select is(tests.contar('select 1 from public.tickets_semaforo'), 3::bigint, 'admin A: la vista del semaforo respeta la cerradura (3)');
select is(tests.contar('select 1 from public.bolsa_mensual_resumen'), 1::bigint, 'admin A: la vista de la bolsa respeta la cerradura (1)');
select ok(public.mi_mantenimiento_activo(), 'admin A: ve el modulo de mantenimiento (esta encendido)');

-- Escrituras directas: ninguna
select throws_ok($$insert into public.tickets (empresa_id, miembro_id, tipo, titulo, detalle, prioridad_propuesta) values (gen_random_uuid(), gen_random_uuid(), 'error', 'x', 'x', 'alta')$$, '42501', null, 'admin A: no inserta tickets directo (solo crear_ticket)');
select throws_ok($$update public.tickets set estado = 'cerrado'$$, '42501', null, 'admin A: no actualiza tickets directo');
select throws_ok($$update public.tickets set prioridad = 'urgente'$$, '42501', null, 'admin A: no cambia prioridad ni decision directo');
select throws_ok($$delete from public.tickets$$, '42501', null, 'admin A: no borra tickets');
select throws_ok($$insert into public.ticket_mensajes (empresa_id, ticket_id, autor_tipo, texto) values (gen_random_uuid(), gen_random_uuid(), 'cliente', 'x')$$, '42501', null, 'admin A: no inserta mensajes directo');
select throws_ok($$insert into public.ticket_adjuntos (empresa_id, ticket_id, nombre_original, mime, tamano_bytes, storage_path) values (gen_random_uuid(), gen_random_uuid(), 'a', 'image/png', 1, 'x')$$, '42501', null, 'admin A: no inserta adjuntos directo (la ruta la genera la base)');
select throws_ok($$update public.planes_mantenimiento set cuota_mensual = 1$$, '42501', null, 'admin A: no edita su plan de mantenimiento');
select throws_ok($$update public.bolsa_mensual set horas_usadas = 0$$, '42501', null, 'admin A: no edita la bolsa');
select throws_ok($$update public.horas_registradas set estado = 'aprobada'$$, '42501', null, 'admin A: no edita horas');
select throws_ok($$insert into public.outbox_correos (tipo, destinatario_correo) values ('x', 'a@b.co')$$, '42501', null, 'admin A: no escribe en la cola de correos');
select throws_ok($$insert into public.garantias (empresa_id, inicia_en, vence_en) values (gen_random_uuid(), current_date, current_date + 30)$$, '42501', 'new row violates row-level security policy for table "garantias"', 'admin A: no crea garantias (solo el super admin)');
select is(tests.afectadas($$update public.planes_base_mantenimiento set nota = 'x'$$), 0::bigint, 'admin A: no edita los planes base');

-- Funciones contra la empresa B o contra tickets ajenos
select ok(tests.error_es(format($$select public.responder_ticket(%L, 'hola')$$, :'tb'), 'ticket_no_encontrado'), 'admin A: no responde en un ticket de B');
select ok(tests.error_es(format($$select public.preparar_adjunto_ticket(%L, 'a.png', 'image/png', 10)$$, :'tb'), 'ticket_no_encontrado'), 'admin A: no adjunta en un ticket de B');
select ok(tests.error_es(format($$select public.confirmar_resolucion(%L)$$, :'tb'), 'ticket_no_encontrado'), 'admin A: no confirma tickets de B');
select ok(tests.error_es(format($$select public.calificar_ticket(%L, 5)$$, :'tb'), 'ticket_no_encontrado'), 'admin A: no califica tickets de B');
select ok(tests.error_es(format($$select public.aceptar_cobro_ticket(%L)$$, :'tb'), 'no_autorizado'), 'admin A: no acepta cobros de B');
select ok(tests.error_es(format($$select public.clasificar_ticket(%L, 'alta')$$, :'ta_eq'), 'no_autorizado'), 'admin A: no clasifica (solo el super admin)');
select ok(tests.error_es(format($$select public.cambiar_estado_ticket(%L, 'en_progreso')$$, :'ta_eq'), 'no_autorizado'), 'admin A: no cambia estados (solo el super admin)');
select ok(tests.error_es(format($$select public.decidir_ticket(%L, 'regalar')$$, :'ta_eq'), 'no_autorizado'), 'admin A: no decide cobros (solo el super admin)');
select ok(tests.error_es(format($$select public.marcar_solicitud_cambio(%L)$$, :'ta_eq'), 'no_autorizado'), 'admin A: no marca solicitudes de cambio');
select ok(tests.error_es($$select public.activar_mantenimiento(tests.id('empresa_a'), 'basico', '{}')$$, 'no_autorizado'), 'admin A: no activa mantenimiento');
select ok(tests.error_es($$select public.configurar_mantenimiento(tests.id('empresa_a'), '{"horas_mes": 99}', 'motivo')$$, 'no_autorizado'), 'admin A: no configura mantenimiento');
select ok(tests.error_es($$select public.apagar_mantenimiento(tests.id('empresa_a'), 'motivo')$$, 'no_autorizado'), 'admin A: no apaga mantenimiento');
select ok(tests.error_es(format($$select public.anotar_horas_ticket(%L, 1)$$, :'ta_admin'), 'no_autorizado'), 'admin A: no anota horas');
select ok(tests.error_es(format($$select public.revisar_horas(%L, true)$$, :'hora_a_pend'), 'no_autorizado'), 'admin A: no revisa horas');
select ok(tests.error_es(format($$select public.retirar_texto_mensaje(%L)$$, :'m_int'), 'no_autorizado'), 'admin A: no retira mensajes');
select ok(tests.error_es(format($$select public.decidir_horas_extra(%L, true)$$, :'hora_a_pend'), 'hora_no_encontrada'), 'admin A: solo decide horas extra pendientes del cliente');
select ok(tests.error_es(format($$select public.autorizar_horas_extra(%L)$$, :'bolsa_b'), 'bolsa_no_encontrada'), 'admin A: no autoriza horas extra de la bolsa de B');

-- ---------- Equipo A sin permisos: solo sus tickets ----------
select tests.como(tests.id('equipo_a'));
select is(tests.contar('select 1 from public.tickets'), 1::bigint, 'equipo A: ve solo SU ticket');
select is(tests.contar(format('select 1 from public.tickets where id = %L', :'ta_admin')), 0::bigint, 'equipo A: no ve el ticket del admin de su propia empresa');
select is(tests.contar('select 1 from public.ticket_mensajes'), 2::bigint, 'equipo A: ve los mensajes publicos de su ticket, no la nota interna');
select is(tests.contar('select 1 from public.ticket_adjuntos'), 1::bigint, 'equipo A: ve el adjunto publico, no el de la nota interna');
select is(tests.contar('select 1 from public.planes_mantenimiento'), 0::bigint, 'equipo A: no ve el plan de mantenimiento');
select is(tests.contar('select 1 from public.bolsa_mensual'), 0::bigint, 'equipo A: no ve la bolsa');
select is(tests.contar('select 1 from public.horas_registradas'), 0::bigint, 'equipo A: no ve horas');
select is(tests.contar('select 1 from public.garantias'), 1::bigint, 'equipo A: ve la garantia de su empresa');
select is(tests.contar('select 1 from public.tickets_semaforo'), 1::bigint, 'equipo A: el semaforo solo de su ticket');
select ok(tests.error_es(format($$select public.responder_ticket(%L, 'hola')$$, :'ta_admin'), 'ticket_no_encontrado'), 'equipo A: no responde en el ticket de otro compañero');
select ok(tests.error_es(format($$select public.responder_ticket(%L, 'nota', true)$$, :'ta_eq'), 'no_autorizado'), 'equipo A: no puede dejar notas internas');
select ok(tests.error_es(format($$select public.aceptar_cobro_ticket(%L)$$, :'ta_eq'), 'no_autorizado'), 'equipo A: no acepta cobros (solo el admin)');
select ok(not public.mi_mantenimiento_activo() is distinct from true, 'equipo A: mi_mantenimiento_activo responde segun su empresa');

-- Equipo A2 (aprobar y ver dinero, pero NO ver todos los tickets)
select tests.como(tests.id('equipo_a2'));
select is(tests.contar('select 1 from public.tickets'), 1::bigint, 'equipo A2 sin ver_todos_tickets: solo su ticket (ver dinero no cambia esto)');

-- Equipo A con permiso de ver todos los tickets
select tests.admin();
update public.miembros set ver_todos_tickets = true where id = tests.id('miembro_equipo_a');
select tests.como(tests.id('equipo_a'));
select is(tests.contar('select 1 from public.tickets'), 3::bigint, 'equipo A con ver_todos_tickets: ve los 3 tickets de A');
select is(tests.contar(format('select 1 from public.tickets where id = %L', :'tb')), 0::bigint, 'equipo A con ver_todos_tickets: tampoco ve los de B');
select is(tests.contar('select 1 from public.planes_mantenimiento'), 0::bigint, 'ver_todos_tickets no abre el plan de mantenimiento');

-- ---------- Sin acceso ----------
select tests.como(tests.id('quitado_a'));
select is(tests.contar('select 1 from public.tickets'), 0::bigint, 'miembro quitado: sin tickets');
select is(tests.contar('select 1 from public.garantias'), 0::bigint, 'miembro quitado: sin garantias');
select tests.como(tests.id('bloq_a'));
select is(tests.contar('select 1 from public.tickets'), 0::bigint, 'miembro bloqueado: sin tickets');
select tests.como(tests.id('perfil_bloq'));
select is(tests.contar('select 1 from public.tickets'), 0::bigint, 'perfil bloqueado: sin tickets');
select ok(tests.error_es($$select public.crear_ticket('error', 'Titulo', 'Detalle')$$, 'no_autorizado'), 'perfil bloqueado: no crea tickets');
select tests.como(tests.id('admin_c'));
select is(tests.contar('select 1 from public.tickets'), 0::bigint, 'admin de empresa pausada: no ve tickets');
select ok(tests.error_es($$select public.crear_ticket('error', 'Titulo', 'Detalle')$$, 'no_autorizado'), 'empresa pausada: no se crean tickets');
select tests.como(tests.id('sin_perfil'));
select is(tests.contar('select 1 from public.tickets'), 0::bigint, 'usuario sin perfil ni empresa: sin tickets');

-- ---------- Empresa B (simetria) ----------
select tests.como(tests.id('admin_b'));
select is(tests.contar('select 1 from public.tickets'), 1::bigint, 'admin B: ve solo el ticket de B');
select is(tests.contar('select 1 from public.planes_mantenimiento'), 1::bigint, 'admin B: ve su plan');
select is(tests.contar(format('select 1 from public.bolsa_mensual where id = %L', :'bolsa_a')), 0::bigint, 'admin B: no ve la bolsa de A');
select ok(tests.error_es(format($$select public.decidir_horas_extra(%L, true)$$, :'hora_a_extra'), 'hora_no_encontrada'), 'admin B: no decide horas extra de A');
select ok(tests.error_es(format($$select public.responder_ticket(%L, 'hola')$$, :'ta_eq'), 'ticket_no_encontrado'), 'admin B: no responde en tickets de A');
select tests.como(tests.id('equipo_b'));
select is(tests.contar('select 1 from public.tickets'), 1::bigint, 'equipo B: ve su ticket');
select is(tests.contar('select 1 from public.ticket_adjuntos'), 1::bigint, 'equipo B: ve su adjunto');

-- ---------- Anonimo ----------
select tests.anonimo();
select throws_ok('select 1 from public.tickets', '42501', null, 'anonimo: sin permiso sobre tickets');
select throws_ok('select 1 from public.planes_mantenimiento', '42501', null, 'anonimo: sin permiso sobre planes');
select throws_ok('select 1 from public.tickets_semaforo', '42501', null, 'anonimo: sin permiso sobre la vista del semaforo');
select throws_ok($$select public.crear_ticket('error', 'Titulo', 'Detalle')$$, '42501', null, 'anonimo: no ejecuta crear_ticket');
select throws_ok($$select public.activar_mantenimiento(gen_random_uuid(), 'basico')$$, '42501', null, 'anonimo: no ejecuta activar_mantenimiento');

-- ---------- Super admin: sin 2FA no tiene ningun poder ----------
select tests.como(tests.id('sa'), 'aal1');
select is(tests.contar('select 1 from public.tickets'), 0::bigint, 'super admin sin 2FA: no ve tickets');
select is(tests.contar('select 1 from public.planes_mantenimiento'), 0::bigint, 'super admin sin 2FA: no ve planes');
select is(tests.contar('select 1 from public.outbox_correos'), 0::bigint, 'super admin sin 2FA: no ve la cola de correos');
select ok(tests.error_es($$select public.activar_mantenimiento(tests.id('empresa_a'), 'basico', '{}')$$, 'no_autorizado'), 'super admin sin 2FA: no activa mantenimiento');
select ok(tests.error_es(format($$select public.clasificar_ticket(%L, 'alta')$$, :'ta_eq'), 'no_autorizado'), 'super admin sin 2FA: no clasifica');
select throws_ok($$insert into public.garantias (empresa_id, inicia_en, vence_en) values (tests.id('empresa_a'), current_date, current_date + 30)$$, '42501', null, 'super admin sin 2FA: no crea garantias');

-- ---------- Super admin con 2FA ----------
select tests.como(tests.id('sa'), 'aal2');
select is(tests.contar('select 1 from public.tickets'), 5::bigint, 'super admin con 2FA: ve los tickets de todas las empresas');
select is(tests.contar('select 1 from public.ticket_mensajes'), 4::bigint, 'super admin: ve todos los mensajes, tambien las notas internas');
select is(tests.contar('select 1 from public.horas_registradas'), 8::bigint, 'super admin: ve todas las horas (4 por empresa)');
select is(tests.contar('select 1 from public.horas_notas_internas'), 1::bigint, 'super admin: ve las notas internas de horas');
select cmp_ok(tests.contar('select 1 from public.outbox_correos'), '>=', 0::bigint, 'super admin: lee la cola de correos');
select lives_ok($$insert into public.garantias (empresa_id, inicia_en, vence_en) values (tests.id('empresa_c'), current_date, current_date + 30)$$, 'super admin: crea garantias');
select lives_ok($$update public.planes_base_mantenimiento set nota = 'Ajustada por el dueno' where plan = 'basico'$$, 'super admin: edita los planes base');
select throws_ok($$update public.garantias set empresa_id = tests.id('empresa_b') where empresa_id = tests.id('empresa_c')$$, '42501', null, 'super admin: no puede mudar una garantia a otra empresa (columna sin permiso)');
select throws_ok($$delete from public.tickets$$, '42501', null, 'super admin: tampoco borra tickets desde la API');

-- ---------- Llaves compuestas e inmutabilidad (como superusuario) ----------
select tests.admin();
select throws_ok(format($$insert into public.ticket_mensajes (empresa_id, ticket_id, autor_tipo, area, texto) values (%L, %L, 'websourcing', 'Desarrollo', 'x')$$, tests.id('empresa_b'), :'ta_eq'),
  '23503', null, 'un mensaje de B no puede colgar de un ticket de A (llave compuesta)');
select throws_ok(format($$insert into public.tickets (empresa_id, miembro_id, tipo, titulo, detalle, prioridad_propuesta, creado_por) values (%L, %L, 'error', 'Titulo', 'x', 'alta', %L)$$, tests.id('empresa_a'), tests.id('miembro_equipo_b'), tests.id('equipo_b')),
  '23503', null, 'un ticket de A no puede atribuirse a un miembro de B (llave compuesta)');
select throws_ok(format($$insert into public.horas_registradas (empresa_id, ticket_id, bolsa_id, mes, fecha_trabajo, horas, registrado_por) values (%L, %L, %L, date_trunc('month', now())::date, date_trunc('month', now())::date, 1, %L)$$, tests.id('empresa_a'), :'ta_admin', :'bolsa_b', tests.id('sa')),
  '23503', null, 'horas de A no pueden usar la bolsa de B (llave compuesta)');
select throws_ok(format($$insert into public.ticket_adjuntos (empresa_id, ticket_id, subido_por, nombre_original, mime, tamano_bytes, storage_path) values (%L, %L, %L, 'a.png', 'image/png', 1, %L)$$,
  tests.id('empresa_b'), :'ta_eq', tests.id('equipo_b'), tests.id('empresa_b')::text || '/tickets/' || :'ta_eq' || '/44444444-4444-4444-4444-444444444444.png'),
  '23503', null, 'un adjunto de B no puede colgar de un ticket de A');
select throws_ok(format($$update public.tickets set empresa_id = %L where id = %L$$, tests.id('empresa_b'), :'ta_eq'), '23514', 'empresa_id_inmutable', 'empresa_id de un ticket no se puede cambiar');
select throws_ok(format($$update public.horas_registradas set empresa_id = %L where id = %L$$, tests.id('empresa_b'), :'hora_a_pend'), '23514', 'empresa_id_inmutable', 'empresa_id de las horas no se puede cambiar');
select throws_ok(format($$update public.bolsa_mensual set empresa_id = %L where id = %L$$, tests.id('empresa_b'), :'bolsa_a'), '23514', 'empresa_id_inmutable', 'empresa_id de la bolsa no se puede cambiar');
select throws_ok(format($$update public.tickets set creado_por = %L where id = %L$$, tests.id('admin_b'), :'ta_eq'), '23514', 'campo_inmutable: creado_por', 'el autor del ticket no se puede cambiar');
select throws_ok(format($$insert into public.ticket_adjuntos (empresa_id, ticket_id, subido_por, nombre_original, mime, tamano_bytes, storage_path) values (%L, %L, %L, 'a.png', 'image/png', 1, 'otra/ruta.png')$$, tests.id('empresa_a'), :'ta_eq', tests.id('equipo_a')),
  '23514', null, 'la ruta del adjunto debe ser la de su empresa y ticket');

select * from finish();
rollback;
