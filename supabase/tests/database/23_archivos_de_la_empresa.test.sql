-- "Archivos de la empresa" (Modulo 6): los sube el admin o quien tenga el permiso "subir archivos";
-- los ven su empresa y Websourcing; el cliente borra lo suyo hasta que Websourcing lo marque "recibido".
begin;
select plan(74);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_revdocs.sql
select tests.preparar_revdocs();

-- ---------- Quien puede subir ----------
select tests.anonimo();
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'logo.png', 'image/png', 100)$$, '42501', null, 'visitante: no sube');
select throws_ok($$select public.confirmar_archivo_cliente(gen_random_uuid())$$, '42501', null, 'visitante: no confirma');
select tests.como(tests.id('equipo_a'));
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'logo.png', 'image/png', 100)$$, '42501', 'no_autorizado', 'equipo A sin "subir archivos": no sube');
select tests.como(tests.id('equipo_a2'));
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'logo.png', 'image/png', 100)$$, '42501', 'no_autorizado', 'equipo con "aprobar" y "ver dinero" pero sin "subir archivos": no sube');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_b'), 'logo.png', 'image/png', 100)$$, '42501', 'no_autorizado', 'admin A: no sube a la carpeta de B');
select tests.como(tests.id('quitado_a'));
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'logo.png', 'image/png', 100)$$, '42501', 'no_autorizado', 'miembro quitado: no sube');
select tests.como(tests.id('bloq_a'));
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'logo.png', 'image/png', 100)$$, '42501', 'no_autorizado', 'miembro bloqueado: no sube');
select tests.como(tests.id('admin_c'), 'aal2');
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_c'), 'logo.png', 'image/png', 100)$$, '42501', 'no_autorizado', 'admin de empresa pausada: no sube');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'logo.png', 'image/png', 100)$$, '42501', 'no_autorizado', 'super admin: no sube en nombre del cliente');
select throws_ok($$select public.confirmar_archivo_cliente(gen_random_uuid())$$, '42501', 'no_autorizado', 'super admin: no confirma archivos del cliente');
select public.iniciar_ver_como(tests.id('empresa_a'));
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'logo.png', 'image/png', 100)$$, '42501', 'ver_como_solo_lectura', 'ver como: no sube');
select public.terminar_ver_como();

-- ---------- El admin sube ----------
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'virus.exe', 'application/x-msdownload', 100)$$, 'P0001', 'tipo_no_permitido', 'tipo no permitido');
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'peso.zip', 'application/zip', 52428801)$$, 'P0001', 'archivo_demasiado_grande', 'mas de 50 MB');
select is((select (public.confirmar_archivo_cliente(tests.reserva('archivo_cliente', tests.id('empresa_a'), 'logo.png', 'image/png', 4096), 'Logo en alta resolucion', tests.proy('Portal A'))) ? 'archivo_id'), true, 'admin A sube un archivo con nota y proyecto');
select is((select count(*)::int from public.archivos_cliente), 1, 'admin A: ve su archivo');
select is((select nota from public.archivos_cliente), 'Logo en alta resolucion', 'queda la nota');
select is((select estado from public.archivos_cliente), 'nuevo', 'nace en estado "nuevo"');
select is((select subido_por_nombre from public.archivos_cliente), 'Usuario admin.a', 'queda quien lo subio');
select ok((select creado_en from public.archivos_cliente) is not null, 'queda la fecha');
select is((select tamano_bytes from public.archivos_cliente), 4096::bigint, 'queda el tamano (el que midio Storage)');
select throws_ok($$select public.confirmar_archivo_cliente(tests.reserva('archivo_cliente', tests.id('empresa_a'), 'otro.png', 'image/png'), null, tests.proy('Portal B'))$$, 'P0001', 'proyecto_no_encontrado', 'el proyecto debe ser de su empresa');
select throws_ok($$select public.confirmar_archivo_cliente(null)$$, 'P0001', 'reserva_invalida', 'sin reserva no hay archivo');

