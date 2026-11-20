-- Documentos (Modulo 6): categorias, versiones que nunca se reemplazan, visibilidad decidida por Websourcing
-- (todo el equipo, solo el admin, personas elegidas) y separacion por empresa.
begin;
select plan(91);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_revdocs.sql
select tests.preparar_revdocs();

-- ---------- Websourcing publica ----------
select tests.como(tests.id('sa'), 'aal2');
select tests.crear_doc(tests.id('empresa_a'), tests.proy('Portal A'), 'Contrato A', 'solo_admin', '{}', 'contrato');
select tests.crear_doc(tests.id('empresa_a'), tests.proy('Portal A'), 'Manual para todos', 'todo_el_equipo', '{}', 'manual');
select tests.crear_doc(tests.id('empresa_a'), tests.proy('Portal A'), 'Acta compartida', 'personas', array[tests.id('miembro_equipo_a2')], 'acta');
select tests.crear_doc(tests.id('empresa_b'), tests.proy('Portal B'), 'Manual de B', 'todo_el_equipo', '{}', 'manual');

select is((select version_actual from public.documentos where titulo = 'Manual para todos'), 1, 'el documento nace en version 1');
select is((select count(*)::int from public.documento_versiones), 4, 'cada documento trae su primera version con archivo');
select throws_ok($$select public.crear_documento(tests.id('empresa_a'), null, 'otra', 'Raro', null, 'todo_el_equipo', '{}', tests.reserva('documento', tests.id('empresa_a'), 'r.pdf', 'application/pdf'))$$,
  '22023', 'datos_invalidos', 'categoria fuera de la lista: rechazada');
select throws_ok($$select public.crear_documento(tests.id('empresa_a'), null, 'otro', 'Raro', null, 'publico', '{}', tests.reserva('documento', tests.id('empresa_a'), 'r.pdf', 'application/pdf'))$$,
  '22023', 'datos_invalidos', 'visibilidad desconocida: rechazada');
select throws_ok($$select public.crear_documento(tests.id('empresa_a'), null, 'otro', 'Sin personas', null, 'personas', '{}', tests.reserva('documento', tests.id('empresa_a'), 'r.pdf', 'application/pdf'))$$,
  '22023', 'datos_invalidos', 'visibilidad "personas" sin elegir a nadie: rechazada');
select throws_ok($$select public.crear_documento(tests.id('empresa_a'), null, 'otro', 'Persona de B', null, 'personas', array[tests.id('miembro_equipo_b')], tests.reserva('documento', tests.id('empresa_a'), 'r.pdf', 'application/pdf'))$$,
  '22023', 'miembro_invalido', 'no se comparte con una persona de otra empresa');
select throws_ok($$select public.crear_documento(tests.id('empresa_a'), null, 'otro', 'Persona quitada', null, 'personas', array[tests.id('miembro_quitado_a')], tests.reserva('documento', tests.id('empresa_a'), 'r.pdf', 'application/pdf'))$$,
  '22023', 'miembro_invalido', 'no se comparte con una persona quitada del equipo');
select throws_ok($$select public.crear_documento(tests.id('empresa_a'), tests.proy('Portal B'), 'otro', 'Proyecto ajeno', null, 'todo_el_equipo', '{}', tests.reserva('documento', tests.id('empresa_a'), 'r.pdf', 'application/pdf'))$$,
  'P0001', 'proyecto_no_encontrado', 'el proyecto debe ser de la misma empresa');
select throws_ok($$select public.crear_documento(tests.id('empresa_c'), null, 'otro', 'Empresa pausada', null, 'todo_el_equipo', '{}', gen_random_uuid())$$,
  'P0001', 'empresa_no_disponible', 'no se publica en una empresa pausada');
select throws_ok($$select public.crear_documento(tests.id('empresa_a'), null, 'otro', 'Reserva ajena', null, 'todo_el_equipo', '{}', tests.reserva('documento', tests.id('empresa_b'), 'r.pdf', 'application/pdf'))$$,
  'P0001', 'reserva_invalida', 'la reserva debe ser de la misma empresa del documento');
select throws_ok($$select public.crear_documento(tests.id('empresa_a'), null, 'otro', 'Sin reserva', null, 'todo_el_equipo', '{}', gen_random_uuid())$$,
  'P0001', 'reserva_invalida', 'sin reserva no hay documento');

-- ---------- Quien ve que ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((select string_agg(titulo, ',' order by titulo) from public.documentos), 'Acta compartida,Contrato A,Manual para todos', 'admin A: ve los 3 documentos de su empresa (los de "solo admin" y "personas" tambien)');
select is((select count(*)::int from public.documento_versiones), 3, 'admin A: ve las versiones de sus 3 documentos');
select is((select count(*)::int from public.documentos where titulo = 'Manual de B'), 0, 'admin A: no ve el documento de B');
select is((select count(*)::int from public.documento_permisos), 1, 'admin A: ve con quien esta compartido el documento');

