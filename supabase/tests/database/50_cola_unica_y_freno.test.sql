-- Integracion · cola unica de avisos (despachador), panel con todos los modulos y freno de acceso (plan B).
begin;
select plan(75);
\ir ../local/fixtures.sql
\ir ../local/fixtures_tickets.sql

-- ---------- Una sola cola ----------
select hasnt_table('public', 'outbox_correos', 'ya no existe outbox_correos: la cola es una sola (avisos_salientes)');
select has_table('public', 'avisos_salientes', 'la cola unica es avisos_salientes');
select ok(has_table_privilege('service_role', 'public.avisos_salientes', 'select'), 'service_role lee la cola');
select ok(not has_table_privilege('service_role', 'public.avisos_salientes', 'insert') and not has_table_privilege('service_role', 'public.avisos_salientes', 'delete')
          and not has_table_privilege('service_role', 'public.avisos_salientes', 'truncate'), 'service_role no inserta, no borra, no vacia');
select ok(not has_table_privilege('service_role', 'public.avisos_salientes', 'update'), 'ni actualiza la tabla entera...');
select ok(has_column_privilege('service_role', 'public.avisos_salientes', 'estado', 'update') and has_column_privilege('service_role', 'public.avisos_salientes', 'intentos', 'update')
          and has_column_privilege('service_role', 'public.avisos_salientes', 'enviado_en', 'update'), '... solo las columnas de estado');
select ok(not has_column_privilege('service_role', 'public.avisos_salientes', 'datos', 'update') and not has_column_privilege('service_role', 'public.avisos_salientes', 'destinatario_user_id', 'update')
          and not has_column_privilege('service_role', 'public.avisos_salientes', 'tipo', 'update'), 'no toca datos, destinatario ni tipo');
select ok(not has_table_privilege('anon', 'public.avisos_salientes', 'select') and not has_table_privilege('authenticated', 'public.avisos_salientes', 'insert'), 'anon no lee y authenticated no escribe');
select ok(not has_function_privilege('authenticated', 'public.reclamar_avisos(integer)', 'execute')
          and not has_function_privilege('anon', 'public.marcar_aviso(uuid,text,text)', 'execute')
          and has_function_privilege('service_role', 'public.reclamar_avisos(integer)', 'execute'), 'las funciones del despachador son solo de service_role');
select throws_ok($$insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, clave_unica, datos)
  values (tests.id('empresa_a'), 'tickets', 'ticket_nuevo', 'super_admin', 'clave-con-titulo', '{"titulo": "Mi clave es 123"}')$$, '23514', null, 'la cola no admite la llave "titulo" (texto libre)');
select throws_ok($$insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, clave_unica, datos)
  values (tests.id('empresa_a'), 'dinero', 'pago_vencido', 'cliente_dinero', 'clave-con-concepto', '{"concepto": "Anticipo"}')$$, '23514', null, 'ni "concepto"');
select throws_ok($$insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, clave_unica)
  values (tests.id('empresa_a'), 'tickets', 'ticket_nuevo', 'usuario', 'clave-usuario-sin-id')$$, '23514', null, 'un aviso a "usuario" necesita su destinatario');

-- Un ticket de tickets/mantenimiento cae en la cola unica con destino "usuario".
select tests.como(tests.id('equipo_a'));
select (public.crear_ticket('error', 'Falla grave con un titulo secreto', 'Detalle secreto', 'urgente') ->> 'ticket_id') as t1 \gset
select tests.admin();
select is((select count(*)::int from public.avisos_salientes where modulo = 'tickets' and tipo = 'ticket_urgente_nuevo' and destino = 'usuario' and destinatario_user_id = tests.id('sa')), 1, 'tickets encola en la cola unica, para el super admin');
select is((select referencia_id from public.avisos_salientes where tipo = 'ticket_urgente_nuevo'), :'t1'::uuid, 'la referencia es el ticket');
select is((select count(*)::int from public.avisos_salientes where datos::text ilike '%secreto%'), 0, 'sin texto del cliente');

-- Avisos de dinero y de usuario para probar el despachador.
insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos) values
  (tests.id('empresa_a'), 'dinero', 'pago_vencido', 'cliente_dinero', gen_random_uuid(), 'prueba-dinero-1', '{"pendiente": 100, "moneda": "COP"}'),
  (tests.id('empresa_a'), 'mantenimiento', 'mantenimiento_aviso_80_por_ciento', 'cliente_admin', gen_random_uuid(), 'prueba-admin-1', '{}'),
  (tests.id('empresa_c'), 'dinero', 'pago_vencido', 'cliente_dinero', gen_random_uuid(), 'prueba-pausada-1', '{}');