-- Reservas: una vez, vigentes, con archivo real.
select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'sin-subir.pdf', 'application/pdf', 100) ->> 'reserva_id' as reserva_vacia \gset
select throws_ok(format('select public.confirmar_archivo_cliente(%L)', :'reserva_vacia'), 'P0001', 'archivo_no_subido', 'confirmar sin haber subido el archivo a Storage: rechazado');
select tests.admin();
-- Un objeto con otro tipo o tamano del reservado (como si hubieran cambiado el archivo al subirlo).
insert into storage.objects (bucket_id, name, metadata)
select bucket_id, ruta, '{"size": 100, "mimetype": "application/x-msdownload"}'::jsonb from public.subidas_reservadas where id = :'reserva_vacia';
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok(format('select public.confirmar_archivo_cliente(%L)', :'reserva_vacia'), 'P0001', 'tipo_no_permitido', 'Storage midio otro tipo que el reservado: rechazado');
select tests.admin();
update storage.objects set metadata = '{"size": 99999999, "mimetype": "application/pdf"}' where name = (select ruta from public.subidas_reservadas where id = :'reserva_vacia');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok(format('select public.confirmar_archivo_cliente(%L)', :'reserva_vacia'), 'P0001', 'archivo_demasiado_grande', 'Storage midio mas de 50 MB: rechazado');
select tests.admin();
-- Reserva vencida (se inserta ya vencida; la fecha de creacion no se puede cambiar despues).
insert into public.subidas_reservadas (id, empresa_id, user_id, destino, bucket_id, ruta, nombre_original, mime_type, tamano_bytes, creada_en, vence_en)
values ('00000000-0000-0000-0000-0000000f0001', tests.id('empresa_a'), tests.id('admin_a'), 'archivo_cliente', 'archivos-empresa',
        tests.id('empresa_a') || '/archivos/vencida.pdf', 'vencida.pdf', 'application/pdf', 100, now() - interval '2 hours', now() - interval '1 hour');
insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', tests.id('empresa_a') || '/archivos/vencida.pdf', '{"size": 100, "mimetype": "application/pdf"}');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.confirmar_archivo_cliente('00000000-0000-0000-0000-0000000f0001')$$, 'P0001', 'reserva_vencida', 'una reserva vencida no sirve');
select tests.como(tests.id('admin_b'), 'aal2');
select throws_ok(format('select public.confirmar_archivo_cliente(%L)', :'reserva_vacia'), 'P0001', 'reserva_invalida', 'admin B: no confirma la reserva de A');
select tests.como(tests.id('admin_a'), 'aal2');
select tests.reserva('archivo_cliente', tests.id('empresa_a'), 'dos.pdf', 'application/pdf') as r_dos \gset
select lives_ok(format('select public.confirmar_archivo_cliente(%L)', :'r_dos'), 'confirma una reserva');
select throws_ok(format('select public.confirmar_archivo_cliente(%L)', :'r_dos'), 'P0001', 'reserva_invalida', 'una reserva se usa una sola vez');

-- ---------- Permiso "subir archivos" ----------
select tests.admin();
update public.miembros set subir_archivos = true where id = tests.id('miembro_equipo_a');
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.archivos_cliente), 2, 'equipo A: ve los archivos de su empresa');
select lives_ok($$select tests.archivo_cliente(tests.id('empresa_a'), 'mapa.pdf')$$, 'equipo A con "subir archivos": sube');
-- El permiso se vuelve a leer al confirmar: si se lo quitan entre la reserva y la confirmacion, no pasa.
select tests.reserva('archivo_cliente', tests.id('empresa_a'), 'tarde.pdf', 'application/pdf') as r_tarde \gset
select tests.admin();
update public.miembros set subir_archivos = false where id = tests.id('miembro_equipo_a');
select tests.como(tests.id('equipo_a'));
select throws_ok(format('select public.confirmar_archivo_cliente(%L)', :'r_tarde'), '42501', 'no_autorizado', 'sin el permiso (quitado a ultima hora): no confirma');
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'otra.pdf', 'application/pdf', 100)$$, '42501', 'no_autorizado', 'sin el permiso: no reserva');
select is((select count(*)::int from public.archivos_cliente where nombre_original = 'mapa.pdf'), 1, 'lo que subio mientras tuvo el permiso sigue ahi');