select tests.como(tests.id('equipo_a'));
select is((select string_agg(titulo, ',') from public.documentos), 'Manual para todos', 'equipo A: solo el documento "para todo el equipo"');
select is((select count(*)::int from public.documento_versiones), 1, 'equipo A: solo las versiones de lo que ve');
select is((select count(*)::int from public.documento_versiones where documento_id = tests.doc('Contrato A')), 0, 'equipo A: la version del contrato no sale ni pidiendola por su id');
select is((select count(*)::int from public.documento_permisos), 0, 'equipo A: no ve las comparticiones de otros');

select tests.como(tests.id('equipo_a2'));
select is((select string_agg(titulo, ',' order by titulo) from public.documentos), 'Acta compartida,Manual para todos', 'equipo A2: el de todos y el que Websourcing le compartio a el');
select is((select count(*)::int from public.documento_permisos), 1, 'equipo A2: ve su propia comparticion');

select tests.como(tests.id('admin_b'), 'aal2');
select is((select string_agg(titulo, ',') from public.documentos), 'Manual de B', 'admin B: solo lo suyo');
select is((select count(*)::int from public.documento_versiones where documento_id in (tests.doc('Contrato A'), tests.doc('Manual para todos'))), 0, 'admin B: ninguna version de A');
select is((select count(*)::int from public.documento_permisos), 0, 'admin B: ninguna comparticion de A');

select tests.como(tests.id('equipo_b'));
select is((select string_agg(titulo, ',') from public.documentos), 'Manual de B', 'equipo B: ve lo de todo el equipo de B');

select tests.como(tests.id('quitado_a'));
select is((select count(*)::int from public.documentos), 0, 'miembro quitado: no ve documentos');
select tests.como(tests.id('bloq_a'));
select is((select count(*)::int from public.documentos), 0, 'miembro bloqueado: no ve documentos');
select tests.como(tests.id('perfil_bloq'));
select is((select count(*)::int from public.documentos), 0, 'perfil bloqueado: no ve documentos');
select tests.como(tests.id('admin_c'), 'aal2');
select is((select count(*)::int from public.documentos), 0, 'empresa pausada: no ve documentos');
select tests.anonimo();
select throws_ok($$select count(*) from public.documentos$$, '42501', null, 'visitante: no lee documentos');
select throws_ok($$select count(*) from public.documento_versiones$$, '42501', null, 'visitante: no lee versiones');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'x.pdf', 'application/pdf', 10)$$, '42501', null, 'visitante: no reserva subidas');

select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.documentos), 4, 'super admin: ve todos los documentos');

-- ---------- Quien publica ----------
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.crear_documento(tests.id('empresa_a'), null, 'otro', 'Del cliente', null, 'todo_el_equipo', '{}', gen_random_uuid())$$, '42501', 'no_autorizado', 'admin A: no publica documentos (los publica Websourcing)');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'x.pdf', 'application/pdf', 10)$$, '42501', 'no_autorizado', 'admin A: no reserva subidas de documentos');
select throws_ok($$select public.fijar_visibilidad_documento(tests.doc('Contrato A'), 'todo_el_equipo')$$, '42501', 'no_autorizado', 'admin A: no cambia la visibilidad');
select throws_ok($$update public.documentos set visibilidad = 'todo_el_equipo'$$, '42501', null, 'admin A: no cambia la visibilidad directo');
select throws_ok($$insert into public.documento_permisos (empresa_id, documento_id, miembro_id) values (tests.id('empresa_a'), tests.doc('Contrato A'), tests.id('miembro_equipo_a'))$$, '42501', null, 'admin A: no comparte directo');
select tests.como(tests.id('sa'), 'aal1');
select throws_ok($$select public.fijar_visibilidad_documento(tests.doc('Contrato A'), 'todo_el_equipo')$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no cambia la visibilidad');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'x.pdf', 'application/pdf', 10)$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no reserva subidas');

-- ---------- Versiones: nunca se reemplaza en silencio ----------
select tests.como(tests.id('sa'), 'aal2');
select is((select public.confirmar_version_documento(tests.doc('Manual para todos'),
  tests.reserva('documento', tests.id('empresa_a'), 'manual-v2.pdf', 'application/pdf', 2048), 'Se agrego el capitulo 3') ->> 'version'), '2', 'sube la version 2');
