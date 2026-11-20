-- Revisiones y aprobaciones (Modulo 3): crear, publicar, responder, versiones, reabrir y la atadura al avance.
begin;
select plan(89);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_revdocs.sql
select tests.preparar_revdocs();

-- ---------- Websourcing prepara el diseno (borrador) ----------
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Diseno del portal', null, null, 'http://inseguro.test/p')$$,
  '22023', 'enlace_invalido', 'el link de prueba debe ser https');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'sprint', 'Sin sprint')$$,
  '22023', 'datos_invalidos', 'una revision de sprint necesita el sprint');
select is((select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Diseno del portal') ->> 'version'), '1', 'crea la revision del diseno en version 1');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'diseno', 'Otro diseno')$$, 'P0001', 'revision_ya_existe', 'solo un diseno por proyecto (las rondas son versiones)');
select throws_ok($$select public.publicar_revision(tests.rev('Diseno del portal'))$$, 'P0001', 'revision_sin_contenido', 'no se publica sin link de prueba ni video');
select lives_ok($$select public.editar_borrador_revision(tests.rev('Diseno del portal'), p_link_prueba => 'https://demo.portal.websourcing.com.co/diseno', p_resumen => 'Pantallas de inicio y panel')$$, 'edita el borrador');
select is((select estado from public.revisiones where id = tests.rev('Diseno del portal')), 'borrador', 'la revision esta en borrador');
select is(tests.estado_hito('Portal A', 5), 'pendiente', 'borrador: el hito 5 sigue pendiente');

-- El cliente no ve borradores.
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.revisiones), 0, 'admin A: no ve la revision en borrador');
select is((select count(*)::int from public.revision_versiones), 0, 'admin A: no ve las versiones del borrador');

-- ---------- Publicar ----------
select tests.como(tests.id('sa'), 'aal2');
select is((select public.publicar_revision(tests.rev('Diseno del portal')) ->> 'version'), '1', 'publica la version 1');
select is(tests.estado_hito('Portal A', 5), 'esperando_aprobacion', 'publicada: el hito 5 pasa a "esperando aprobacion"');
select throws_ok($$select public.publicar_revision(tests.rev('Diseno del portal'))$$, 'P0001', 'revision_ya_publicada', 'no se publica dos veces');
select throws_ok($$select public.editar_borrador_revision(tests.rev('Diseno del portal'), p_resumen => 'cambio')$$, 'P0001', 'sin_borrador', 'una version publicada no se edita');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 5), p_estado => 'terminado')$$, 'P0001', 'terminado_requiere_aprobacion',
  'el super admin no termina a mano el hito de diseno mientras la revision no este aprobada');

select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.revisiones), 1, 'admin A: ve la revision publicada');
select is((select link_prueba from public.revision_versiones), 'https://demo.portal.websourcing.com.co/diseno', 'admin A: ve el link de prueba');

-- ---------- Pide cambios ----------
select throws_ok($$select public.responder_revision(tests.rev('Diseno del portal'), 1, 'pido_cambios')$$, '22023', 'cambios_requiere_comentario', 'pedir cambios exige escribir que cambiar');
select throws_ok($$select public.responder_revision(tests.rev('Diseno del portal'), 1, 'pido_cambios', 'ok')$$, '22023', 'cambios_requiere_comentario', 'el comentario debe tener al menos 5 caracteres');
select throws_ok($$select public.responder_revision(tests.rev('Diseno del portal'), 1, 'quizas', 'texto largo')$$, '22023', 'datos_invalidos', 'decision desconocida: rechazada');
select throws_ok($$select public.responder_revision(tests.rev('Diseno del portal'), 7, 'apruebo')$$, 'P0001', 'version_desactualizada', 'solo se responde la version vigente');
select tests.desde('203.0.113.7', 'Mozilla/5.0 (Prueba)');
select is((select public.responder_revision(tests.rev('Diseno del portal'), 1, 'pido_cambios', 'Cambiar el color del boton principal') ->> 'estado'), 'cambios_pedidos', 'pide cambios con comentario');
select is(tests.estado_hito('Portal A', 5), 'en_curso', 'cambios pedidos: el hito 5 vuelve a "en curso"');
select throws_ok($$select public.responder_revision(tests.rev('Diseno del portal'), 1, 'apruebo')$$, 'P0001', 'revision_no_pendiente', 'ya respondida: no se responde otra vez');

