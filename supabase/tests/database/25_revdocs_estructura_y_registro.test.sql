-- Estructura, permisos de ejecucion, registro de actividad y limites de revisiones y documentos (sprint 3).
begin;
select plan(34);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_revdocs.sql
select tests.preparar_revdocs();

-- ---------- Estructura ----------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
              and c.relname in ('revisiones', 'revision_versiones', 'aprobaciones', 'documentos', 'documento_versiones',
                                'documento_permisos', 'archivos_cliente', 'subidas_reservadas')), 8, 'las 8 tablas del sprint 3 existen');
select is_empty($$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname in ('revisiones', 'revision_versiones', 'aprobaciones', 'documentos',
                     'documento_versiones', 'documento_permisos', 'archivos_cliente', 'subidas_reservadas')
                     and (not c.relrowsecurity
                          or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
                          or not exists (select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid where t.tgrelid = c.oid and f.proname = 'bloquear_escritura_ver_como')
                          or not exists (select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid where t.tgrelid = c.oid and f.proname = 'empresa_id_inmutable'))$$,
  'cada tabla nueva: RLS, politica, cerradura de "ver como" y empresa_id inmutable');
select is_empty($$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname in ('revisiones', 'revision_versiones', 'aprobaciones', 'documentos',
                     'documento_versiones', 'documento_permisos', 'archivos_cliente', 'subidas_reservadas')
                     and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f'
                       and k.conkey @> array[(select attnum from pg_attribute where attrelid = c.oid and attname = 'empresa_id')]
                       and k.confrelid <> 'public.empresas'::regclass)
                     and c.relname not in ('subidas_reservadas')$$,
  'las tablas hijas se enlazan con llave compuesta que incluye empresa_id (no solo por id)');
select is_empty($$select tablename || '.' || policyname from pg_policies
                   where schemaname = 'public' and tablename in ('revisiones', 'revision_versiones', 'aprobaciones', 'documentos',
                     'documento_versiones', 'documento_permisos', 'archivos_cliente', 'subidas_reservadas')
                     and (qual like '%private.es_admin_cliente%' or qual like '%private.tiene_permiso%')$$,
  'las politicas nuevas no llaman funciones por fila');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('revisiones', 'revision_versiones', 'aprobaciones', 'documentos',
                     'documento_versiones', 'documento_permisos', 'archivos_cliente', 'subidas_reservadas') and cmd <> 'SELECT'), 0, 'las tablas nuevas son de solo lectura desde la API: ninguna politica de escritura');
select is_empty($$select table_name::text || '.' || privilege_type from information_schema.role_table_grants
                   where table_schema = 'public' and grantee = 'authenticated' and privilege_type <> 'SELECT'
                     and table_name in ('revisiones', 'revision_versiones', 'aprobaciones', 'documentos', 'documento_versiones',
                       'documento_permisos', 'archivos_cliente', 'subidas_reservadas')$$, 'authenticated solo tiene SELECT en las tablas nuevas');
select ok(not has_column_privilege('authenticated', 'public.aprobaciones', 'ip', 'select')
      and not has_column_privilege('authenticated', 'public.aprobaciones', 'user_id', 'select')
      and not has_column_privilege('authenticated', 'public.aprobaciones', 'user_agent', 'select')
      and has_column_privilege('authenticated', 'public.aprobaciones', 'persona', 'select'), 'la evidencia (IP, usuario, navegador) no sale por la API; el nombre si');
select ok(not has_column_privilege('authenticated', 'public.subidas_reservadas', 'ruta', 'update'), 'nadie edita las rutas reservadas');

-- ---------- Funciones ----------
select is_empty($$select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname in ('reservar_subida', 'confirmar_archivo_cliente', 'borrar_archivo_cliente',
                     'marcar_archivo_recibido', 'crear_documento', 'confirmar_version_documento', 'fijar_visibilidad_documento',
                     'crear_revision', 'editar_borrador_revision', 'publicar_revision', 'nueva_version_revision', 'reabrir_revision',
                     'responder_revision', 'bandeja_revisiones', 'anotar_descarga')
                     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute')
                          or not has_function_privilege('authenticated', p.oid, 'execute'))$$,
  'las 15 funciones nuevas: solo authenticated las ejecuta (ni anon ni service_role)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('bandeja_revisiones', 'anotar_descarga') and not p.prosecdef), 2, 'la bandeja y anotar_descarga son SECURITY INVOKER (corren con las cerraduras del usuario)');
select is_empty($$select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname like 'registrar%'$$, 'ninguna funcion "registrar%" vive en public (reservado para auxiliares de private)');
select is_empty($$select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname in ('reservar_subida', 'confirmar_archivo_cliente', 'borrar_archivo_cliente',
                     'marcar_archivo_recibido', 'crear_documento', 'confirmar_version_documento', 'fijar_visibilidad_documento',
                     'crear_revision', 'editar_borrador_revision', 'publicar_revision', 'nueva_version_revision', 'reabrir_revision',
                     'responder_revision') and not p.prosecdef$$, 'las funciones de escritura son SECURITY DEFINER');
select ok(not has_function_privilege('authenticated', 'private.confirmar_reserva(uuid,text)', 'execute'), 'authenticated no llama confirmar_reserva directo');
select ok(not has_function_privilege('authenticated', 'private.trg_registro_revdocs()', 'execute'), 'authenticated no llama el trigger de registro');
select is((select valor ->> 'exigir_aprobacion_para_terminar' from public.configuracion where clave = 'revisiones'), 'true', 'configuracion: la exigencia de aprobacion esta encendida');

