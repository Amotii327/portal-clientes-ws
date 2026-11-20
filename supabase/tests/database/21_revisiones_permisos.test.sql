-- Revisiones: separacion por empresa y por rol. Ni el visitante, ni el equipo sin permiso, ni el super admin
-- (que no aprueba en nombre del cliente), ni "ver como" pueden aprobar. Cada empresa ve solo lo suyo.
begin;
select plan(59);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_revdocs.sql
select tests.preparar_revdocs();

select tests.como(tests.id('sa'), 'aal2');
select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Diseno A', null, null, 'https://demo.test/a');
select public.publicar_revision(tests.rev('Diseno A'));
select public.crear_revision(tests.proy('Portal A'), 'sprint', 'Borrador sprint A1', tests.sprint('Portal A', 1), null, 'https://demo.test/a1');
select public.crear_revision(tests.proy('Portal B'), 'diseno', 'Diseno B', null, null, 'https://demo.test/b');
select public.publicar_revision(tests.rev('Diseno B'));
select tests.admin();

-- ---------- Visitante ----------
select tests.anonimo();
select throws_ok($$select count(*) from public.revisiones$$, '42501', null, 'visitante: no lee revisiones');
select throws_ok($$select count(*) from public.aprobaciones$$, '42501', null, 'visitante: no lee aprobaciones');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', null, 'visitante: no aprueba');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Hackeo')$$, '42501', null, 'visitante: no crea revisiones');
select throws_ok($$select public.bandeja_revisiones()$$, '42501', null, 'visitante: no abre la bandeja');

-- ---------- Admin A ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((select string_agg(titulo, ',') from public.revisiones), 'Diseno A', 'admin A: ve su revision publicada y no el borrador ni la de B');
select is((select count(*)::int from public.revisiones where id = tests.rev('Diseno B')), 0, 'admin A: no ve la revision de B ni por su id');
select throws_ok($$select public.responder_revision(tests.rev('Diseno B'), 1, 'apruebo')$$, 'P0001', 'revision_no_encontrada', 'admin A: aprobar la revision de B responde "no encontrada" (no revela que existe)');
select throws_ok($$select public.responder_revision(tests.rev('Borrador sprint A1'), 1, 'apruebo')$$, 'P0001', 'revision_no_encontrada', 'admin A: no aprueba un borrador');
select throws_ok($$select public.responder_revision(gen_random_uuid(), 1, 'apruebo')$$, 'P0001', 'revision_no_encontrada', 'mismo mensaje para un id que no existe');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Mia')$$, '42501', 'no_autorizado', 'admin A: no crea revisiones');
select throws_ok($$select public.publicar_revision(tests.rev('Diseno A'))$$, '42501', 'no_autorizado', 'admin A: no publica');
select throws_ok($$select public.bandeja_revisiones()$$, '42501', 'no_autorizado', 'admin A: no abre la bandeja del super admin');
select throws_ok($$update public.revisiones set estado = 'aprobada'$$, '42501', null, 'admin A: no cambia el estado a mano');
select throws_ok($$insert into public.aprobaciones (empresa_id, revision_id, version, decision, miembro_id, persona, user_id) values (tests.id('empresa_a'), tests.rev('Diseno A'), 1, 'apruebo', tests.id('miembro_admin_a'), 'yo', tests.id('admin_a'))$$, '42501', null, 'admin A: no inserta aprobaciones directo');
select throws_ok($$delete from public.revisiones$$, '42501', null, 'admin A: no borra revisiones');
select throws_ok($$select ip from public.aprobaciones$$, '42501', null, 'admin A: no puede leer la IP de las aprobaciones');
select throws_ok($$select user_id from public.aprobaciones$$, '42501', null, 'admin A: no puede leer el usuario de las aprobaciones (solo el nombre)');
select throws_ok($$select user_agent from public.aprobaciones$$, '42501', null, 'admin A: no puede leer el navegador');

-- ---------- Equipo A sin permiso "aprobar" ----------
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.revisiones), 1, 'equipo A: ve las revisiones publicadas (por defecto ve avance y revisiones)');
select is((select count(*)::int from public.revision_versiones), 1, 'equipo A: ve la version publicada');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', 'sin_permiso_aprobar', 'equipo A sin "aprobar": no aprueba');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'pido_cambios', 'quiero otro color')$$, '42501', 'sin_permiso_aprobar', 'equipo A sin "aprobar": no pide cambios');
select is((select count(*)::int from public.aprobaciones), 0, 'equipo A: no quedo ninguna respuesta');

-- ---------- Sin acceso ----------
select tests.como(tests.id('quitado_a'));
select is((select count(*)::int from public.revisiones), 0, 'miembro quitado: no ve revisiones');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', 'no_autorizado', 'miembro quitado: no aprueba');
select tests.como(tests.id('bloq_a'));
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', 'no_autorizado', 'miembro bloqueado: no aprueba');
select tests.como(tests.id('perfil_bloq'));
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', 'no_autorizado', 'perfil bloqueado: no aprueba');
select tests.como(tests.id('admin_c'), 'aal2');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', 'no_autorizado', 'admin de empresa pausada: no aprueba');
select tests.como(tests.id('sin_perfil'));
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', 'no_autorizado', 'usuario sin perfil: no aprueba');