update public.avisos_salientes set estado = 'cancelado' where clave_unica not like 'prueba-%';   -- fuera del camino de las pruebas

-- ---------- Despachador ----------
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.reclamar_avisos(10)$$, '42501', null, 'el admin del cliente no llama al despachador');
select throws_ok($$select public.marcar_aviso(gen_random_uuid(), 'enviado')$$, '42501', null, 'ni marca avisos');
select tests.anonimo();
select throws_ok($$select public.reclamar_avisos(10)$$, '42501', null, 'un visitante tampoco');
select tests.admin();
set local role service_role;
create temp table lote as select public.reclamar_avisos(10) as j;
grant select on lote to public;
select is((select jsonb_array_length(j) from lote), 3, 'el despachador toma los 3 avisos que tocan');
select is((select count(*)::int from public.avisos_salientes where estado = 'enviando' and intentos = 1), 3, 'quedan "enviando" con 1 intento');
select is(jsonb_array_length(public.reclamar_avisos(10)), 0, 'otra corrida no los vuelve a tomar (reclamados por 10 minutos)');
select is((select (e -> 'destinatarios') @> jsonb_build_array(jsonb_build_object('user_id', tests.id('admin_a'), 'nombre', 'Usuario admin.a', 'correo', 'admin.a@empresa-a.test'))
             from lote, jsonb_array_elements(j) e where e ->> 'tipo' = 'pago_vencido' and e ->> 'empresa_id' = tests.id('empresa_a')::text), true, 'cliente_dinero: llega al admin');
select is((select jsonb_array_length(e -> 'destinatarios') from lote, jsonb_array_elements(j) e where e ->> 'tipo' = 'pago_vencido' and e ->> 'empresa_id' = tests.id('empresa_a')::text), 2,
          'cliente_dinero: solo el admin y el equipo con "ver dinero" (no el de sin permiso, ni quitados, ni bloqueados)');
select is((select jsonb_array_length(e -> 'destinatarios') from lote, jsonb_array_elements(j) e where e ->> 'tipo' = 'mantenimiento_aviso_80_por_ciento'), 1, 'cliente_admin: solo el admin');
select is((select jsonb_array_length(e -> 'destinatarios') from lote, jsonb_array_elements(j) e where e ->> 'empresa_id' = tests.id('empresa_c')::text), 0, 'empresa pausada: nadie a quien avisar');
select is((select e ->> 'empresa_nombre' from lote, jsonb_array_elements(j) e where e ->> 'tipo' = 'mantenimiento_aviso_80_por_ciento'), 'Empresa A', 'el nombre de la empresa lo trae la base, no la cola');
select is((select bool_and(not (e ? 'correo')) from lote, jsonb_array_elements(j) e), true, 'el aviso en si no trae correos: viven en destinatarios, resueltos al enviar');