-- ---------- Registro de actividad ----------
select tests.como(tests.id('sa'), 'aal2');
select tests.crear_doc(tests.id('empresa_a'), tests.proy('Portal A'), 'Doc registro', 'personas', array[tests.id('miembro_equipo_a2')]);
select public.fijar_visibilidad_documento(tests.doc('Doc registro'), 'solo_admin');
select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Diseno registro', null, null, 'https://demo.test/r');
select public.publicar_revision(tests.rev('Diseno registro'));
select tests.como(tests.id('admin_a'), 'aal2');
select tests.desde('198.51.100.9');
select public.responder_revision(tests.rev('Diseno registro'), 1, 'apruebo');
select tests.archivo_cliente(tests.id('empresa_a'), 'reg.pdf');
select tests.como(tests.id('sa'), 'aal2');
select public.reabrir_revision(tests.rev('Diseno registro'), 'Se reabre para ajustar');
select public.marcar_archivo_recibido(tests.archivo('reg.pdf'));
select tests.admin();
select is((select string_agg(distinct accion, ',' order by accion) from public.registro_actividad
            where accion in ('revision_creada', 'revision_version_creada', 'revision_estado_cambiado', 'revision_respondida',
                             'documento_creado', 'documento_version_subida', 'documento_compartido', 'documento_acceso_revocado',
                             'documento_visibilidad_cambiada', 'archivo_cliente_subido', 'archivo_cliente_recibido')),
  'archivo_cliente_recibido,archivo_cliente_subido,documento_acceso_revocado,documento_compartido,documento_creado,documento_version_subida,documento_visibilidad_cambiada,revision_creada,revision_estado_cambiado,revision_respondida,revision_version_creada',
  'el registro anota creaciones, publicaciones, respuestas, documentos, comparticiones y archivos');
select is((select count(*)::int from public.registro_actividad where accion = 'revision_estado_cambiado' and detalle ->> 'despues' in ('publicada', 'aprobada', 'reabierta')), 3, 'el registro anota cada cambio de estado de la revision');
select is((select host(ip) from public.registro_actividad where accion = 'revision_respondida'), '198.51.100.9', 'registro: la respuesta del cliente trae su IP');
select is((select host(ip) from public.aprobaciones where revision_id = tests.rev('Diseno registro')), '198.51.100.9', 'aprobaciones: queda la IP en la propia fila');
select is((select detalle ->> 'decision' from public.registro_actividad where accion = 'revision_respondida'), 'apruebo', 'registro: queda la decision');
select is((select count(*)::int from public.registro_actividad where accion = 'archivo_cliente_subido' and empresa_id = tests.id('empresa_a') and actor_id = tests.id('admin_a')), 1, 'registro: la subida del cliente queda con empresa y autor');
select is((select detalle ->> 'motivo' from public.historial_proyecto where tipo = 'revision_reabierta'), 'Se reabre para ajustar', 'historial: la reapertura trae su motivo');
select is((select actor_tipo from public.historial_proyecto where tipo = 'revision_aprobada'), 'cliente', 'historial: la aprobacion figura como del cliente');
select is((select actor_tipo from public.historial_proyecto where tipo = 'revision_publicada'), 'equipo_websourcing', 'historial: la publicacion figura como del Equipo Websourcing');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.registro_actividad), 0, 'el cliente no lee el registro de actividad (ahi estan IP y autores)');
select is((select count(*)::int from public.historial_proyecto where tipo = 'documento_publicado' and detalle ->> 'titulo' = 'Doc registro'), 0, 'el documento privado no aparece en el historial del cliente');
select tests.como(tests.id('equipo_b'));
select is((select count(*)::int from public.historial_proyecto where tipo like 'revision%' or tipo like 'documento%'), 0, 'equipo B: nada del historial de A');

-- ---------- Limites ----------
select tests.como(tests.id('sa'), 'aal2');
select lives_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'r' || n || '.pdf', 'application/pdf', 10) from generate_series(1, 55) n$$, 'se pueden reservar muchas subidas seguidas...');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'extra.pdf', 'application/pdf', 10) from generate_series(1, 10)$$, 'P0001', 'demasiadas_subidas', '...pero con tope de 60 por hora por persona');
select tests.admin();
select throws_ok($$insert into public.subidas_reservadas (empresa_id, user_id, destino, bucket_id, ruta, nombre_original, mime_type, tamano_bytes, vence_en) values (tests.id('empresa_a'), tests.id('sa'), 'documento', 'documentos', tests.id('empresa_a') || '/x.pdf', 'x', 'application/pdf', 1, now() + interval '3 hours')$$, '23514', null, 'una reserva no puede durar mas de 2 horas');
select throws_ok($$insert into public.subidas_reservadas (empresa_id, user_id, destino, bucket_id, ruta, nombre_original, mime_type, tamano_bytes, vence_en) values (tests.id('empresa_a'), tests.id('sa'), 'documento', 'archivos-empresa', tests.id('empresa_a') || '/x.pdf', 'x', 'application/pdf', 1, now() + interval '1 hour')$$, '23514', null, 'el destino y el bucket deben coincidir');
select throws_ok($$delete from public.subidas_reservadas$$, '42501', null, 'las reservas no se borran');
select throws_ok($$insert into public.revision_versiones (empresa_id, revision_id, version, link_prueba) values (tests.id('empresa_a'), tests.rev('Diseno registro'), 5, 'javascript:alert(1)')$$, '23514', null, 'la tabla tambien exige https en los enlaces');
select throws_ok($$insert into public.aprobaciones (empresa_id, revision_id, version, decision, miembro_id, persona, user_id, comentario) values (tests.id('empresa_a'), tests.rev('Diseno registro'), 1, 'pido_cambios', tests.id('miembro_admin_a'), 'x', tests.id('admin_a'), 'ok')$$, '23514', null, 'la tabla tambien exige comentario al pedir cambios');

select * from finish();
rollback;