-- Evidencia: quien, cuando e IP (solo para el super admin).
select tests.admin();
select is((select host(ip) from public.aprobaciones where revision_id = tests.rev('Diseno del portal')), '203.0.113.7', 'queda la IP de quien respondio (private.ip_cliente)');
select is((select user_agent from public.aprobaciones where revision_id = tests.rev('Diseno del portal')), 'Mozilla/5.0 (Prueba)', 'queda el navegador');
select is((select user_id from public.aprobaciones where revision_id = tests.rev('Diseno del portal')), tests.id('admin_a'), 'queda quien respondio');
select is((select persona from public.aprobaciones where revision_id = tests.rev('Diseno del portal')), 'Usuario admin.a', 'queda el nombre de quien respondio');
select is((select host(ip) from public.registro_actividad where accion = 'revision_respondida' limit 1), '203.0.113.7', 'el registro de actividad tambien guarda la IP');
select is((select actor_id from public.registro_actividad where accion = 'revision_respondida' limit 1), tests.id('admin_a'), 'el registro guarda el autor');

-- ---------- Version 2 ----------
select tests.como(tests.id('sa'), 'aal2');
select is((select public.nueva_version_revision(tests.rev('Diseno del portal')) ->> 'version'), '2', 'abre el borrador de la version 2');
select throws_ok($$select public.nueva_version_revision(tests.rev('Diseno del portal'))$$, 'P0001', 'ya_hay_borrador', 'solo un borrador a la vez');
select is((select link_prueba from public.revision_versiones where revision_id = tests.rev('Diseno del portal') and version = 2),
  'https://demo.portal.websourcing.com.co/diseno', 'la version 2 copia el contenido de la anterior');
select lives_ok($$select public.editar_borrador_revision(tests.rev('Diseno del portal'), p_link_prueba => 'https://demo.portal.websourcing.com.co/diseno-v2')$$, 'edita el borrador de la v2');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.revision_versiones), 1, 'admin A: aun no ve la v2 (es borrador)');
select tests.como(tests.id('sa'), 'aal2');
select is((select public.publicar_revision(tests.rev('Diseno del portal')) ->> 'version'), '2', 'publica la version 2');
select is(tests.estado_hito('Portal A', 5), 'esperando_aprobacion', 'v2 publicada: hito 5 espera aprobacion otra vez');

select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.revision_versiones), 2, 'admin A: ve las dos versiones publicadas');
select is((select count(*)::int from public.aprobaciones where decision = 'pido_cambios'), 1, 'admin A: ve su peticion de cambios con la version');
select throws_ok($$select public.responder_revision(tests.rev('Diseno del portal'), 1, 'apruebo')$$, 'P0001', 'version_desactualizada', 'aprobar la v1 cuando ya esta la v2: rechazado');
select is((select public.responder_revision(tests.rev('Diseno del portal'), 2, 'apruebo') ->> 'estado'), 'aprobada', 'aprueba la version 2');
select is(tests.estado_hito('Portal A', 5), 'terminado', 'aprobada: el hito 5 queda terminado');
select tests.admin();
select is((select fecha_real from public.hitos where id = tests.hito('Portal A', 5)), (now() at time zone 'America/Bogota')::date, 'el hito 5 trae la fecha real de hoy (Colombia)');
select is(tests.avance('Portal A'), '1/13=7.69', 'avance: el diseno aprobado suma una parte (11 hitos + 2 sprints = 13)');
select is((select version from public.aprobaciones where decision = 'apruebo'), 2, 'la aprobacion queda con la version aprobada');

-- Una aprobacion no se deshace desde el portal.
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.responder_revision(tests.rev('Diseno del portal'), 2, 'pido_cambios', 'me arrepenti de aprobar')$$, 'P0001', 'revision_no_pendiente', 'no se puede cambiar una aprobacion desde el portal');
select throws_ok($$select public.reabrir_revision(tests.rev('Diseno del portal'), 'quiero reabrirla')$$, '42501', 'no_autorizado', 'el cliente no reabre revisiones');