-- ---------- Admin B ----------
select tests.como(tests.id('admin_b'), 'aal2');
select is((select string_agg(titulo, ',') from public.revisiones), 'Diseno B', 'admin B: ve solo la suya');
select is((select count(*)::int from public.revision_versiones where link_prueba like '%/a%'), 0, 'admin B: no ve versiones de A');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, 'P0001', 'revision_no_encontrada', 'admin B: no aprueba la revision de A');
select is((select estado from public.revisiones where id = tests.rev('Diseno A') ), null, 'admin B: la revision de A no existe para el');

-- ---------- Super admin: no aprueba en nombre del cliente ----------
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.revisiones), 3, 'super admin: ve todas, incluido el borrador');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', 'no_autorizado', 'super admin: no aprueba en nombre del cliente');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'pido_cambios', 'cambios en nombre del cliente')$$, '42501', 'no_autorizado', 'super admin: tampoco pide cambios en su nombre');
select tests.como(tests.id('sa'), 'aal1');
select is((select count(*)::int from public.revisiones), 0, 'super admin SIN 2FA: no ve revisiones');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Sin 2FA')$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no crea revisiones');
select throws_ok($$select public.bandeja_revisiones()$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no abre la bandeja');

-- ---------- "Ver como el cliente": solo lectura, no aprueba ----------
select tests.como(tests.id('sa'), 'aal2');
select public.iniciar_ver_como(tests.id('empresa_a'));
select is((select string_agg(titulo, ',') from public.revisiones), 'Diseno A', 'ver como admin A: ve lo mismo que el cliente (sin borradores)');
select throws_ok($$select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo')$$, '42501', 'ver_como_solo_lectura', 'ver como: no aprueba');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Desde ver como')$$, '42501', 'ver_como_solo_lectura', 'ver como: no crea revisiones');
select throws_ok($$select public.publicar_revision(tests.rev('Borrador sprint A1'))$$, '42501', 'ver_como_solo_lectura', 'ver como: no publica');
select throws_ok($$select public.reservar_subida('captura', tests.id('empresa_a'), 'c.png', 'image/png', 100)$$, '42501', 'ver_como_solo_lectura', 'ver como: no sube capturas');
select throws_ok($$insert into public.revisiones (empresa_id, proyecto_id, tipo, titulo) values (tests.id('empresa_a'), tests.proy('Portal A'), 'diseno', 'x')$$, '42501', null, 'ver como: ninguna tabla acepta escrituras');
select public.terminar_ver_como();
select tests.admin();

-- ---------- Integridad (como superusuario, para probar las llaves y los triggers) ----------
select throws_ok($$insert into public.revisiones (empresa_id, proyecto_id, tipo, sprint_id, titulo) values (tests.id('empresa_a'), tests.proy('Portal B'), 'sprint', tests.sprint('Portal A', 2), 'Mezclada')$$, '23503', null, 'llave compuesta: una revision de la empresa A no apunta a un proyecto de B');
select throws_ok($$insert into public.revisiones (empresa_id, proyecto_id, tipo, sprint_id, titulo) values (tests.id('empresa_b'), tests.proy('Portal B'), 'sprint', tests.sprint('Portal A', 2), 'Sprint ajeno')$$, '23503', null, 'llave compuesta: una revision de B no apunta a un sprint de A');
select throws_ok($$update public.revisiones set empresa_id = tests.id('empresa_b') where id = tests.rev('Diseno A')$$, '23514', 'empresa_id_inmutable', 'empresa_id no se puede cambiar');
select throws_ok($$update public.revisiones set tipo = 'sprint' where id = tests.rev('Diseno A')$$, '23514', null, 'el tipo no cambia');
select throws_ok($$update public.revision_versiones set link_prueba = 'https://otro.test/x' where revision_id = tests.rev('Diseno A')$$, '23514', 'version_publicada_inmutable', 'una version publicada no se edita ni por la base');
select throws_ok($$delete from public.revision_versiones$$, '42501', null, 'las versiones no se borran');
select throws_ok($$delete from public.revisiones$$, '42501', null, 'las revisiones no se borran');
-- Una aprobacion hecha: solo se agrega.
select tests.como(tests.id('equipo_a2'));
select public.responder_revision(tests.rev('Diseno A'), 1, 'apruebo', 'Todo bien');
select tests.admin();
select throws_ok($$update public.aprobaciones set decision = 'pido_cambios', comentario = 'cambio de opinion'$$, '42501', null, 'una aprobacion no se edita');
select throws_ok($$delete from public.aprobaciones$$, '42501', null, 'una aprobacion no se borra');
select throws_ok($$truncate public.aprobaciones$$, '42501', null, 'una aprobacion no se trunca');
select throws_ok($$insert into public.aprobaciones (empresa_id, revision_id, version, decision, miembro_id, persona, user_id) values (tests.id('empresa_a'), tests.rev('Diseno A'), 1, 'apruebo', tests.id('miembro_admin_a'), 'x', tests.id('admin_a'))$$, '23505', null, 'una sola respuesta por version');
select throws_ok($$insert into public.aprobaciones (empresa_id, revision_id, version, decision, miembro_id, persona, user_id) values (tests.id('empresa_a'), tests.rev('Diseno A'), 2, 'apruebo', tests.id('miembro_admin_a'), 'x', tests.id('admin_a'))$$, '23503', null, 'no hay respuesta a una version que no existe');
select throws_ok($$insert into public.aprobaciones (empresa_id, revision_id, version, decision, miembro_id, persona, user_id) values (tests.id('empresa_b'), tests.rev('Diseno B'), 1, 'apruebo', tests.id('miembro_admin_a'), 'x', tests.id('admin_a'))$$, '23503', null, 'llave compuesta: el miembro que aprueba es de la misma empresa que la revision');

select * from finish();
rollback;