select is((select version_actual from public.documentos where titulo = 'Manual para todos'), 2, 'el documento apunta a la version 2');
select is((select count(*)::int from public.documento_versiones where documento_id = tests.doc('Manual para todos')), 2, 'la version 1 sigue ahi');
select isnt(tests.ruta_doc('Manual para todos', 1), tests.ruta_doc('Manual para todos', 2), 'cada version tiene su propio archivo');
select is((select nombre_original from public.documento_versiones where documento_id = tests.doc('Manual para todos') and version = 1), 'Manual para todos.pdf', 'la version 1 conserva su nombre original');
select throws_ok($$select public.confirmar_version_documento(tests.doc('Manual para todos'), tests.reserva('documento', tests.id('empresa_b'), 'm.pdf', 'application/pdf'))$$,
  'P0001', 'reserva_invalida', 'una reserva de otra empresa no sirve para este documento');
select throws_ok($$select public.confirmar_version_documento(gen_random_uuid(), gen_random_uuid())$$, 'P0001', 'documento_no_encontrado', 'documento inexistente');
select tests.admin();
select throws_ok($$update public.documento_versiones set storage_path = 'x' where version = 1$$, '42501', null, 'una version no se edita');
select throws_ok($$delete from public.documento_versiones$$, '42501', null, 'una version no se borra');
select throws_ok($$delete from public.documentos$$, '42501', null, 'un documento no se borra');
select throws_ok($$insert into public.documento_versiones (empresa_id, documento_id, version, storage_path, nombre_original, mime_type, tamano_bytes) values (tests.id('empresa_b'), tests.doc('Manual para todos'), 9, tests.id('empresa_b') || '/documentos/x.pdf', 'x', 'application/pdf', 10)$$,
  '23503', null, 'llave compuesta: una version de B no cuelga de un documento de A');
select throws_ok($$insert into public.documento_versiones (empresa_id, documento_id, version, storage_path, nombre_original, mime_type, tamano_bytes) values (tests.id('empresa_a'), tests.doc('Manual para todos'), 9, tests.id('empresa_b') || '/documentos/x.pdf', 'x', 'application/pdf', 10)$$,
  '23514', null, 'la ruta del archivo debe empezar por la empresa dueña');
select throws_ok($$update public.documentos set empresa_id = tests.id('empresa_b') where titulo = 'Contrato A'$$, '23514', 'empresa_id_inmutable', 'empresa_id del documento no cambia');
select throws_ok($$update public.documentos set categoria = 'otro' where titulo = 'Contrato A'$$, '23514', null, 'la categoria no cambia');

-- ---------- Cambiar quien lo ve ----------
select tests.como(tests.id('sa'), 'aal2');
select lives_ok($$select public.fijar_visibilidad_documento(tests.doc('Contrato A'), 'personas', array[tests.id('miembro_equipo_a')])$$, 'el contrato pasa a "personas" con equipo A');
select tests.como(tests.id('equipo_a'));
select is((select string_agg(titulo, ',' order by titulo) from public.documentos), 'Contrato A,Manual para todos', 'equipo A: ahora ve el contrato');
select tests.como(tests.id('sa'), 'aal2');
select lives_ok($$select public.fijar_visibilidad_documento(tests.doc('Contrato A'), 'personas', array[tests.id('miembro_equipo_a2')])$$, 'se le quita a equipo A y se le da a A2');
select tests.como(tests.id('equipo_a'));
select is((select string_agg(titulo, ',') from public.documentos), 'Manual para todos', 'equipo A: ya no ve el contrato');
select tests.como(tests.id('equipo_a2'));
select is((select count(*)::int from public.documentos where titulo = 'Contrato A'), 1, 'equipo A2: ve el contrato');
select tests.admin();
select is((select count(*)::int from public.documento_permisos where documento_id = tests.doc('Contrato A')), 2, 'revocar no borra: la fila queda marcada');
select is((select count(*)::int from public.documento_permisos where documento_id = tests.doc('Contrato A') and revocado_en is not null), 1, 'una comparticion revocada');
select tests.como(tests.id('sa'), 'aal2');
select public.fijar_visibilidad_documento(tests.doc('Contrato A'), 'solo_admin');
select tests.como(tests.id('equipo_a2'));
select is((select count(*)::int from public.documentos where titulo = 'Contrato A'), 0, 'solo_admin: A2 deja de verlo');
select tests.admin();
select is((select count(*)::int from public.documento_permisos where documento_id = tests.doc('Contrato A') and revocado_en is null), 0, 'solo_admin: no queda ninguna comparticion activa');
select tests.como(tests.id('sa'), 'aal2');
select public.fijar_visibilidad_documento(tests.doc('Contrato A'), 'personas', array[tests.id('miembro_equipo_a')]);
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.documentos where titulo = 'Contrato A'), 1, 'volver a compartir con alguien revocado le devuelve el acceso');
-- Si la persona sale del equipo, pierde el acceso aunque la fila siga.
select tests.admin();
update public.miembros set quitado_en = now() where id = tests.id('miembro_equipo_a');
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.documentos), 0, 'una persona quitada del equipo pierde el acceso al instante');

