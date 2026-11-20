-- Correcciones del informe de Calidad (sprint 1, parte del servidor): I-1, I-2, I-3, I-5, I-7, M-1 a M-6.
-- Cada prueba fallaba antes de la migracion 20261123000700 y pasa despues.
begin;
select plan(62);
\ir ../local/fixtures.sql

create function tests.cabecera(p text) returns void language plpgsql as $$
begin perform set_config('request.headers', p, true); end $$;

-- ================= I-2: IP desde la derecha (salto que agrega el proxy) =================
select tests.cabecera('{"x-forwarded-for": "6.6.6.6, 203.0.113.7"}');
select is(host(private.ip_cliente()), '203.0.113.7', 'I-2: toma el ultimo salto (el del proxy), no el primero que escribe el cliente');
select tests.cabecera('{"x-forwarded-for": "203.0.113.9"}');
select is(host(private.ip_cliente()), '203.0.113.9', 'I-2: con un solo valor, ese');
select tests.cabecera('{"x-forwarded-for": "basura, no-es-ip"}');
select is(private.ip_cliente(), null::inet, 'I-2: valor que no es IP -> null');
select tests.cabecera('{}');
select is(private.ip_cliente(), null::inet, 'I-2: sin cabecera -> null');
update public.configuracion set valor = '{"proxies_de_confianza": 2}' where clave = 'red';
select tests.cabecera('{"x-forwarded-for": "6.6.6.6, 203.0.113.7"}');
select is(host(private.ip_cliente()), '6.6.6.6', 'I-2: los saltos de confianza son configurables (2 = el penultimo)');
select throws_ok($$update public.configuracion set valor = '{"proxies_de_confianza": 9}' where clave = 'red'$$, '23514', null, 'I-2: la configuracion de red rechaza valores fuera de rango');
update public.configuracion set valor = '{"proxies_de_confianza": 1}' where clave = 'red';

-- ================= I-1: la IP de la aceptacion ya no la elige el usuario =================
select tests.como(tests.id('admin_a'));
select public.invitar_miembro(tests.id('empresa_a'), 'nuevo.ip@empresa-a.test') ->> 'token' as tok_ip \gset
select tests.admin();
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000e5', 'nuevo.ip@empresa-a.test', now());
select tests.como('00000000-0000-0000-0000-0000000000e5');
select tests.cabecera('{"x-forwarded-for": "6.6.6.6, 203.0.113.7"}');
select throws_ok(format($$select public.aceptar_invitacion(%L, 'v1', 'Nuevo IP', null, '8.8.8.8')$$, :'tok_ip'::text), '42883', null, 'I-1: aceptar_invitacion ya no recibe p_ip');
select lives_ok(format($$select public.aceptar_invitacion(%L, 'v1', 'Nuevo IP')$$, :'tok_ip'::text), 'I-1: aceptar sin p_ip funciona');
select is((select host(ip) from public.aceptaciones_politica where user_id = auth.uid()), '203.0.113.7', 'I-1: la IP guardada es la del proxy, no la que escribio el usuario');

-- ================= I-3: el gancho no se abre si super_admins esta vacia =================
select tests.admin();
create function tests.gancho(p_correo text) returns jsonb language sql as $$
  select private.gancho_antes_de_crear_usuario(jsonb_build_object('user', jsonb_build_object('email', p_correo))) $$;
delete from public.super_admins;
select is(tests.gancho('cualquiera@evil.test') -> 'error' ->> 'message', 'registro_solo_por_invitacion', 'I-3: sin super admins, el registro sigue cerrado');
insert into public.super_admins (user_id) values (tests.id('sa'));

-- ================= I-7: el admin del cliente no averigua quien existe =================
select tests.como(tests.id('admin_a'));
select lives_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'admin.b@empresa-b.test')$$, 'I-7: invitar a miembro de otra empresa no revela nada (se acepta)');
select lives_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'dueno@websourcing.test')$$, 'I-7: invitar a un super admin tampoco revela nada');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'equipo.a@empresa-a.test')$$, 'P0001', 'correo_ya_es_miembro', 'I-7: lo de su propio equipo si se le dice (ya lo ve en su lista)');
select tests.admin();
-- El rechazo ocurre al activar
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'admin.b@empresa-b.test')$$, 'P0001', 'correo_no_invitable', 'I-7: el super admin si recibe el detalle (otra invitacion ya pendiente no cambia eso)');
select tests.admin();
update public.invitaciones set revocada_en = now() where correo in ('admin.b@empresa-b.test', 'dueno@websourcing.test');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'dueno@websourcing.test')$$, 'P0001', 'correo_no_invitable', 'I-7: super admin invitando a un super admin: correo_no_invitable');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'admin.b@empresa-b.test')$$, 'P0001', 'correo_no_invitable', 'I-7: super admin invitando a miembro de otra empresa: correo_no_invitable');
select tests.admin();
-- la invitacion aceptada por quien ya es miembro de B se rechaza al activar
insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en)
  values (tests.id('empresa_a'), 'admin.b@empresa-b.test', 'equipo', encode(sha256(convert_to(repeat('b1', 32), 'utf8')), 'hex'), now() + interval '2 days');