-- ---------- Quien los ve ----------
select tests.como(tests.id('equipo_a2'));
select is((select count(*)::int from public.archivos_cliente), 3, 'equipo A2: ve los archivos de su empresa (logo, dos y mapa)');
select tests.como(tests.id('admin_b'), 'aal2');
select is((select count(*)::int from public.archivos_cliente), 0, 'admin B: no ve ningun archivo de A');
select is((select count(*)::int from public.archivos_cliente where id = tests.archivo('logo.png')), 0, 'admin B: no ve el logo de A ni por su id');
select lives_ok($$select tests.archivo_cliente(tests.id('empresa_b'), 'contrato-b.pdf')$$, 'admin B sube a su propia carpeta');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.archivos_cliente where nombre_original = 'contrato-b.pdf'), 0, 'admin A: no ve el archivo de B');
select is((select count(*)::int from public.archivos_cliente), 3, 'admin A: sigue viendo solo los 3 suyos');
select tests.como(tests.id('quitado_a'));
select is((select count(*)::int from public.archivos_cliente), 0, 'miembro quitado: no ve archivos');
select tests.anonimo();
select throws_ok($$select count(*) from public.archivos_cliente$$, '42501', null, 'visitante: no lee archivos');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.archivos_cliente), 4, 'super admin: ve los archivos de todas las empresas');
select is((select count(*)::int from public.archivos_cliente where estado = 'nuevo'), 4, 'super admin: todos esperan ser marcados como recibidos (su bandeja)');
select is((select count(*)::int from public.registro_actividad where accion = 'archivo_cliente_subido' and empresa_id = tests.id('empresa_a')), 3, 'el super admin tiene el aviso de cada subida en el registro');

-- ---------- Recibido y borrado ----------
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.marcar_archivo_recibido(tests.archivo('logo.png'))$$, '42501', 'no_autorizado', 'admin A: no marca como recibido');
select tests.como(tests.id('sa'), 'aal2');
select lives_ok($$select public.marcar_archivo_recibido(tests.archivo('logo.png'))$$, 'super admin: marca el logo como recibido');
select throws_ok($$select public.marcar_archivo_recibido(tests.archivo('logo.png'))$$, 'P0001', 'archivo_ya_recibido', 'ya estaba recibido');
select throws_ok($$select public.marcar_archivo_recibido(gen_random_uuid())$$, 'P0001', 'archivo_no_encontrado', 'archivo inexistente');
select is((select recibido_en is not null from public.archivos_cliente where nombre_original = 'logo.png'), true, 'queda la fecha de recibido');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.borrar_archivo_cliente(tests.archivo('logo.png'))$$, 'P0001', 'archivo_ya_recibido', 'recibido: queda fijo, el cliente ya no lo borra');
select throws_ok($$select public.borrar_archivo_cliente(tests.archivo('mapa.pdf'))$$, '42501', 'no_autorizado', 'admin A: solo borra lo que subio el mismo');
select tests.como(tests.id('admin_b'), 'aal2');
select throws_ok($$select public.borrar_archivo_cliente(tests.archivo('mapa.pdf'))$$, 'P0001', 'archivo_no_encontrado', 'admin B: no borra archivos de A (ni sabe que existen)');
select tests.como(tests.id('equipo_a'));
select is((select public.borrar_archivo_cliente(tests.archivo('mapa.pdf')) ->> 'bucket'), 'archivos-empresa', 'equipo A: borra lo que subio y recibe la ruta para quitarlo de Storage');
select throws_ok($$select public.borrar_archivo_cliente(tests.archivo('mapa.pdf'))$$, 'P0001', 'archivo_no_encontrado', 'ya borrado');
select is((select count(*)::int from public.archivos_cliente where nombre_original = 'mapa.pdf'), 0, 'el cliente ya no ve el archivo borrado');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.archivos_cliente where nombre_original = 'mapa.pdf' and borrado_en is not null), 1, 'Websourcing conserva el rastro del borrado');
select throws_ok($$select public.marcar_archivo_recibido(tests.archivo('mapa.pdf'))$$, 'P0001', 'archivo_no_encontrado', 'un archivo borrado ya no se marca como recibido');