select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 5), p_estado => 'en_curso')$$, 'P0001', 'reabrir_requiere_revision', 'un diseno aprobado no baja de "terminado" con editar_hito');
select is(tests.estado_hito('Portal A', 5), 'terminado', 'el hito 5 aprobado sigue terminado');
-- Solo el super admin la reabre, con motivo, y queda en el historial.
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.reabrir_revision(tests.rev('Diseno del portal'), 'x')$$, '22023', 'datos_invalidos', 'reabrir exige un motivo');
select lives_ok($$select public.reabrir_revision(tests.rev('Diseno del portal'), 'Falto incluir la pantalla de facturas')$$, 'el super admin reabre la revision');
select is((select estado from public.revisiones where id = tests.rev('Diseno del portal')), 'reabierta', 'estado: reabierta');
select is(tests.estado_hito('Portal A', 5), 'en_curso', 'reabierta: el hito 5 vuelve a "en curso"');
select is((select fecha_real from public.hitos where id = tests.hito('Portal A', 5)), null, 'reabierta: el hito 5 pierde la fecha real');
select is(tests.avance('Portal A'), '0/13=0.00', 'reabierta: el avance baja');
select throws_ok($$select public.reabrir_revision(tests.rev('Diseno del portal'), 'Segunda reapertura seguida')$$, 'P0001', 'revision_no_aprobada', 'solo se reabre una revision aprobada');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 5), p_estado => 'terminado')$$, 'P0001', 'terminado_requiere_aprobacion', 'reabierta: tampoco se termina a mano');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select detalle ->> 'motivo' from public.historial_proyecto where tipo = 'revision_reabierta'), 'Falto incluir la pantalla de facturas', 'el cliente ve en el historial el motivo de la reapertura');
select is((select count(*)::int from public.historial_proyecto where tipo in ('revision_publicada', 'revision_cambios_pedidos', 'revision_aprobada', 'revision_reabierta')), 5,
  'historial del cliente: 2 publicadas, 1 cambios, 1 aprobada, 1 reabierta');
select is((select count(*)::int from public.historial_proyecto where tipo like 'revision%' and detalle ? 'ip'), 0, 'el historial del cliente no trae IP');

-- ---------- Revision de un sprint ----------
select tests.como(tests.id('sa'), 'aal2');
select is((select public.crear_revision(tests.proy('Portal A'), 'sprint', 'Revision del sprint 1', tests.sprint('Portal A', 1), null, 'https://demo.portal.websourcing.com.co/s1', null, null, 'Entregables del sprint 1') ->> 'version'), '1', 'crea la revision del sprint 1');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'sprint', 'Repetida', tests.sprint('Portal A', 1), null, 'https://demo.portal.websourcing.com.co/s1')$$, 'P0001', 'revision_ya_existe', 'una revision por sprint');
select throws_ok($$select public.crear_revision(tests.proy('Portal A'), 'sprint', 'Sprint de B', gen_random_uuid())$$, 'P0001', 'sprint_no_encontrado', 'el sprint debe ser del mismo proyecto');
select lives_ok($$select public.publicar_revision(tests.rev('Revision del sprint 1'))$$, 'publica la revision del sprint');
select is((select estado from public.sprints where id = tests.sprint('Portal A', 1)), 'en_revision', 'el sprint pasa a "en revision"');
select is(tests.estado_hito('Portal A', 6), 'esperando_aprobacion', 'el hito 6 espera la aprobacion');
select throws_ok($$select public.editar_sprint(tests.sprint('Portal A', 1), p_estado => 'terminado')$$, 'P0001', 'terminado_requiere_aprobacion', 'el sprint no se termina a mano con una revision abierta');

-- equipo_a2 tiene el permiso "aprobar".
select tests.como(tests.id('equipo_a2'));
select is((select public.responder_revision(tests.rev('Revision del sprint 1'), 1, 'apruebo') ->> 'estado'), 'aprobada', 'equipo con permiso "aprobar" aprueba el sprint');
select tests.admin();
select is((select estado from public.sprints where id = tests.sprint('Portal A', 1)), 'terminado', 'aprobada: el sprint queda terminado');
select is((select terminado_en from public.sprints where id = tests.sprint('Portal A', 1)), (now() at time zone 'America/Bogota')::date, 'el sprint trae su fecha de cierre');
select is(tests.avance('Portal A'), '1/13=7.69', 'avance: el sprint aprobado suma una parte');
select is(tests.estado_hito('Portal A', 6), 'en_curso', 'hito 6: en curso (falta el sprint 2)');
select is((select persona from public.aprobaciones where revision_id = tests.rev('Revision del sprint 1')), 'Usuario equipo2.a', 'queda el nombre de quien aprobo');

