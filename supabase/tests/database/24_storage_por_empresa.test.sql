-- Storage: buckets privados y reglas por empresa sobre storage.objects. Subir exige una reserva a nombre de la
-- persona; leer exige poder ver la fila dueña del archivo; borrar y pisar casi nadie. Cada empresa ve lo suyo.
begin;
select plan(64);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_revdocs.sql
select tests.preparar_revdocs();

-- ---------- Buckets ----------
select is((select count(*)::int from storage.buckets where id in ('documentos', 'archivos-empresa', 'capturas-revisiones') and not public), 3, 'los 3 buckets existen y son privados');
select is((select file_size_limit from storage.buckets where id = 'documentos'), 52428800::bigint, 'documentos: tope de 50 MB');
select is((select file_size_limit from storage.buckets where id = 'archivos-empresa'), 52428800::bigint, 'archivos-empresa: tope de 50 MB');
select is((select file_size_limit from storage.buckets where id = 'capturas-revisiones'), 10485760::bigint, 'capturas: tope de 10 MB');
select ok(not ('image/svg+xml' = any (select unnest(allowed_mime_types) from storage.buckets where id = 'archivos-empresa'))
          and 'application/pdf' = any (select unnest(allowed_mime_types) from storage.buckets where id = 'archivos-empresa'), 'archivos-empresa: tipos permitidos (PDF si, SVG no)');
select is((select allowed_mime_types from storage.buckets where id = 'capturas-revisiones'), array['image/png', 'image/jpeg', 'image/webp'], 'capturas: solo imagenes');

-- ---------- Datos ----------
select tests.como(tests.id('sa'), 'aal2');
select tests.crear_doc(tests.id('empresa_a'), tests.proy('Portal A'), 'Manual A', 'todo_el_equipo');
select tests.crear_doc(tests.id('empresa_a'), tests.proy('Portal A'), 'Acta A', 'personas', array[tests.id('miembro_equipo_a2')], 'acta');
select tests.crear_doc(tests.id('empresa_a'), tests.proy('Portal A'), 'Contrato A', 'solo_admin', '{}', 'contrato');
select tests.crear_doc(tests.id('empresa_b'), tests.proy('Portal B'), 'Manual B', 'todo_el_equipo');
select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Diseno A', null, null, 'https://demo.test/a');
select public.publicar_revision(tests.rev('Diseno A'));
select tests.como(tests.id('admin_a'), 'aal2');
select tests.archivo_cliente(tests.id('empresa_a'), 'logo-a.png', 'image/png');
select tests.como(tests.id('admin_b'), 'aal2');
select tests.archivo_cliente(tests.id('empresa_b'), 'logo-b.png', 'image/png');
-- Captura de "pido cambios" (equipo con permiso de aprobar).
select tests.como(tests.id('equipo_a2'));
select public.responder_revision(tests.rev('Diseno A'), 1, 'pido_cambios', 'Ver la captura adjunta',
  tests.reserva('captura', tests.id('empresa_a'), 'captura.png', 'image/png', 2000));
select tests.admin();
select is((select count(*)::int from storage.objects), 7, 'hay 7 objetos: 4 documentos, 2 archivos y 1 captura');
select ok((select captura_path from public.aprobaciones) like tests.id('empresa_a') || '/capturas/%', 'la captura quedo en la carpeta de la empresa');

