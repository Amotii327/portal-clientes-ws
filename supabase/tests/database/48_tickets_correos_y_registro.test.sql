-- Sprint 5 · Cola de correos (outbox) y registro de actividad de tickets y mantenimiento.
begin;
select plan(11);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

insert into public.garantias (empresa_id, inicia_en, vence_en) values
  (tests.id('empresa_a'), current_date - 5, current_date + 25);

select tests.como(tests.id('equipo_a'));
select (public.crear_ticket('error', 'Caida total', 'No entra nadie', 'urgente') ->> 'ticket_id') as t1 \gset
select (public.crear_ticket('pregunta', 'Duda sencilla', 'Como hago X?', 'normal') ->> 'ticket_id') as t2 \gset
select tests.admin();
select is((select count(*)::int from public.outbox_correos where tipo = 'ticket_urgente_nuevo' and empresa_id = tests.id('empresa_a')), 1, 'un ticket urgente avisa al super admin (una vez)');
select ok((select bool_and(clave_unica like 'ticket_urgente:' || :'t1' || '%') from public.outbox_correos where tipo = 'ticket_urgente_nuevo'), 'el aviso lleva su clave unica para no repetirse');
select is((select count(*)::int from public.outbox_correos where tipo = 'ticket_urgente_nuevo' and datos ->> 'ticket_id' = :'t2'), 0, 'un ticket normal no dispara aviso urgente');
select is((select estado from public.outbox_correos where tipo = 'ticket_urgente_nuevo' limit 1), 'pendiente', 'los correos quedan pendientes: todavia no hay envio real');

-- Notas internas no generan correo al cliente
select tests.como(tests.id('sa'), 'aal2');
select public.responder_ticket(:'t2', 'Nota interna: revisar logs', true);
select tests.admin();
select is((select count(*)::int from public.outbox_correos where tipo = 'ticket_respuesta' and datos::text like '%revisar logs%'), 0, 'una nota interna no sale por correo ni queda en sus datos');
select tests.como(tests.id('sa'), 'aal2');
select public.responder_ticket(:'t2', 'Ya lo revisamos', false, 'Desarrollo') as x \gset
select tests.admin();
select is((select count(*)::int from public.outbox_correos where tipo = 'ticket_respuesta' and empresa_id = tests.id('empresa_a')), 1, 'una respuesta publica avisa al cliente');
select is((select count(*)::int from public.outbox_correos where datos::text like '%Ya lo revisamos%'), 0, 'el correo lleva identificadores, no el texto del mensaje');

-- Cliente no escribe ni lee la cola
select tests.como(tests.id('admin_a'));
select ok(tests.error_es($$insert into public.outbox_correos (tipo, destinatario_correo) values ('x_tipo', 'a@b.co')$$, 'permission denied for table outbox_correos')
  or tests.error_es($$insert into public.outbox_correos (tipo, destinatario_correo) values ('x_tipo', 'a@b.co')$$, 'new row violates row-level security policy for table "outbox_correos"'), 'el cliente no escribe en la cola');
select is((select count(*)::int from public.outbox_correos), 0, 'el cliente no lee la cola de correos');

-- Registro de actividad sin texto libre
select tests.como(tests.id('sa'), 'aal2');
select ok((select count(*) from public.registro_actividad where accion = 'ticket_creado') >= 2, 'crear un ticket queda en el registro');
select is((select count(*)::int from public.registro_actividad where detalle::text like '%No entra nadie%' or detalle::text like '%Ya lo revisamos%'), 0, 'el registro no guarda el texto libre de tickets');

select * from finish();
rollback;