-- Resultados
create temp table ids as select (e ->> 'id')::uuid as id, e ->> 'tipo' as tipo, e ->> 'empresa_id' as emp from lote, jsonb_array_elements(j) e;
grant select on ids to public;
select lives_ok($$select public.marcar_aviso((select id from ids where emp = tests.id('empresa_c')::text), 'omitido', 'sin_destinatarios')$$, 'sin destinatarios: se omite');
select lives_ok($$select public.marcar_aviso((select id from ids where tipo = 'mantenimiento_aviso_80_por_ciento'), 'enviado')$$, 'se marca enviado');
select lives_ok($$select public.marcar_aviso((select id from ids where tipo = 'pago_vencido' and emp = tests.id('empresa_a')::text), 'error', 'Resend 500: clave re_SECRETA_123')$$, 'un error de envio');
reset role;
select is((select estado from public.avisos_salientes where clave_unica = 'prueba-pausada-1'), 'cancelado', 'omitido -> cancelado');
select is((select estado || '/' || (enviado_en is not null)::text from public.avisos_salientes where clave_unica = 'prueba-admin-1'), 'enviado/true', 'enviado -> con fecha de envio');
select is((select estado from public.avisos_salientes where clave_unica = 'prueba-dinero-1'), 'pendiente', 'error -> vuelve a pendiente para reintentar');
select ok((select programado_para > now() + interval '4 minutes' from public.avisos_salientes where clave_unica = 'prueba-dinero-1'), 'el reintento espera (5 minutos la primera vez)');
select is((select ultimo_error from public.avisos_salientes where clave_unica = 'prueba-dinero-1'), 'Resend 500: clave re_SECRETA_123', 'el error se guarda corto y sin caracteres raros (el despachador solo pasa codigos, nunca el texto del proveedor)');
select is((select reclamado_hasta is null from public.avisos_salientes where clave_unica = 'prueba-dinero-1'), true, 'se libera la reserva');
-- Reintentos hasta el quinto: fallido.
update public.avisos_salientes set programado_para = now() where clave_unica = 'prueba-dinero-1';
set local role service_role;
select is(jsonb_array_length(public.reclamar_avisos(10)), 1, 'cuando toca, se reclama de nuevo (intento 2)');
select public.marcar_aviso((select id from public.avisos_salientes where clave_unica = 'prueba-dinero-1'), 'error', 'otra_vez');
reset role;
select ok((select programado_para > now() + interval '14 minutes' from public.avisos_salientes where clave_unica = 'prueba-dinero-1'), 'la espera crece (15 minutos en el segundo error)');
update public.avisos_salientes set programado_para = now(), intentos = 4 where clave_unica = 'prueba-dinero-1';
set local role service_role;
select public.reclamar_avisos(10);
select public.marcar_aviso((select id from public.avisos_salientes where clave_unica = 'prueba-dinero-1'), 'error', 'quinto');
reset role;
select is((select estado || '/' || intentos from public.avisos_salientes where clave_unica = 'prueba-dinero-1'), 'fallido/5', 'al quinto intento queda fallido');
set local role service_role;
select is(jsonb_array_length(public.reclamar_avisos(10)), 0, 'un fallido no se reclama otra vez');
reset role;

-- Sin proveedor de correo
insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica) values
  (tests.id('empresa_a'), 'dinero', 'comprobante_recibido', 'super_admin', gen_random_uuid(), 'prueba-sinprov-1');
set local role service_role;
select is(public.marcar_avisos_sin_proveedor(), 1, 'sin RESEND_API_KEY: los que tocan quedan "pendiente_sin_proveedor"');
reset role;
select is((select estado from public.avisos_salientes where clave_unica = 'prueba-sinprov-1'), 'pendiente_sin_proveedor', 'estado marcado');
select is((select intentos from public.avisos_salientes where clave_unica = 'prueba-sinprov-1'), 0::smallint, 'sin gastar intentos');
set local role service_role;
select is(jsonb_array_length(public.reclamar_avisos(10)), 1, 'cuando haya proveedor, esos mismos salen');
select public.marcar_aviso((select id from public.avisos_salientes where clave_unica = 'prueba-sinprov-1'), 'sin_proveedor');
reset role;
select is((select estado || '/' || intentos from public.avisos_salientes where clave_unica = 'prueba-sinprov-1'), 'pendiente_sin_proveedor/0', 'si el proveedor desaparece en medio del envio, no se cuenta el intento');

-- Un aviso que quedo "enviando" (el servidor se cayo) vuelve a salir pasados los 10 minutos.
update public.avisos_salientes set estado = 'enviando', reclamado_hasta = now() - interval '1 minute', intentos = 1 where clave_unica = 'prueba-sinprov-1';
set local role service_role;
select is(jsonb_array_length(public.reclamar_avisos(10)), 1, 'un "enviando" vencido se recupera');
reset role;
select is((select intentos from public.avisos_salientes where clave_unica = 'prueba-sinprov-1'), 2::smallint, 'y cuenta como otro intento');
set local role service_role;
select throws_ok($$select public.marcar_aviso((select id from public.avisos_salientes where clave_unica = 'prueba-sinprov-1'), 'raro')$$, '22023', null, 'un resultado desconocido no existe');
reset role;

