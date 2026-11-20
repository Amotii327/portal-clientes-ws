-- Crear empresa con su primer admin, invitar, aceptar invitacion (con politica de datos).
begin;
select plan(44);
\ir ../local/fixtures.sql

-- ================= crear_empresa (solo super admin con 2FA) =================
select tests.como(tests.id('sa'), 'aal2');
select public.crear_empresa('  Nueva Empresa  ', 'Nueva Empresa SAS', '900400400-4', 'Facturas@Nueva.test', ' Gerente@Nueva.test ') ->> 'token' as tok_nueva \gset
select matches(:'tok_nueva'::text, '^[0-9a-f]{64}$', 'crear_empresa devuelve el token una sola vez (64 hex)');
select tests.admin();
select is((select nombre from public.empresas where nit_registro = '900400400-4'), 'Nueva Empresa', 'crear_empresa: guarda el nombre sin espacios sobrantes');
select is((select estado from public.empresas where nit_registro = '900400400-4'), 'activa', 'crear_empresa: nace activa');
select is((select correo_facturas from public.datos_facturacion d join public.empresas e on e.id = d.empresa_id where e.nit_registro = '900400400-4'), 'facturas@nueva.test', 'crear_empresa: crea la facturacion con el correo en minusculas');
select is((select count(*)::int from public.invitaciones i join public.empresas e on e.id = i.empresa_id
           where e.nit_registro = '900400400-4' and i.rol = 'admin_cliente' and i.correo = 'gerente@nueva.test'), 1, 'crear_empresa: deja la invitacion del primer admin');
select is((select i.token_hash from public.invitaciones i where i.correo = 'gerente@nueva.test'), encode(sha256(convert_to(:'tok_nueva'::text, 'utf8')), 'hex'), 'la base guarda solo el hash del token');
select ok((select i.token_hash <> :'tok_nueva'::text from public.invitaciones i where i.correo = 'gerente@nueva.test'), 'el token en claro no esta en la base');
select ok((select i.vence_en between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute' from public.invitaciones i where i.correo = 'gerente@nueva.test'), 'la invitacion vence en 7 dias');
select ok((select i.aprobar and i.ver_dinero and i.ver_todos_tickets and i.subir_archivos from public.invitaciones i where i.correo = 'gerente@nueva.test'), 'la invitacion del admin trae todos los permisos');

select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.crear_empresa('Otra', 'Otra SAS', '900400400-4', 'f@otra.test', 'a@otra.test')$$, 'P0001', 'nit_duplicado', 'crear_empresa: rechaza un NIT repetido');
select throws_ok($$select public.crear_empresa('Otra', 'Otra SAS', '900500500-5', 'f@otra.test', 'no-es-correo')$$, '22023', 'correo_invalido', 'crear_empresa: rechaza correo de admin invalido');
select throws_ok($$select public.crear_empresa('Otra', 'Otra SAS', '900500500-5', 'sin-arroba', 'a@otra.test')$$, '22023', 'correo_invalido', 'crear_empresa: rechaza correo de facturas invalido');
select throws_ok($$select public.crear_empresa('x', 'Otra SAS', '900500500-5', 'f@otra.test', 'a@otra.test')$$, '23514', null, 'crear_empresa: rechaza nombre de 1 letra');
select throws_ok($$select public.crear_empresa('Otra', 'Otra SAS', 'DROP TABLE', 'f@otra.test', 'a@otra.test')$$, '23514', null, 'crear_empresa: rechaza NIT invalido');
select throws_ok($$select public.crear_empresa('Otra', 'Otra SAS', '900500500-5', 'f@otra.test', 'admin.a@empresa-a.test')$$, 'P0001', 'correo_no_invitable', 'crear_empresa: no se invita a quien ya es miembro de otra empresa');
select throws_ok($$select public.crear_empresa('Otra', 'Otra SAS', '900500500-5', 'f@otra.test', 'dueno@websourcing.test')$$, 'P0001', 'correo_no_invitable', 'crear_empresa: nunca se invita a un super admin');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.crear_empresa('Otra', 'Otra SAS', '900500500-5', 'f@otra.test', 'a@otra.test')$$, '42501', 'no_autorizado', 'crear_empresa: un admin de cliente no crea empresas');

-- ================= aceptar_invitacion =================
select tests.admin();
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'gerente@nueva.test', now()),
  ('00000000-0000-0000-0000-0000000000e2', 'intruso@nueva.test', now()),
  ('00000000-0000-0000-0000-0000000000e3', 'sinconfirmar@nueva.test', null);

-- Correo equivocado
select tests.como('00000000-0000-0000-0000-0000000000e2');
select throws_ok(format($$select public.aceptar_invitacion(%L, 'v1', 'Intruso Perez')$$, :'tok_nueva'::text), 'P0001', 'invitacion_invalida', 'aceptar: el token de otro correo no sirve');
select throws_ok($$select public.aceptar_invitacion('no-es-un-token', 'v1', 'Intruso Perez')$$, 'P0001', 'invitacion_invalida', 'aceptar: token con formato invalido');
select throws_ok($$select public.aceptar_invitacion(repeat('0', 64), 'v1', 'Intruso Perez')$$, 'P0001', 'invitacion_invalida', 'aceptar: token inexistente');
select tests.anonimo();
select throws_ok(format($$select public.aceptar_invitacion(%L, 'v1', 'Anonimo')$$, :'tok_nueva'::text), '42501', null, 'aceptar: sin sesion no se puede');