select tests.como(tests.id('admin_b'));
select throws_ok($$select public.aceptar_invitacion(repeat('b1', 32), 'v1', 'Admin B')$$, 'P0001', 'ya_es_miembro', 'I-7: se rechaza al activarla (ya_es_miembro)');
select tests.admin();
insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en)
  values (tests.id('empresa_a'), 'dueno@websourcing.test', 'equipo', encode(sha256(convert_to(repeat('b2', 32), 'utf8')), 'hex'), now() + interval '2 days');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.aceptar_invitacion(repeat('b2', 32), 'v1', 'Dueno')$$, 'P0001', 'invitacion_invalida', 'I-7: un super admin no entra como miembro aunque la invitacion exista');

-- ================= M-1: rol nulo =================
select tests.como(tests.id('admin_a'));
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'otro@x.test', null)$$, '42501', 'no_autorizado', 'M-1: rol nulo de un admin de cliente -> no_autorizado (sin error tecnico)');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'otro@x.test', null)$$, '22023', 'datos_invalidos', 'M-1: rol nulo del super admin -> datos_invalidos');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'otro@x.test', 'super_admin')$$, '22023', 'datos_invalidos', 'M-1: rol desconocido -> datos_invalidos');

-- ================= M-2: mi_contexto para visitantes =================
select tests.anonimo();
select is(public.mi_contexto() ->> 'estado', 'sin_sesion', 'M-2: un visitante recibe sin_sesion');
select throws_ok($$select public.crear_empresa('X', 'X', '900700700-7', 'a@x.test', 'b@x.test')$$, '42501', null, 'M-2: el visitante sigue sin poder usar las demas funciones');

-- ================= M-3: invitaciones del que sale =================
select tests.admin();
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000a8', 'admin2.a@empresa-a.test', now());
insert into public.perfiles (user_id, nombre, correo) values ('00000000-0000-0000-0000-0000000000a8', 'Admin Dos', 'admin2.a@empresa-a.test');
insert into public.miembros (id, empresa_id, user_id, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos)
  values ('00000000-0000-0000-0000-00000000f0a8', tests.id('empresa_a'), '00000000-0000-0000-0000-0000000000a8', 'admin_cliente', true, true, true, true);
select tests.como('00000000-0000-0000-0000-0000000000a8');
select public.invitar_miembro(tests.id('empresa_a'), 'pendiente1@empresa-a.test');
select public.invitar_miembro(tests.id('empresa_a'), 'pendiente2@empresa-a.test');
select tests.como(tests.id('sa'), 'aal2');
select public.quitar_miembro('00000000-0000-0000-0000-00000000f0a8');
select tests.admin();
select is((select count(*)::int from public.invitaciones where invitada_por = '00000000-0000-0000-0000-0000000000a8' and revocada_en is null and usada_en is null), 0, 'M-3: al quitar a un admin se revocan sus invitaciones pendientes');
select is((select count(*)::int from public.invitaciones where correo = 'nuevo.ip@empresa-a.test' and usada_en is not null), 1, 'M-3: las ya usadas no se tocan');
-- bloquear
update public.miembros set quitado_en = null where id = '00000000-0000-0000-0000-00000000f0a8';
select tests.como('00000000-0000-0000-0000-0000000000a8');
select public.invitar_miembro(tests.id('empresa_a'), 'pendiente3@empresa-a.test');
select tests.como(tests.id('sa'), 'aal2');
select public.bloquear_miembro('00000000-0000-0000-0000-00000000f0a8');
select tests.admin();
select is((select count(*)::int from public.invitaciones where correo = 'pendiente3@empresa-a.test' and revocada_en is not null), 1, 'M-3: al bloquear al miembro tambien se revocan');
update public.miembros set bloqueado = false, bloqueado_en = null where id = '00000000-0000-0000-0000-00000000f0a8';
select tests.como('00000000-0000-0000-0000-0000000000a8');
select public.invitar_miembro(tests.id('empresa_a'), 'pendiente4@empresa-a.test');
select tests.como(tests.id('sa'), 'aal2');
select public.bloquear_usuario('00000000-0000-0000-0000-0000000000a8');
select tests.admin();
select is((select count(*)::int from public.invitaciones where correo = 'pendiente4@empresa-a.test' and revocada_en is not null), 1, 'M-3: el bloqueo global tambien las revoca');