-- Pedir cambios en un sprint lo devuelve a "en curso" y se vuelve a publicar.
select tests.como(tests.id('sa'), 'aal2');
select public.crear_revision(tests.proy('Portal A'), 'sprint', 'Revision del sprint 2', tests.sprint('Portal A', 2), null, null, 'https://video.test/s2');
select public.publicar_revision(tests.rev('Revision del sprint 2'));
select tests.como(tests.id('admin_a'), 'aal2');
select public.responder_revision(tests.rev('Revision del sprint 2'), 1, 'pido_cambios', 'Falta el reporte en PDF');
select is((select estado from public.sprints where id = tests.sprint('Portal A', 2)), 'en_curso', 'cambios pedidos: el sprint vuelve a "en curso"');

-- Por defecto el candado esta ENCENDIDO: ningun sprint ni el hito 5 se termina a mano, ni siquiera sin revision.
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.editar_hito(tests.hito('Portal B', 5), p_estado => 'terminado')$$, 'P0001', 'terminado_requiere_aprobacion', 'candado encendido de origen: el hito 5 sin revision tampoco se termina a mano');
select throws_ok($$select public.editar_sprint(tests.sprint('Portal A', 2), p_estado => 'terminado')$$, 'P0001', 'terminado_requiere_aprobacion', 'candado encendido de origen: un sprint con cambios pedidos no se termina a mano');
select public.editar_hito(tests.hito('Portal A', 3), p_estado => 'terminado');
select is(tests.estado_hito('Portal A', 3), 'terminado', 'los demas hitos se siguen moviendo a mano');
-- Un sprint aprobado no se "desaprueba" editando el avance: solo con reabrir_revision.
select throws_ok($$select public.editar_sprint(tests.sprint('Portal A', 1), p_estado => 'en_curso')$$, 'P0001', 'reabrir_requiere_revision', 'un sprint aprobado no baja de "terminado" con editar_sprint');
select is((select estado from public.sprints where id = tests.sprint('Portal A', 1)), 'terminado', 'el sprint aprobado sigue terminado');
select lives_ok($$select public.reabrir_revision(tests.rev('Revision del sprint 1'), 'El cliente pidio revisar el sprint otra vez')$$, 'reabrir_revision si lo baja (con motivo)');
select is((select estado from public.sprints where id = tests.sprint('Portal A', 1)), 'en_curso', 'reabierta: el sprint vuelve a en curso');
select is((select count(*)::int from public.historial_proyecto where tipo = 'revision_reabierta' and detalle ->> 'motivo' like 'El cliente pidio%'), 1, 'y queda en el historial con su motivo');
select tests.admin();
-- Apagado el candado (decision del dueño), el hito 5 sin revision se mueve a mano como en el sprint 2.
update public.configuracion set valor = '{"exigir_aprobacion_para_terminar": false}' where clave = 'revisiones';
select tests.como(tests.id('sa'), 'aal2');
select lives_ok($$select public.editar_hito(tests.hito('Portal B', 5), p_estado => 'terminado')$$, 'con el candado apagado por decision del dueño: se mueve a mano');

-- ---------- Bandeja del super admin ----------
select is((select jsonb_array_length(public.bandeja_revisiones() -> 'aprobado')), 0, 'bandeja: ninguna aprobada (la del sprint 1 se reabrio)');
select is((select jsonb_array_length(public.bandeja_revisiones() -> 'cambios_pedidos')), 1, 'bandeja: 1 con cambios pedidos (sprint 2)');
select is((select jsonb_array_length(public.bandeja_revisiones() -> 'esperando_a_websourcing')), 2, 'bandeja: 2 esperando a Websourcing (el diseno y el sprint 1, reabiertos)');
select is((select jsonb_array_length(public.bandeja_revisiones() -> 'esperando_al_cliente')), 0, 'bandeja: ninguna esperando al cliente');
select is((select jsonb_array_length(public.bandeja_revisiones(tests.id('empresa_b')) -> 'cambios_pedidos')), 0, 'bandeja: filtro por cliente');
select is((public.bandeja_revisiones() -> 'cambios_pedidos' -> 0 ->> 'empresa_nombre'), 'Empresa A', 'bandeja: trae el nombre del cliente');

select * from finish();
rollback;
