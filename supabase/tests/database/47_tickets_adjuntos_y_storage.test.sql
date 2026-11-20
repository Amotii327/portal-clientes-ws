-- Sprint 5 · Adjuntos de tickets: preparar_adjunto_ticket, reglas de tipo y tamano, y politicas de Storage por empresa.
begin;
select plan(17);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

insert into public.garantias (empresa_id, inicia_en, vence_en) values
  (tests.id('empresa_a'), current_date - 5, current_date + 25), (tests.id('empresa_b'), current_date - 5, current_date + 25);

select tests.como(tests.id('equipo_a'));
select (public.crear_ticket('error', 'Falla con captura', 'Adjunto una imagen', 'normal') ->> 'ticket_id') as ta \gset
select tests.como(tests.id('equipo_b'));
select (public.crear_ticket('error', 'Ticket de B', 'Detalle de B', 'normal') ->> 'ticket_id') as tb \gset

select tests.como(tests.id('equipo_a'));
select public.preparar_adjunto_ticket(:'ta', 'captura.png', 'image/png', 1000) as adj \gset
select ok((:'adj'::jsonb ->> 'ruta') like tests.id('empresa_a')::text || '/tickets/' || :'ta' || '/%.png', 'la ruta la genera la base: empresa/tickets/ticket/uuid.ext');
select is(:'adj'::jsonb ->> 'bucket', 'portal-tickets', 'el bucket es portal-tickets');
select is((select subido_por from public.ticket_adjuntos where id = (:'adj'::jsonb ->> 'adjunto_id')::uuid), tests.id('equipo_a'), 'subido_por es quien llama');
select ok(tests.error_es(format($$select public.preparar_adjunto_ticket(%L, 'virus.exe', 'application/x-msdownload', 100)$$, :'ta'), 'adjunto_invalido'), 'tipo no permitido');
select ok(tests.error_es(format($$select public.preparar_adjunto_ticket(%L, 'grande.mp4', 'video/mp4', 52428801)$$, :'ta'), 'adjunto_invalido'), 'mas de 50 MB no vale');
select ok(tests.error_es(format($$select public.preparar_adjunto_ticket(%L, 'vacio.png', 'image/png', 0)$$, :'ta'), 'adjunto_invalido'), 'archivo vacio no vale');
select ok(tests.error_es(format($$select public.preparar_adjunto_ticket(%L, '   ', 'image/png', 10)$$, :'ta'), 'adjunto_invalido'), 'nombre vacio no vale');
select ok(tests.error_es(format($$select public.preparar_adjunto_ticket(%L, 'x.png', 'image/png', 10)$$, :'tb'), 'ticket_no_encontrado'), 'no se adjunta a un ticket de otra empresa');
select public.preparar_adjunto_ticket(:'ta', '../../etc/passwd.png', 'image/png', 10) as adj2 \gset
select ok((:'adj2'::jsonb ->> 'ruta') !~ '\.\.', 'el nombre original nunca entra en la ruta');
select ok((select nombre_original from public.ticket_adjuntos where id = (:'adj2'::jsonb ->> 'adjunto_id')::uuid) !~ '/', 'el nombre original se limpia de barras');

-- Storage: subir
insert into storage.objects (bucket_id, name, owner) values ('portal-tickets', :'adj'::jsonb ->> 'ruta', tests.id('equipo_a'));
select is((select count(*)::int from storage.objects where bucket_id = 'portal-tickets'), 1, 'quien tiene el adjunto preparado sube a su ruta');
select ok(tests.error_es($$insert into storage.objects (bucket_id, name) values ('portal-tickets', 'cualquier/ruta.png')$$, 'new row violates row-level security policy for table "objects"'), 'una ruta que la base no genero se rechaza');
select tests.como(tests.id('equipo_b'));
select is((select count(*)::int from storage.objects where bucket_id = 'portal-tickets'), 0, 'otra empresa no ve el archivo');
select ok(tests.error_es(format($$insert into storage.objects (bucket_id, name) values ('portal-tickets', %L)$$, :'adj2'::jsonb ->> 'ruta'), 'new row violates row-level security policy for table "objects"'), 'otra empresa no sube a una ruta ajena');
select is(tests.afectadas($$delete from storage.objects where bucket_id = 'portal-tickets'$$), 0::bigint, 'nadie borra archivos desde la API');
select tests.como(tests.id('equipo_a'));
select is(tests.afectadas($$update storage.objects set name = name || 'x' where bucket_id = 'portal-tickets'$$), 0::bigint, 'nadie cambia archivos desde la API');
select tests.anonimo();
-- Como en Supabase real (el mock unico da permisos de tabla a anon): manda la RLS, y sin politica para anon no ve ninguna fila.
select is((select count(*)::int from storage.objects), 0, 'anonimo no ve ningun archivo');

select * from finish();
rollback;