-- Escrituras directas: ninguna.
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$update public.archivos_cliente set estado = 'recibido'$$, '42501', null, 'admin A: no actualiza archivos directo');
select throws_ok($$update public.archivos_cliente set borrado_en = now()$$, '42501', null, 'admin A: no borra directo');
select throws_ok($$delete from public.archivos_cliente$$, '42501', null, 'admin A: no elimina filas');
select throws_ok($$insert into public.archivos_cliente (empresa_id, storage_path, nombre_original, mime_type, tamano_bytes, subido_por, subido_por_nombre) values (tests.id('empresa_a'), tests.id('empresa_a') || '/archivos/falso.pdf', 'falso.pdf', 'application/pdf', 1, tests.id('admin_a'), 'yo')$$, '42501', null, 'admin A: no inserta archivos directo (sin pasar por Storage)');
select throws_ok($$insert into public.subidas_reservadas (empresa_id, user_id, destino, bucket_id, ruta, nombre_original, mime_type, tamano_bytes, vence_en) values (tests.id('empresa_a'), tests.id('admin_a'), 'archivo_cliente', 'archivos-empresa', tests.id('empresa_a') || '/archivos/mia.pdf', 'mia.pdf', 'application/pdf', 1, now() + interval '1 hour')$$, '42501', null, 'admin A: no se reserva rutas a su gusto');
select is((select count(*)::int from public.subidas_reservadas), 4, 'admin A: ve solo sus propias reservas');
select tests.como(tests.id('admin_b'), 'aal2');
select is((select count(*)::int from public.subidas_reservadas), 1, 'admin B: ve solo sus reservas');

-- ---------- Integridad (superusuario) ----------
select tests.admin();
select throws_ok($$update public.archivos_cliente set empresa_id = tests.id('empresa_b') where nombre_original = 'dos.pdf'$$, '23514', 'empresa_id_inmutable', 'empresa_id del archivo no cambia');
select throws_ok($$update public.archivos_cliente set storage_path = 'otra/ruta' where nombre_original = 'dos.pdf'$$, '23514', null, 'la ruta del archivo no cambia');
select throws_ok($$update public.archivos_cliente set borrado_en = now() where nombre_original = 'logo.png'$$, '23514', null, 'un archivo recibido no se puede dar por borrado');
select throws_ok($$insert into public.archivos_cliente (empresa_id, proyecto_id, storage_path, nombre_original, mime_type, tamano_bytes, subido_por, subido_por_nombre) values (tests.id('empresa_a'), tests.proy('Portal B'), tests.id('empresa_a') || '/archivos/x.pdf', 'x.pdf', 'application/pdf', 1, tests.id('admin_a'), 'x')$$, '23503', null, 'llave compuesta: un archivo de A no cuelga de un proyecto de B');
select throws_ok($$insert into public.archivos_cliente (empresa_id, storage_path, nombre_original, mime_type, tamano_bytes, subido_por, subido_por_nombre) values (tests.id('empresa_a'), tests.id('empresa_b') || '/archivos/x.pdf', 'x.pdf', 'application/pdf', 1, tests.id('admin_a'), 'x')$$, '23514', null, 'la ruta debe empezar por la empresa dueña');
select throws_ok($$insert into public.archivos_cliente (empresa_id, storage_path, nombre_original, mime_type, tamano_bytes, subido_por, subido_por_nombre) values (tests.id('empresa_a'), tests.id('empresa_a') || '/archivos/x.pdf', 'x.pdf', 'application/pdf', 52428801, tests.id('admin_a'), 'x')$$, '23514', null, 'la tabla tampoco admite mas de 50 MB');
select throws_ok($$delete from public.archivos_cliente$$, '42501', null, 'ni el dueño de la tabla borra archivos (solo borrado suave)');
select is((select count(*)::int from public.registro_actividad where accion = 'archivo_cliente_recibido'), 1, 'registro: el recibido queda anotado');
select is((select count(*)::int from public.registro_actividad where accion = 'archivo_cliente_borrado' and actor_id = tests.id('equipo_a')), 1, 'registro: el borrado queda anotado con su autor');

select * from finish();
rollback;