-- ================= M-4: revocar_invitacion =================
select tests.como(tests.id('admin_a'));
select public.invitar_miembro(tests.id('empresa_a'), 'revocame@empresa-a.test') ->> 'invitacion_id' as inv_rev \gset
select tests.como(tests.id('admin_b'));
select throws_ok(format($$select public.revocar_invitacion(%L)$$, :'inv_rev'::text), '42501', 'no_autorizado', 'M-4: admin de B no revoca invitaciones de A');
select tests.como(tests.id('equipo_a'));
select throws_ok(format($$select public.revocar_invitacion(%L)$$, :'inv_rev'::text), '42501', 'no_autorizado', 'M-4: el equipo no revoca');
select tests.como(tests.id('admin_a'));
select lives_ok(format($$select public.revocar_invitacion(%L)$$, :'inv_rev'::text), 'M-4: el admin del cliente revoca una invitacion pendiente de su equipo');
select throws_ok(format($$select public.revocar_invitacion(%L)$$, :'inv_rev'::text), 'P0001', 'invitacion_no_pendiente', 'M-4: revocar dos veces da error claro');
select throws_ok($$select public.revocar_invitacion(gen_random_uuid())$$, '42501', 'no_autorizado', 'M-4: invitacion inexistente = mismo error');
select tests.como(tests.id('sa'), 'aal2');
select public.invitar_miembro(tests.id('empresa_a'), 'otro.admin@empresa-a.test', 'admin_cliente') ->> 'invitacion_id' as inv_adm \gset
select tests.como(tests.id('admin_a'));
select throws_ok(format($$select public.revocar_invitacion(%L)$$, :'inv_adm'::text), '42501', 'no_autorizado', 'M-4: el admin del cliente no revoca invitaciones de admin');
select tests.como(tests.id('sa'), 'aal2');
select lives_ok(format($$select public.revocar_invitacion(%L)$$, :'inv_adm'::text), 'M-4: el super admin revoca cualquiera');
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'invitacion_revocada' and entidad_id = :'inv_rev'::text), 1, 'M-4: la revocacion queda en el registro');

-- ================= M-5: perfil de quien paso a otra empresa =================
select tests.admin();
insert into public.miembros (empresa_id, user_id, rol) values (tests.id('empresa_b'), tests.id('quitado_a'), 'equipo');
select tests.como(tests.id('admin_a'));
select is(tests.contar($$select 1 from public.perfiles where user_id = tests.id('quitado_a')$$), 0::bigint, 'M-5: el admin de A ya no lee el perfil de quien esta activo en otra empresa');
select tests.como(tests.id('admin_b'));
select is(tests.contar($$select 1 from public.perfiles where user_id = tests.id('quitado_a')$$), 1::bigint, 'M-5: su nueva empresa si');
select tests.admin();
update public.miembros set quitado_en = now() where empresa_id = tests.id('empresa_b') and user_id = tests.id('quitado_a');
select tests.como(tests.id('admin_a'));
select is(tests.contar($$select 1 from public.perfiles where user_id = tests.id('quitado_a')$$), 1::bigint, 'M-5: si no esta activo en ninguna otra, su historial en A se conserva');

