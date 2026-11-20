-- El super admin solo tiene poderes con sesion de 2FA completado (aal2).
-- Sin 2FA, o con un token "inflado" de otro usuario, no ve ni cambia nada.
begin;
select plan(31);
\ir ../local/fixtures.sql

-- ---------- Super admin SIN 2FA (aal1) ----------
select tests.como(tests.id('sa'), 'aal1');
select is(tests.contar('select 1 from public.empresas'), 0::bigint, 'super admin sin 2FA: no ve empresas');
select is(tests.contar('select 1 from public.miembros'), 0::bigint, 'super admin sin 2FA: no ve miembros');
select is(tests.contar('select 1 from public.perfiles'), 0::bigint, 'super admin sin 2FA: no ve perfiles (ni el suyo)');
select is(tests.contar('select 1 from public.datos_facturacion'), 0::bigint, 'super admin sin 2FA: no ve facturacion');
select is(tests.contar('select 1 from public.registro_actividad'), 0::bigint, 'super admin sin 2FA: no ve el registro');
select is(tests.contar('select 1 from public.configuracion'), 0::bigint, 'super admin sin 2FA: no lee configuracion');
select is(tests.afectadas($$update public.empresas set nombre = 'X' where id = tests.id('empresa_a')$$), 0::bigint, 'super admin sin 2FA: no edita empresas');
select throws_ok($$select public.crear_empresa('Nueva', 'Nueva SAS', '900400400-4', 'f@nueva.test', 'admin@nueva.test')$$, '42501', 'no_autorizado', 'super admin sin 2FA: no crea empresas');
select throws_ok($$select public.pausar_empresa(tests.id('empresa_a'))$$, '42501', 'no_autorizado', 'super admin sin 2FA: no pausa empresas');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'x@empresa-a.test')$$, '42501', 'no_autorizado', 'super admin sin 2FA: no invita');
select throws_ok($$select public.bloquear_usuario(tests.id('equipo_a'))$$, '42501', 'no_autorizado', 'super admin sin 2FA: no bloquea usuarios');
select is((public.mi_contexto() ->> 'estado'), 'super_admin_requiere_2fa', 'super admin sin 2FA: mi_contexto pide el codigo');

-- ---------- Super admin CON 2FA (aal2) ----------
select tests.como(tests.id('sa'), 'aal2');
select is(tests.contar('select 1 from public.empresas'), 3::bigint, 'super admin con 2FA: ve las 3 empresas');
select is(tests.contar('select 1 from public.miembros'), 9::bigint, 'super admin con 2FA: ve todos los miembros');
select is(tests.contar('select 1 from public.perfiles'), 10::bigint, 'super admin con 2FA: ve todos los perfiles');
select is(tests.contar('select 1 from public.datos_facturacion'), 3::bigint, 'super admin con 2FA: ve toda la facturacion');
select ok(tests.contar('select 1 from public.registro_actividad') > 0, 'super admin con 2FA: lee el registro de actividad');
select is(tests.afectadas($$update public.empresas set nombre = 'Empresa A Ltda' where id = tests.id('empresa_a')$$), 1::bigint, 'super admin con 2FA: edita el nombre de la empresa');
select throws_ok($$update public.empresas set estado = 'pausada' where id = tests.id('empresa_a')$$, '42501', null, 'super admin: no cambia el estado a mano (solo con pausar_empresa)');
select is(tests.afectadas($$update public.datos_facturacion set razon_social = 'A SAS nueva' where empresa_id = tests.id('empresa_a')$$), 1::bigint, 'super admin con 2FA: edita facturacion');
select is(tests.afectadas($$update public.configuracion set valor = '{"version": "v2"}' where clave = 'politica_datos'$$), 1::bigint, 'super admin con 2FA: cambia la configuracion');
select throws_ok($$insert into public.super_admins (user_id) values (tests.id('equipo_a'))$$, '42501', null, 'nadie se vuelve super admin desde la API (ni el super admin)');
select throws_ok($$delete from public.empresas where id = tests.id('empresa_a')$$, '42501', null, 'super admin: no borra empresas ("nada se borra")');
select throws_ok($$insert into public.registro_actividad (accion, entidad) values ('falsa', 'x')$$, '42501', null, 'super admin: no escribe en el registro a mano');
select is((public.mi_contexto() ->> 'estado'), 'super_admin', 'super admin con 2FA: mi_contexto = super_admin');

-- ---------- Super admin con el perfil bloqueado ----------
select tests.admin();
update public.perfiles set bloqueado = true, bloqueado_en = now() where user_id = tests.id('sa');
select tests.como(tests.id('sa'), 'aal2');
select is(tests.contar('select 1 from public.empresas'), 0::bigint, 'super admin con perfil bloqueado: sin poderes aunque tenga 2FA');
select tests.admin();
update public.perfiles set bloqueado = false, bloqueado_en = null where user_id = tests.id('sa');

-- ---------- Intentos de subir privilegios con el token ----------
-- Un admin de cliente con aal2 y reclamos falsos de "super admin" sigue sin ser super admin.
do $$ begin perform set_config('request.jwt.claims',
  jsonb_build_object('sub', tests.id('admin_a'), 'role', 'authenticated', 'aal', 'aal2',
                     'is_super_admin', true, 'user_role', 'super_admin',
                     'app_metadata', jsonb_build_object('role', 'super_admin', 'super_admin', true))::text, true); end $$;
set local role authenticated;
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'token con reclamos falsos de super admin: sigue viendo solo su empresa');
select is(tests.contar('select 1 from public.registro_actividad'), 0::bigint, 'token con reclamos falsos: no lee el registro');
select throws_ok($$select public.pausar_empresa(tests.id('empresa_b'))$$, '42501', 'no_autorizado', 'token con reclamos falsos: no pausa empresas');
-- Un usuario normal que hereda "aal2" tampoco gana nada.
select tests.como(tests.id('equipo_a'), 'aal2');
select is(tests.contar('select 1 from public.miembros'), 1::bigint, 'equipo con aal2: sigue viendo solo lo suyo');
select throws_ok($$select public.crear_empresa('Otra', 'Otra SAS', '900500500-5', 'f@otra.test', 'a@otra.test')$$, '42501', 'no_autorizado', 'equipo con aal2: no crea empresas');

select * from finish();
rollback;