-- El invitado correcto, con IP en la cabecera del proxy
select tests.como('00000000-0000-0000-0000-0000000000e1');
select set_config('request.headers', '{"x-forwarded-for": "10.0.0.1, 203.0.113.7"}', true) is not null as _ \gset
select throws_ok(format($$select public.aceptar_invitacion(%L, 'v0-vieja', 'Gerente Nuevo')$$, :'tok_nueva'::text), 'P0001', 'politica_version_invalida', 'aceptar: exige aceptar la version vigente de la politica');
select throws_ok(format($$select public.aceptar_invitacion(%L, 'v1', ' ')$$, :'tok_nueva'::text), '22023', 'datos_invalidos', 'aceptar: exige un nombre');
select is(public.aceptar_invitacion(:'tok_nueva'::text, 'v1', 'Gerente Nuevo', '3001234567') ->> 'rol', 'admin_cliente', 'aceptar: el invitado entra como admin del cliente');
select is(public.mi_contexto() ->> 'estado', 'activo', 'aceptar: mi_contexto = activo');
select is(public.mi_contexto() -> 'permisos' ->> 'ver_dinero', 'true', 'aceptar: el admin trae todos los permisos');
select is(public.mi_contexto() ->> 'tema', 'clara', 'aceptar: el tema por defecto es clara');
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'aceptar: ve su empresa y solo esa');
select is((select host(ip) from public.aceptaciones_politica where user_id = auth.uid()), '203.0.113.7', 'aceptar: guarda la IP del proxy con la aceptacion');
select is((select version from public.aceptaciones_politica where user_id = auth.uid()), 'v1', 'aceptar: guarda la version de la politica');
-- Un solo uso
select throws_ok(format($$select public.aceptar_invitacion(%L, 'v1', 'Gerente Nuevo')$$, :'tok_nueva'::text), 'P0001', 'invitacion_invalida', 'aceptar: el token es de un solo uso');
select tests.admin();
select ok((select usada_en is not null and usada_por = '00000000-0000-0000-0000-0000000000e1' and miembro_id is not null from public.invitaciones where correo = 'gerente@nueva.test'), 'aceptar: la invitacion queda marcada como usada');
select tests.como('00000000-0000-0000-0000-0000000000e2');
select throws_ok(format($$select public.aceptar_invitacion(%L, 'v1', 'Intruso Perez')$$, :'tok_nueva'::text), 'P0001', 'invitacion_invalida', 'aceptar: tampoco otro usuario puede reusar el token');

-- ================= invitar_miembro =================
select tests.como(tests.id('admin_a'));
select public.invitar_miembro(tests.id('empresa_a'), 'Nuevo.Equipo@empresa-a.test', 'equipo', true, false, false, true) ->> 'token' as tok_eq1 \gset
select matches(:'tok_eq1'::text, '^[0-9a-f]{64}$', 'invitar: el admin del cliente invita a su equipo');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'otro.admin@empresa-a.test', 'admin_cliente')$$, '42501', 'no_autorizado', 'invitar: el admin del cliente NO invita a otro admin');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'equipo.a@empresa-a.test')$$, 'P0001', 'correo_ya_es_miembro', 'invitar: avisa si ya es de su equipo');
select lives_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'admin.b@empresa-b.test')$$, 'invitar: no revela miembros de otras empresas (el rechazo ocurre al activar)');
select lives_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'dueno@websourcing.test')$$, 'invitar: tampoco revela al super admin (nunca podra activarla)');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'basura')$$, '22023', 'correo_invalido', 'invitar: valida el correo');
-- Reinvitar reemplaza la pendiente
select public.invitar_miembro(tests.id('empresa_a'), 'nuevo.equipo@empresa-a.test') ->> 'token' as tok_eq2 \gset
select tests.admin();
select is((select count(*)::int from public.invitaciones where correo = 'nuevo.equipo@empresa-a.test' and revocada_en is null and usada_en is null), 1, 'invitar: reinvitar deja una sola pendiente');
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000e4', 'nuevo.equipo@empresa-a.test', now());
select tests.como('00000000-0000-0000-0000-0000000000e4');
select throws_ok(format($$select public.aceptar_invitacion(%L, 'v1', 'Nuevo Equipo')$$, :'tok_eq1'::text), 'P0001', 'invitacion_invalida', 'la invitacion reemplazada ya no sirve');
select is(public.aceptar_invitacion(:'tok_eq2'::text, 'v1', 'Nuevo Equipo') ->> 'rol', 'equipo', 'la nueva invitacion si sirve: entra como equipo');
select is(public.mi_contexto() -> 'permisos' ->> 'ver_dinero', 'false', 'el equipo nuevo entra SIN permisos extra (por defecto)');

-- Super admin invita a una empresa pausada
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_c'), 'alguien@empresa-c.test')$$, 'P0001', 'empresa_no_disponible', 'invitar: no se invita a una empresa pausada');

select * from finish();
rollback;