-- ---------- Leer ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from storage.objects), 5, 'admin A: ve los 3 documentos, su archivo y la captura de su empresa');
select is((select count(*)::int from storage.objects where name not like tests.id('empresa_a') || '/%'), 0, 'admin A: ningun objeto de otra empresa');
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from storage.objects where bucket_id = 'documentos'), 1, 'equipo A: del bucket de documentos solo el que ve todo el equipo');
select is((select count(*)::int from storage.objects where name = tests.ruta_doc('Contrato A', 1)), 0, 'equipo A: no lee el objeto del contrato (aunque conozca la ruta)');
select is((select count(*)::int from storage.objects where name = tests.ruta_doc('Acta A', 1)), 0, 'equipo A: no lee el objeto del acta compartida con otra persona');
select is((select count(*)::int from storage.objects where bucket_id = 'archivos-empresa'), 1, 'equipo A: ve los archivos de su empresa');
select is((select count(*)::int from storage.objects where bucket_id = 'capturas-revisiones'), 1, 'equipo A: ve las capturas de las revisiones de su empresa');
select tests.como(tests.id('equipo_a2'));
select is((select count(*)::int from storage.objects where bucket_id = 'documentos'), 2, 'equipo A2: ve el del equipo y el acta compartida con el');
select tests.como(tests.id('sa'), 'aal2');
select public.fijar_visibilidad_documento(tests.doc('Acta A'), 'solo_admin');
select tests.como(tests.id('equipo_a2'));
select is((select count(*)::int from storage.objects where bucket_id = 'documentos'), 1, 'equipo A2: al quitarle el acta, el objeto se cierra al instante');
select tests.como(tests.id('admin_b'), 'aal2');
select is((select count(*)::int from storage.objects), 2, 'admin B: solo su documento y su archivo');
select is((select count(*)::int from storage.objects where name like tests.id('empresa_a') || '/%'), 0, 'admin B: ningun objeto de A, ni por su ruta exacta');
select is((select count(*)::int from storage.objects where name = tests.ruta_archivo('logo-a.png')), 0, 'admin B: no lee el logo de A conociendo la ruta');
select tests.como(tests.id('equipo_b'));
select is((select count(*)::int from storage.objects where bucket_id = 'capturas-revisiones'), 0, 'equipo B: ninguna captura de A');
select tests.como(tests.id('quitado_a'));
select is((select count(*)::int from storage.objects), 0, 'miembro quitado: no lee nada');
select tests.como(tests.id('bloq_a'));
select is((select count(*)::int from storage.objects), 0, 'miembro bloqueado: no lee nada');
select tests.como(tests.id('admin_c'), 'aal2');
select is((select count(*)::int from storage.objects), 0, 'empresa pausada: no lee nada');
select tests.anonimo();
select is((select count(*)::int from storage.objects), 0, 'visitante: no lee nada');
select tests.como(tests.id('sa'), 'aal1');
select is((select count(*)::int from storage.objects), 0, 'super admin SIN 2FA: no lee nada');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from storage.objects), 7, 'super admin: lee todo');
-- "Ver como" lee exactamente lo que ve el cliente.
select public.iniciar_ver_como(tests.id('empresa_a'), 'equipo');
select is((select count(*)::int from storage.objects), 3, 'ver como equipo de A: 1 documento del equipo, 1 archivo y 1 captura');
select public.terminar_ver_como();