-- ---------- Panel e inicio con todos los modulos ----------
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'normal') as tk1 \gset
select tests.ticket_directo(tests.id('empresa_b'), tests.id('miembro_equipo_b'), tests.id('equipo_b'), 'error', 'normal') as tk2 \gset
update public.tickets set estado = 'cerrado', cerrado_en = now(), cierre_motivo = 'cerrado_por_websourcing' where id = :'tk2';
select tests.como(tests.id('sa'), 'aal2');
select is((public.panel_super_admin() -> 'totales' ->> 'tickets_abiertos')::int, 2, 'panel: tickets abiertos = los no cerrados (el urgente de la prueba y uno de A; el cerrado de B no)');
select ok((public.panel_super_admin() -> 'totales') ? 'pagos_vencidos' and (public.panel_super_admin() -> 'totales') ? 'comprobantes_en_revision', 'panel: trae pagos vencidos y comprobantes en revision');
select is(jsonb_typeof(public.panel_super_admin() -> 'totales' -> 'pagos_vencidos'), 'number', 'panel: pagos_vencidos ya es un numero');
select tests.como(tests.id('admin_a'), 'aal2');
select is((public.inicio_cliente() ->> 'tickets_abiertos')::int, 2, 'inicio del cliente: sus tickets abiertos');
select is(jsonb_typeof(public.inicio_cliente() -> 'comprobantes_en_revision'), 'number', 'inicio: comprobantes en revision (admin: ve dinero)');
select tests.como(tests.id('equipo_a'));
select is(public.inicio_cliente() -> 'comprobantes_en_revision', 'null'::jsonb, 'inicio: sin "ver dinero", los comprobantes vienen nulos');
select is(public.inicio_cliente() -> 'pagos_vencidos', 'null'::jsonb, 'inicio: sin "ver dinero", pagos vencidos nulos');
select tests.como(tests.id('admin_b'), 'aal2');
select is((public.inicio_cliente() ->> 'tickets_abiertos')::int, 0, 'inicio de B: no cuenta tickets de A');

-- ---------- Freno de acceso (plan B) ----------
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.freno_acceso_consultar('admin.a@empresa-a.test')$$, '42501', null, 'el navegador no consulta el freno');
select throws_ok($$select public.freno_acceso_anotar('admin.a@empresa-a.test', false)$$, '42501', null, 'ni lo anota');
select tests.anonimo();
select throws_ok($$select public.freno_acceso_consultar('admin.a@empresa-a.test')$$, '42501', null, 'un visitante tampoco');
select tests.admin();
set local role service_role;
select is(public.freno_acceso_consultar('  ADMIN.A@empresa-a.test ') ->> 'bloqueado', 'false', 'sin fallos: no esta frenado (ignora mayusculas y espacios)');
select is(public.freno_acceso_anotar('admin.a@empresa-a.test', false) ->> 'decision', 'continue', 'fallo 1');
select is(public.freno_acceso_anotar('admin.a@empresa-a.test', false) ->> 'decision', 'continue', 'fallo 2');
select is(public.freno_acceso_anotar('admin.a@empresa-a.test', true) ->> 'decision', 'continue', 'un acierto reinicia la cuenta');
select is(public.freno_acceso_anotar('admin.a@empresa-a.test', false) ->> 'decision', 'continue', 'fallo 1 (otra vez)');
select is(public.freno_acceso_anotar('admin.a@empresa-a.test', false) ->> 'decision', 'continue', 'fallo 2');
select is(public.freno_acceso_anotar('admin.a@empresa-a.test', false) ->> 'decision', 'continue', 'fallo 3');
select is(public.freno_acceso_anotar('admin.a@empresa-a.test', false) ->> 'decision', 'continue', 'fallo 4');
select is(public.freno_acceso_anotar('admin.a@empresa-a.test', false) ->> 'message', 'cuenta_frenada_temporalmente', 'fallo 5: cuenta frenada (mismo mensaje que el gancho)');
select is(public.freno_acceso_consultar('admin.a@empresa-a.test') ->> 'bloqueado', 'true', 'ahora la consulta dice "frenada"');
select is(public.freno_acceso_anotar('admin.a@empresa-a.test', true) ->> 'decision', 'reject', 'frenada: ni con la clave correcta entra');
select is(public.freno_acceso_consultar('equipo.a@empresa-a.test') ->> 'bloqueado', 'false', 'otra cuenta no se frena');
select is(public.freno_acceso_consultar('no-existe@nadie.co'), '{"bloqueado": false}'::jsonb, 'un correo desconocido responde igual que uno sin fallos (no revela nada)');
select is(public.freno_acceso_anotar('no-existe@nadie.co', false), '{"decision": "continue"}'::jsonb, 'anotar un correo desconocido no hace nada');
reset role;
select is((select count(*)::int from public.registro_actividad where accion = 'cuenta_frenada_por_intentos' and actor_id is null), 1, 'el freno queda en el registro de actividad');
update public.intentos_acceso set bloqueado_hasta = now() - interval '1 minute' where user_id = tests.id('admin_a');
set local role service_role;
select is(public.freno_acceso_consultar('admin.a@empresa-a.test') ->> 'bloqueado', 'false', 'pasados los 15 minutos, la cuenta vuelve a entrar');
reset role;

select * from finish();
rollback;