-- ---------- Historial del proyecto ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.historial_proyecto where tipo = 'documento_publicado'), 2, 'admin A: el historial anuncia el manual (v1 y v2) y no los documentos privados');
select is((select count(*)::int from public.historial_proyecto where tipo = 'documento_publicado' and detalle ->> 'titulo' = 'Contrato A'), 0, 'admin A: el historial no revela el titulo de un documento privado');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.historial_proyecto where tipo = 'documento_publicado'), 5, 'super admin: ve todas las publicaciones (4 documentos y la version 2 del manual)');

-- ---------- Tipos y tamanos ----------
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'virus.exe', 'application/x-msdownload', 100)$$, 'P0001', 'tipo_no_permitido', 'un ejecutable no se sube');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'macro.docm', 'application/vnd.ms-word.document.macroEnabled.12', 100)$$, 'P0001', 'tipo_no_permitido', 'Office con macros no se sube');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'viejo.doc', 'application/msword', 100)$$, 'P0001', 'tipo_no_permitido', 'los formatos viejos de Office (admiten macros) no se suben');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'logo.svg', 'image/svg+xml', 100)$$, 'P0001', 'tipo_no_permitido', 'SVG no se sube (puede llevar scripts)');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'grande.pdf', 'application/pdf', 52428801)$$, 'P0001', 'archivo_demasiado_grande', 'mas de 50 MB: rechazado');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'vacio.pdf', 'application/pdf', 0)$$, 'P0001', 'archivo_demasiado_grande', 'archivo vacio: rechazado');
select lives_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'justo.pdf', 'application/pdf', 52428800)$$, 'exactamente 50 MB: permitido');
select lives_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 100)$$, 'hojas de calculo: permitidas');
select lives_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'a.zip', 'application/zip', 100)$$, 'ZIP: permitido');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_c'), 'x.pdf', 'application/pdf', 100)$$, 'P0001', 'empresa_no_disponible', 'no se reserva en una empresa pausada');
select throws_ok($$select public.reservar_subida('foto', tests.id('empresa_a'), 'x.pdf', 'application/pdf', 100)$$, '22023', 'datos_invalidos', 'destino desconocido');
select (public.reservar_subida('documento', tests.id('empresa_a'), '../../etc/pasa\wd.pdf', 'application/pdf', 100) ->> 'ruta') as ruta_nueva \gset
select matches(:'ruta_nueva'::text, '^' || tests.id('empresa_a')::text || '/documentos/[0-9a-f-]{36}\.pdf$', 'la ruta la genera el servidor: empresa/carpeta/uuid.ext');
select is((select nombre_original from public.subidas_reservadas where ruta = :'ruta_nueva'), '....etcpasawd.pdf', 'el nombre original se limpia de separadores (solo se muestra, nunca es la ruta)');

-- ---------- Revision de tipo "documento" y descargas ----------
select lives_ok($$select public.crear_revision(tests.proy('Portal A'), 'documento', 'Revisar el manual', null, tests.doc('Manual para todos'))$$, 'crea una revision de un documento');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'documento', 'Doc de B', null, tests.doc('Manual de B'))$$, 'P0001', 'documento_no_encontrado', 'el documento a revisar debe ser de la misma empresa');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'sprint', 'Acta mala', tests.sprint('Portal A', 1), null, 'https://x.test/a', null, tests.doc('Manual para todos'))$$, 'P0001', 'acta_invalida', 'el acta debe ser un documento de categoria "acta"');
select lives_ok($$select public.crear_revision(tests.proy('Portal A'), 'sprint', 'Con acta', tests.sprint('Portal A', 1), null, 'https://x.test/a', null, tests.doc('Acta compartida'))$$, 'una revision con su acta');
select public.publicar_revision(tests.rev('Revisar el manual'));
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.historial_proyecto where tipo = 'revision_publicada'), 0, 'la revision de un documento no se anuncia en el historial del cliente');
select lives_ok($$select public.anotar_descarga('documento', tests.version_doc('Contrato A', 1))$$, 'admin A: anota la descarga de un documento que ve');
select tests.como(tests.id('equipo_b'));
select throws_ok($$select public.anotar_descarga('documento', tests.version_doc('Contrato A', 1))$$, 'P0001', 'archivo_no_encontrado', 'equipo B: no puede anotar (ni descargar) un documento de A');
select throws_ok($$select public.anotar_descarga('captura', gen_random_uuid())$$, '22023', 'datos_invalidos', 'tipo de descarga desconocido');
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'descarga' and actor_id = tests.id('admin_a')), 1, 'la descarga queda en el registro con su autor');
select is((select count(*)::int from public.registro_actividad where accion = 'descarga' and actor_id = tests.id('equipo_b')), 0, 'el intento de B no dejo descarga');

select * from finish();
rollback;