-- ---------- Subir ----------
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', tests.id('empresa_a') || '/archivos/sin-reserva.pdf', '{"size": 10, "mimetype": "application/pdf"}')$$, '42501', null, 'sin reserva no se sube, aunque sea a su propia carpeta');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', 'raiz.pdf', '{"size": 10, "mimetype": "application/pdf"}')$$, '42501', null, 'tampoco en la raiz del bucket');
select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'a.pdf', 'application/pdf', 10) ->> 'ruta' as ruta_ok \gset
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('documentos', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_ok'), '42501', null, 'la reserva vale para su bucket, no para otro');
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, replace(:'ruta_ok', tests.id('empresa_a')::text, tests.id('empresa_b')::text)), '42501', null, 'no se sube a la carpeta de otra empresa con la reserva propia');
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_ok' || '/../otra.pdf'), '42501', null, 'no se cambia la ruta reservada (ni con ../)');
select tests.como(tests.id('equipo_a'));
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_ok'), '42501', null, 'otra persona no usa la reserva de admin A');
select tests.como(tests.id('admin_a'), 'aal2');
select lives_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_ok'), 'con su reserva, a su carpeta y en su bucket: sube');
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_ok'), null, null, 'no se pisa un objeto ya subido');
select lives_ok(format('select public.confirmar_archivo_cliente(%L)', (select id from public.subidas_reservadas where ruta = :'ruta_ok')), 'lo confirma');
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_ok'), null, null, 'una reserva usada no sube otra vez');
-- Reserva vencida.
select tests.admin();
insert into public.subidas_reservadas (empresa_id, user_id, destino, bucket_id, ruta, nombre_original, mime_type, tamano_bytes, creada_en, vence_en)
values (tests.id('empresa_a'), tests.id('admin_a'), 'archivo_cliente', 'archivos-empresa', tests.id('empresa_a') || '/archivos/vencida.pdf', 'v.pdf', 'application/pdf', 100, now() - interval '2 hours', now() - interval '1 hour');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', tests.id('empresa_a') || '/archivos/vencida.pdf', '{"size": 10, "mimetype": "application/pdf"}')$$, '42501', null, 'una reserva vencida no sube');
-- Cada destino exige su permiso al subir.
select tests.como(tests.id('equipo_a'));
select throws_ok($$select tests.subir('archivo_cliente', tests.id('empresa_a'), 'x.pdf', 'application/pdf', 10)$$, '42501', 'no_autorizado', 'equipo sin "subir archivos": ni reserva');
select tests.admin();
-- Si le quitan el permiso despues de reservar, la regla de Storage tambien lo vuelve a leer.
update public.miembros set subir_archivos = true where id = tests.id('miembro_equipo_a');
select tests.como(tests.id('equipo_a'));
select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'e.pdf', 'application/pdf', 10) ->> 'ruta' as ruta_equipo \gset
select tests.admin();
update public.miembros set subir_archivos = false where id = tests.id('miembro_equipo_a');
select tests.como(tests.id('equipo_a'));
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_equipo'), '42501', null, 'permiso quitado entre la reserva y la subida: no sube');
-- Documentos: solo Websourcing.
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'd.pdf', 'application/pdf', 10)$$, '42501', 'no_autorizado', 'el cliente no sube al bucket de documentos');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata) values ('documentos', tests.id('empresa_a') || '/documentos/mio.pdf', '{"size": 10, "mimetype": "application/pdf"}')$$, '42501', null, 'el cliente no escribe directo en el bucket de documentos');
select tests.como(tests.id('sa'), 'aal2');
select public.reservar_subida('documento', tests.id('empresa_a'), 'd.pdf', 'application/pdf', 10) ->> 'ruta' as ruta_doc \gset
select tests.como(tests.id('sa'), 'aal1');
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('documentos', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_doc'), '42501', null, 'super admin SIN 2FA: no sube');
select tests.como(tests.id('sa'), 'aal2');
select public.iniciar_ver_como(tests.id('empresa_a'));
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('documentos', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_doc'), '42501', null, 'en "ver como": no sube (solo lectura)');
select public.terminar_ver_como();
select lives_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('documentos', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_doc'), 'super admin con 2FA: sube con su reserva');
select tests.anonimo();
select throws_ok($$insert into storage.objects (bucket_id, name, metadata) values ('documentos', 'x/y.pdf', '{}')$$, '42501', null, 'visitante: no sube');
-- Capturas: solo con el permiso de aprobar.
select tests.como(tests.id('equipo_a'));
select throws_ok($$select public.reservar_subida('captura', tests.id('empresa_a'), 'c.png', 'image/png', 10)$$, '42501', 'no_autorizado', 'equipo sin "aprobar": no sube capturas');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.reservar_subida('captura', tests.id('empresa_a'), 'c.pdf', 'application/pdf', 10)$$, 'P0001', 'tipo_no_permitido', 'una captura debe ser imagen');
select throws_ok($$select public.reservar_subida('captura', tests.id('empresa_a'), 'c.png', 'image/png', 10485761)$$, 'P0001', 'archivo_demasiado_grande', 'una captura pesa 10 MB como maximo');

-- ---------- Borrar y pisar ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is(tests.afectadas($$delete from storage.objects where bucket_id = 'documentos'$$), 0::bigint, 'admin A: no borra documentos');
select is(tests.afectadas($$delete from storage.objects where bucket_id = 'archivos-empresa'$$), 0::bigint, 'admin A: no borra archivos que siguen vigentes en el portal');
select is(tests.afectadas($$delete from storage.objects where bucket_id = 'capturas-revisiones'$$), 0::bigint, 'admin A: no borra capturas');
select is(tests.afectadas($$update storage.objects set name = name || 'x'$$), 0::bigint, 'admin A: no pisa ni renombra objetos');
select tests.como(tests.id('sa'), 'aal2');
select is(tests.afectadas($$delete from storage.objects where bucket_id = 'documentos'$$), 0::bigint, 'super admin: tampoco borra documentos desde la API (nunca se reemplazan en silencio)');
select is(tests.afectadas($$update storage.objects set name = name || 'x'$$), 0::bigint, 'super admin: no pisa objetos');
select tests.como(tests.id('admin_a'), 'aal2');
select public.borrar_archivo_cliente(tests.archivo('logo-a.png'));
select tests.como(tests.id('equipo_a2'));
select is(tests.afectadas(format($f$delete from storage.objects where name = %L$f$, tests.ruta_archivo('logo-a.png'))), 0::bigint, 'otra persona de la empresa no borra el objeto');
select tests.como(tests.id('admin_b'), 'aal2');
select is(tests.afectadas(format($f$delete from storage.objects where name = %L$f$, tests.ruta_archivo('logo-a.png'))), 0::bigint, 'admin B: no borra objetos de A');
select tests.como(tests.id('admin_a'), 'aal2');
select is(tests.afectadas(format($f$delete from storage.objects where name = %L$f$, tests.ruta_archivo('logo-a.png'))), 1::bigint, 'quien lo subio y ya lo borro en el portal: quita el objeto');
-- Recibido: queda fijo, tambien en Storage.
select tests.como(tests.id('sa'), 'aal2');
select public.marcar_archivo_recibido(tests.archivo('logo-b.png'));
select tests.como(tests.id('admin_b'), 'aal2');
select is(tests.afectadas(format($f$delete from storage.objects where name = %L$f$, tests.ruta_archivo('logo-b.png'))), 0::bigint, 'un archivo recibido queda fijo: ni su dueño lo borra de Storage');

-- ---------- Estructura de las reglas ----------
select tests.admin();
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'revdocs_%'), 3, 'hay 3 reglas de Storage (leer, subir, borrar)');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'), 0, 'no hay regla de UPDATE: nadie pisa un archivo');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'revdocs_%' and roles <> '{authenticated}'), 0, 'ninguna regla de Storage es para anon ni public');
select is((select with_check is not null from pg_policies where schemaname = 'storage' and policyname = 'revdocs_subir'), true, 'la regla de subir lleva WITH CHECK');

select * from finish();
rollback;
