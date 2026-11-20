-- Integracion · avisos de revisiones: al publicar avisan a quienes aprueban; al responder, al super admin; recordatorio a los 3 dias.
begin;
select plan(15);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_revdocs.sql
select tests.preparar_revdocs();

select tests.como(tests.id('sa'), 'aal2');
select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Diseno del portal', null, null, 'https://demo.portal.websourcing.com.co/diseno');
select is((select count(*)::int from public.avisos_salientes where modulo = 'revisiones'), 0, 'un borrador no avisa a nadie');
select public.publicar_revision(tests.rev('Diseno del portal'));
select tests.admin();
select is((select count(*)::int from public.avisos_salientes where tipo = 'revision_publicada' and destino = 'cliente_aprobador'), 1, 'al publicar se avisa a quienes aprueban');
select is((select referencia_id from public.avisos_salientes where tipo = 'revision_publicada'), tests.rev('Diseno del portal'), 'la referencia es la revision');
select is((select count(*)::int from public.avisos_salientes where modulo = 'revisiones' and datos::text ~* 'Diseno del portal|demo.portal'), 0, 'la cola no lleva el titulo ni el link: solo ids');
set local role service_role;
select is((select jsonb_array_length(e -> 'destinatarios') from jsonb_array_elements(public.reclamar_avisos(10)) e where e ->> 'tipo' = 'revision_publicada'), 2,
          'cliente_aprobador: el admin y el equipo con "aprobar" (equipo A2), no el equipo sin permiso');
reset role;
set local role service_role;
select is(public.generar_recordatorios_revisiones() ->> 'avisos_nuevos', '0', 'sin pasar 3 dias no hay recordatorio');
reset role;
set local session_replication_role = replica;
update public.revisiones set actualizado_en = now() - interval '4 days';
set local session_replication_role = origin;
select throws_ok($$select 1/0$$, '22012', null, 'control del entorno de prueba');
set local role service_role;
select is(public.generar_recordatorios_revisiones() ->> 'avisos_nuevos', '1', 'a los 4 dias esperando: un recordatorio');
select is(public.generar_recordatorios_revisiones() ->> 'avisos_nuevos', '0', 'pero solo uno por semana');
reset role;
select is((select count(*)::int from public.avisos_salientes where tipo = 'revision_pendiente' and destino = 'cliente_aprobador'), 1, 'queda en la cola');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.generar_recordatorios_revisiones()$$, '42501', null, 'el cliente no genera recordatorios');
select is((select count(*)::int from public.avisos_salientes), 0, 'el cliente no lee la cola');
select public.responder_revision(tests.rev('Diseno del portal'), 1, 'apruebo');
select tests.admin();
select is((select count(*)::int from public.avisos_salientes where tipo = 'revision_respondida' and destino = 'super_admin'), 1, 'al responder se avisa al super admin');
select is((select datos ->> 'decision' from public.avisos_salientes where tipo = 'revision_respondida'), 'aprobada', 'con la decision (un valor fijo, no texto libre)');
select tests.como(tests.id('admin_b'), 'aal2');
select is((select count(*)::int from public.avisos_salientes), 0, 'B no ve nada de A');
select * from finish();
rollback;
