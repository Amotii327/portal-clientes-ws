-- Correcciones de Calidad: I-1 (sin texto libre en la cola), I-2 (corte espera horas pendientes y arrastre),
-- I-3 (horas en todos los tickets, cambios sin descuento), M-1 (nota del dueno oculta), M-2 (horas obligatorias), M-3 (cobrar con trabajo en curso).
begin;
select plan(12);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

select (current_date - 3)::text as inicio \gset
select date_trunc('month', private.hoy()::timestamp)::date as mes_actual \gset
select (date_trunc('month', private.hoy()::timestamp) + interval '1 month' + interval '1 day')::date as corte1 \gset

-- M-2: un plan personalizado sin horas no se activa
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.error_es(format($$select public.activar_mantenimiento(%L, 'personalizado', %L)$$, tests.id('empresa_a'),
  jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 500000)), 'horas_requeridas'), 'M-2: un plan personalizado sin horas_mes no se activa');
select public.activar_mantenimiento(tests.id('empresa_a'), 'personalizado',
  jsonb_build_object('fecha_inicio', :'inicio', 'cuota_mensual', 500000, 'horas_mes', 10, 'acumular_horas', true, 'incluye', jsonb_build_array('correccion_errores'))) ->> 'activo' as x \gset

-- I-1: un titulo "sensible" no llega a la cola
select tests.como(tests.id('equipo_a'));
select (public.crear_ticket('error', 'mi clave del servidor es Abc12345', 'Detalle', 'urgente') ->> 'ticket_id') as t1 \gset
select (public.crear_ticket('solicitud_cambio', 'Cambio con dato sensible 99887766', 'Detalle', 'normal') ->> 'ticket_id') as t_cambio \gset
select public.responder_ticket(:'t1', 'Mi clave es Zz998877') ;
select tests.admin();
select is((select count(*)::int from public.outbox_correos where datos::text ilike '%Abc12345%' or datos::text ilike '%99887766%' or datos::text ilike '%Zz998877%'), 0, 'I-1: la cola de correos no guarda titulo ni texto del cliente');
select cmp_ok((select count(*)::int from public.outbox_correos where datos ? 'ticket_id'), '>=', 2, 'I-1: la cola si guarda identificadores del ticket');
select is((select count(*)::int from public.outbox_correos where datos ? 'titulo'), 0, 'I-1: ningun aviso lleva la clave "titulo"');

-- I-3: horas en todos los tickets; las de cambios no descuentan
select tests.como(tests.id('sa'), 'aal2');
select public.clasificar_ticket(:'t1', 'alta');
select public.anotar_horas_ticket(:'t1', 4) ->> 'estado' as x \gset
select public.anotar_horas_ticket(:'t_cambio', 2) ->> 'estado' as x \gset
select id as h1 from public.horas_registradas where ticket_id = :'t1' \gset
select id as hc from public.horas_registradas where ticket_id = :'t_cambio' \gset
select public.revisar_horas(:'hc', true);
select is((select horas_usadas from public.bolsa_mensual where empresa_id = tests.id('empresa_a')), 0.00::numeric, 'I-3: aprobar horas de un cambio no descuenta de la bolsa');
select public.revisar_horas(:'h1', true, 'nota privada del dueno');
select is((select horas_usadas from public.bolsa_mensual where empresa_id = tests.id('empresa_a')), 4.00::numeric, 'I-3: las horas de los demas tickets si descuentan');

-- M-1: el cliente no ve la nota del dueno al aprobar
select is((select motivo_revision from public.horas_registradas where id = :'h1'), null::text, 'M-1: al aprobar no se guarda la nota del dueno');

-- M-3: cobrar con el trabajo ya en curso
select public.cambiar_estado_ticket(:'t_cambio', 'clasificado') where false;
select public.clasificar_ticket(:'t_cambio', 'normal');
select public.decidir_ticket(:'t_cambio', 'regalar');
select public.cambiar_estado_ticket(:'t_cambio', 'en_progreso');
select ok(tests.error_es(format($$select public.decidir_ticket(%L, 'cobrar', null, 100000)$$, :'t_cambio'), 'ticket_en_progreso'), 'M-3: no se cobra un ticket que ya esta en progreso');

-- I-2: arrastre cuando la bolsa siguiente ya existia
select public.anotar_horas_ticket(:'t1', 1) ->> 'estado' as x \gset
select tests.admin();
select is((private.cerrar_mes_bolsas(:'corte1') ->> 'bolsas_cerradas')::int, 0, 'I-2: con horas pendientes el corte no cierra la bolsa');
select id as h_pend from public.horas_registradas where estado = 'pendiente_dueno' and ticket_id = :'t1' \gset
select tests.como(tests.id('sa'), 'aal2');
select public.revisar_horas(:'h_pend', true);
select tests.admin();
-- Mientras el corte esperaba, ya se creo la bolsa del mes siguiente (sin arrastre)
select is((select count(*)::int from public.bolsa_mensual where empresa_id = tests.id('empresa_a') and mes > :'mes_actual'::date), 1, 'I-2: la bolsa del mes siguiente ya existe');
select is((private.cerrar_mes_bolsas(:'corte1') ->> 'bolsas_cerradas')::int, 1, 'I-2: revisadas las horas, el corte cierra la bolsa');
select is((select horas_arrastradas from public.bolsa_mensual where empresa_id = tests.id('empresa_a') and mes = (:'mes_actual'::date + interval '1 month')::date), 5.00::numeric, 'I-2: la bolsa siguiente ya creada recibe las 5 horas arrastradas');

select * from finish();
rollback;