-- ================= M-6: validacion de configuracion =================
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$update public.configuracion set valor = '{"exigir_2fa_admin_cliente": "si"}' where clave = 'seguridad'$$, '23514', null, 'M-6: un texto en el interruptor de 2FA se rechaza');
select throws_ok($$update public.configuracion set valor = '{"exigir_2fa_admin_cliente": null}' where clave = 'seguridad'$$, '23514', null, 'M-6: null en el interruptor de 2FA se rechaza');
select throws_ok($$update public.configuracion set valor = '[1]' where clave = 'seguridad'$$, '23514', null, 'M-6: la configuracion debe ser un objeto');
select throws_ok($$update public.configuracion set valor = '{"version": 2}' where clave = 'politica_datos'$$, '23514', null, 'M-6: la version de la politica debe ser texto');
select throws_ok($$update public.configuracion set valor = '{"dias": [1], "desde": "8am", "hasta": "18:00", "zona": "America/Bogota"}' where clave = 'horario_habil'$$, '23514', null, 'M-6: el horario habil valida la hora');
select tests.admin();
-- Ausente = encendido
update public.configuracion set valor = '{}' where clave = 'seguridad';
select tests.como(tests.id('admin_a'), 'aal1');
select is(tests.contar('select 1 from public.empresas'), 0::bigint, 'M-6: interruptor ausente = 2FA exigido al admin del cliente');
select tests.admin();
delete from public.configuracion where clave = 'seguridad';
select tests.como(tests.id('admin_a'), 'aal1');
select is(tests.contar('select 1 from public.empresas'), 0::bigint, 'M-6: sin fila de seguridad = 2FA exigido');
select tests.como(tests.id('admin_a'), 'aal2');
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'M-6: con 2FA completado entra');

-- ================= I-5: bloqueo por intentos (gancho password_verification_attempt) =================
select tests.admin();
create function tests.intento(p_uid uuid, p_valido boolean) returns text language sql as $$
  select private.gancho_intento_de_acceso(jsonb_build_object('user_id', p_uid, 'valid', p_valido)) ->> 'decision' $$;
select ok(has_function_privilege('supabase_auth_admin', 'private.gancho_intento_de_acceso(jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'private.gancho_intento_de_acceso(jsonb)', 'execute')
      and not has_function_privilege('anon', 'private.gancho_intento_de_acceso(jsonb)', 'execute'), 'I-5: solo Auth llama al gancho de intentos');
select ok(not has_table_privilege('authenticated', 'public.intentos_acceso', 'select') and not has_table_privilege('anon', 'public.intentos_acceso', 'select'), 'I-5: la tabla de intentos no se lee desde la API');
select is(tests.intento(tests.id('equipo_a'), false), 'continue', 'I-5: fallo 1 de 5: continua');
select is(tests.intento(tests.id('equipo_a'), false), 'continue', 'I-5: fallo 2');
select is(tests.intento(tests.id('equipo_a'), false), 'continue', 'I-5: fallo 3');
select is(tests.intento(tests.id('equipo_a'), false), 'continue', 'I-5: fallo 4');
select is(tests.intento(tests.id('equipo_a'), false), 'reject', 'I-5: el fallo 5 frena la cuenta');
select is(tests.intento(tests.id('equipo_a'), true), 'reject', 'I-5: durante el freno, ni la clave correcta entra');
select is(private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('equipo_a'), 'valid', true)) ->> 'message', 'cuenta_frenada_temporalmente', 'I-5: el mensaje es el codigo estable');
select is(tests.intento(tests.id('equipo_b'), true), 'continue', 'I-5: otra cuenta no se ve afectada');
select ok((select bloqueado_hasta between now() + interval '14 minutes' and now() + interval '15 minutes 5 seconds' from public.intentos_acceso where user_id = tests.id('equipo_a')), 'I-5: el freno dura 15 minutos');
select is((select count(*)::int from public.registro_actividad where accion = 'cuenta_frenada_por_intentos' and entidad_id = tests.id('equipo_a')::text), 1, 'I-5: el freno queda en el registro');
update public.intentos_acceso set bloqueado_hasta = now() - interval '1 second' where user_id = tests.id('equipo_a');
select is(tests.intento(tests.id('equipo_a'), true), 'continue', 'I-5: pasados los 15 minutos, la clave correcta entra');
select is((select fallos from public.intentos_acceso where user_id = tests.id('equipo_a')), 0, 'I-5: un acceso correcto reinicia la cuenta');
select tests.intento(tests.id('equipo_a2'), false); select tests.intento(tests.id('equipo_a2'), false);
select tests.intento(tests.id('equipo_a2'), false); select tests.intento(tests.id('equipo_a2'), false);
select is(tests.intento(tests.id('equipo_a2'), true), 'continue', 'I-5: 4 fallos y luego acierto: no se frena y se reinicia');
select tests.intento(tests.id('bloq_a'), false);
update public.intentos_acceso set ultimo_fallo = now() - interval '20 minutes' where user_id = tests.id('bloq_a');
select tests.intento(tests.id('bloq_a'), false); select tests.intento(tests.id('bloq_a'), false);
select tests.intento(tests.id('bloq_a'), false);
select is(tests.intento(tests.id('bloq_a'), false), 'continue', 'I-5: los fallos viejos (>15 min) no cuentan como "seguidos"');

select * from finish();
rollback;
