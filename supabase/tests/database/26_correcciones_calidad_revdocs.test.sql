-- Correcciones del informe de Calidad al sprint 3: A-1 (vista de aprobaciones), A-2 y M-6 (valores de origen),
-- M-4 (registro de descargas solo en la empresa propia) y B-1 (reservas de Storage de otra persona).
begin;
select plan(26);

-- ---------- Valores de ORIGEN (antes de que las pruebas apaguen el 2FA para sus sesiones aal1) ----------
select is((select valor ->> 'exigir_aprobacion_para_terminar' from public.configuracion where clave = 'revisiones'), 'true',
  'A-2: el candado "terminado requiere aprobacion" nace ENCENDIDO');
select is((select valor ->> 'exigir_2fa_admin_cliente' from public.configuracion where clave = 'seguridad'), 'true',
  'M-6 (D-014): el 2FA del admin del cliente nace ENCENDIDO');

\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_revdocs.sql
select tests.preparar_revdocs();

select tests.como(tests.id('sa'), 'aal2');
select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Diseno A', null, null, 'https://demo.test/a');
select public.publicar_revision(tests.rev('Diseno A'));
select tests.crear_doc(tests.id('empresa_a'), tests.proy('Portal A'), 'Manual A', 'todo_el_equipo');
select tests.crear_doc(tests.id('empresa_b'), tests.proy('Portal B'), 'Manual B', 'todo_el_equipo');
select tests.como(tests.id('admin_a'), 'aal2');
select public.responder_revision(tests.rev('Diseno A'), 1, 'pido_cambios', 'Cambiar el logo del encabezado');

-- ---------- A-1: la vista que no falla ----------
select is((select count(*)::int from public.v_aprobaciones), 1, 'A-1: el cliente lee sus aprobaciones con select * de la vista');
select is((select persona from public.v_aprobaciones), 'Usuario admin.a', 'A-1: la vista trae quien respondio');
select throws_ok($$select * from public.aprobaciones$$, '42501', null, 'A-1: select * sobre la TABLA sigue fallando (por eso la nota manda usar la vista)');
select throws_ok($$select ip from public.v_aprobaciones$$, '42703', null, 'A-1: la vista no trae la IP');
select throws_ok($$select user_agent from public.v_aprobaciones$$, '42703', null, 'A-1: la vista no trae el navegador');
select throws_ok($$select user_id from public.v_aprobaciones$$, '42703', null, 'A-1: la vista no trae el usuario');
select tests.como(tests.id('admin_b'), 'aal2');
select is((select count(*)::int from public.v_aprobaciones), 0, 'A-1: admin B no ve las aprobaciones de A por la vista');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.v_aprobaciones), 1, 'A-1: el super admin tambien lee con select * de la vista');
select tests.como(tests.id('sa'), 'aal1');
select is((select count(*)::int from public.v_aprobaciones), 0, 'A-1: super admin SIN 2FA no ve nada por la vista');
select tests.anonimo();
select throws_ok($$select * from public.v_aprobaciones$$, '42501', null, 'A-1: el visitante no lee la vista');
select tests.admin();
select ok((select reloptions::text like '%security_invoker=true%' from pg_class where oid = 'public.v_aprobaciones'::regclass), 'A-1: la vista es security_invoker');

-- ---------- M-6: con el 2FA encendido, el admin sin 2FA no entra ni aprueba ----------
select tests.admin();
update public.configuracion set valor = jsonb_set(valor, '{exigir_2fa_admin_cliente}', 'true'::jsonb) where clave = 'seguridad';
select tests.como(tests.id('admin_a'), 'aal1');
select is((select count(*)::int from public.revisiones), 0, 'M-6: admin A sin 2FA no ve revisiones');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', 'no_autorizado', 'M-6: admin A sin 2FA no aprueba');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.revisiones), 1, 'M-6: con 2FA si');

-- ---------- M-4: registrar_descarga no escribe en el registro de otra empresa ----------
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select private.registrar_descarga('documento', tests.version_doc('Manual B', 1), tests.id('empresa_b'), tests.doc('Manual B'))$$, '42501', 'no_autorizado', 'M-4: admin A no anota una descarga en la empresa B');
select throws_ok($$select private.registrar_descarga('documento', gen_random_uuid(), tests.id('empresa_a'), gen_random_uuid())$$, 'P0001', 'archivo_no_encontrado', 'M-4: tampoco una descarga de una fila que no existe');
select throws_ok($$select private.registrar_descarga('documento', tests.version_doc('Manual B', 1), tests.id('empresa_a'), tests.doc('Manual B'))$$, 'P0001', 'archivo_no_encontrado', 'M-4: ni una fila de B presentada como de A');
select lives_ok($$select public.anotar_descarga('documento', tests.version_doc('Manual A', 1))$$, 'M-4: la descarga legitima sigue anotandose');
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'descarga' and empresa_id = tests.id('empresa_b')), 0, 'M-4: nada quedo en el registro de B');
select is((select count(*)::int from public.registro_actividad where accion = 'descarga' and empresa_id = tests.id('empresa_a')), 1, 'M-4: la de A si quedo');

-- ---------- B-1: una reserva ajena no sirve, aunque quien la usa tenga el mismo permiso ----------
update public.miembros set subir_archivos = true where id = tests.id('miembro_equipo_a');
select tests.como(tests.id('admin_a'), 'aal2');
select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'ajena.pdf', 'application/pdf', 10) ->> 'ruta' as ruta_admin \gset
select tests.subir('archivo_cliente', tests.id('empresa_a'), 'sin-confirmar.pdf', 'application/pdf', 10) ->> 'ruta' as ruta_sin_confirmar \gset
select is((select count(*)::int from storage.objects where name = :'ruta_sin_confirmar'), 1, 'B-1: quien reservo y subio ve su objeto sin confirmar');
select tests.como(tests.id('equipo_a'));
select lives_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'propia.pdf', 'application/pdf', 10)$$, 'B-1: equipo A tiene el permiso de subir (la prueba es valida)');
select throws_ok(format($f$insert into storage.objects (bucket_id, name, metadata) values ('archivos-empresa', %L, '{"size": 10, "mimetype": "application/pdf"}')$f$, :'ruta_admin'),
  '42501', null, 'B-1: equipo A, con permiso, no sube con la reserva de admin A');
select is((select count(*)::int from storage.objects where name = :'ruta_sin_confirmar'), 0, 'B-1: equipo A, con permiso, no lee el objeto sin confirmar de admin A');

select * from finish();
rollback;
