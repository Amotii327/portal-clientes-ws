-- Escrituras permitidas y prohibidas, columnas que nadie puede cambiar, validacion de lo que entra
-- y restricciones de integridad (llaves compuestas, un solo uso, nunca super admin por invitacion).
begin;
select plan(40);
\ir ../local/fixtures.sql

-- ---------- Admin de A ----------
select tests.como(tests.id('admin_a'));
select is(tests.afectadas($$update public.miembros set ver_dinero = true, aprobar = true where id = tests.id('miembro_equipo_a')$$), 1::bigint, 'admin A: cambia permisos de su equipo');
select is(tests.afectadas($$update public.miembros set subir_archivos = false where id = tests.id('miembro_admin_a')$$), 0::bigint, 'admin A: no toca los permisos de un admin (ni los suyos)');
select is(tests.afectadas($$update public.miembros set subir_archivos = true where id = tests.id('miembro_quitado_a')$$), 0::bigint, 'admin A: no edita a un miembro ya quitado');
select throws_ok($$update public.miembros set rol = 'admin_cliente' where id = tests.id('miembro_equipo_a')$$, '42501', null, 'admin A: no sube de rol a nadie (columna sin permiso)');
select throws_ok($$update public.miembros set bloqueado = true where id = tests.id('miembro_equipo_a')$$, '42501', null, 'admin A: no bloquea por UPDATE directo (solo con bloquear_miembro)');
select throws_ok($$update public.miembros set quitado_en = now() where id = tests.id('miembro_equipo_a')$$, '42501', null, 'admin A: no quita por UPDATE directo (solo con quitar_miembro)');
select throws_ok($$update public.empresas set estado = 'activa' where id = tests.id('empresa_a')$$, '42501', null, 'admin A: no cambia el estado de la empresa');
select is(tests.afectadas($$update public.empresas set nombre = 'Mi nombre' where id = tests.id('empresa_a')$$), 0::bigint, 'admin A: no edita la fila de empresas (solo el super admin)');
select is(tests.afectadas($$update public.datos_facturacion set razon_social = 'A Renombrada SAS', correo_facturas = 'nuevo@empresa-a.test' where empresa_id = tests.id('empresa_a')$$), 1::bigint, 'admin A: edita su facturacion');
select throws_ok($$update public.datos_facturacion set correo_facturas = 'no-es-un-correo' where empresa_id = tests.id('empresa_a')$$, '23514', null, 'facturacion: rechaza un correo invalido');
select throws_ok($$update public.datos_facturacion set nit = 'abc' where empresa_id = tests.id('empresa_a')$$, '23514', null, 'facturacion: rechaza un NIT invalido');
select throws_ok($$update public.datos_facturacion set razon_social = ' ' where empresa_id = tests.id('empresa_a')$$, '23514', null, 'facturacion: rechaza razon social vacia');
select throws_ok($$insert into public.configuracion (clave, valor) values ('nueva_clave', '{}')$$, '42501', null, 'admin A: no crea configuracion');
select is(tests.afectadas($$update public.configuracion set valor = '{"version": "v9"}' where clave = 'politica_datos'$$), 0::bigint, 'admin A: no cambia la configuracion global');

-- ---------- Equipo de A ----------
select tests.como(tests.id('equipo_a'));
select is(tests.afectadas($$update public.miembros set ver_dinero = true where user_id = auth.uid()$$), 0::bigint, 'equipo A: no se da permisos a si mismo');
select throws_ok($$update public.miembros set rol = 'admin_cliente' where user_id = auth.uid()$$, '42501', null, 'equipo A: no se vuelve admin');
select throws_ok($$insert into public.super_admins (user_id) values (auth.uid())$$, '42501', null, 'equipo A: no se vuelve super admin');
select is(tests.afectadas($$update public.perfiles set nombre = 'Nombre Nuevo', celular = '+57 300 1234567' where user_id = auth.uid()$$), 1::bigint, 'equipo A: edita su nombre y celular');
select throws_ok($$update public.perfiles set bloqueado = false where user_id = auth.uid()$$, '42501', null, 'equipo A: no toca su bloqueo');
select throws_ok($$update public.perfiles set correo = 'otro@x.co' where user_id = auth.uid()$$, '42501', null, 'equipo A: no cambia el correo del perfil');
select throws_ok($$update public.perfiles set celular = 'xx' where user_id = auth.uid()$$, '23514', null, 'perfil: rechaza celular invalido');
select throws_ok($$update public.perfiles set nombre = '' where user_id = auth.uid()$$, '23514', null, 'perfil: rechaza nombre vacio');
select is(tests.afectadas($$update public.perfiles set nombre = 'Otro' where user_id = tests.id('equipo_a2')$$), 0::bigint, 'equipo A: no edita el perfil de un companero');

-- ---------- Tema (D-017) ----------
select is(tests.afectadas($$insert into public.preferencias_usuario (user_id) values (auth.uid())$$), 1::bigint, 'tema: se crea la preferencia propia');
select is((select tema from public.preferencias_usuario where user_id = auth.uid()), 'clara', 'tema: por defecto es clara');
select is(tests.afectadas($$update public.preferencias_usuario set tema = 'oscura' where user_id = auth.uid()$$), 1::bigint, 'tema: el usuario cambia a oscura');
select throws_ok($$update public.preferencias_usuario set tema = 'verde' where user_id = auth.uid()$$, '23514', null, 'tema: rechaza valores desconocidos');

-- ---------- Triggers de inmutabilidad (aplican incluso al superusuario) ----------
select tests.admin();
select throws_ok($$update public.miembros set empresa_id = tests.id('empresa_b') where id = tests.id('miembro_equipo_a')$$, '23514', 'empresa_id_inmutable', 'miembros.empresa_id es inmutable');
select throws_ok($$update public.datos_facturacion set empresa_id = tests.id('empresa_b') where empresa_id = tests.id('empresa_a')$$, '23514', 'empresa_id_inmutable', 'datos_facturacion.empresa_id es inmutable');
select throws_ok($$update public.miembros set user_id = tests.id('equipo_b') where id = tests.id('miembro_equipo_a')$$, '23514', null, 'miembros.user_id es inmutable');
select throws_ok($$update public.miembros set rol = 'admin_cliente' where id = tests.id('miembro_equipo_a')$$, '23514', null, 'miembros.rol es inmutable');
select throws_ok($$update public.empresas set id = gen_random_uuid() where id = tests.id('empresa_a')$$, '23514', null, 'empresas.id es inmutable');

-- ---------- Invitaciones: reglas de integridad ----------
select throws_ok($$insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en) values (tests.id('empresa_a'), 'sa@x.co', 'super_admin', repeat('1', 64), now() + interval '1 day')$$, '23514', null, 'una invitacion nunca puede ser de super admin (rol)');
select throws_ok($$insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en) values (tests.id('empresa_a'), 'x@x.co', 'equipo', repeat('1', 64), now() + interval '8 days')$$, '23514', null, 'una invitacion no vence a mas de 7 dias');
select throws_ok($$insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en) values (tests.id('empresa_a'), 'x@x.co', 'admin_cliente', repeat('1', 64), now() + interval '1 day')$$, '23514', null, 'invitacion de admin sin todos los permisos: rechazada');
select throws_ok($$insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en) values (tests.id('empresa_a'), 'x@x.co', 'equipo', 'token-en-claro', now() + interval '1 day')$$, '23514', null, 'el token se guarda con hash (64 hex), no en claro');
insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en) values (tests.id('empresa_a'), 'p@empresa-a.test', 'equipo', repeat('2', 64), now() + interval '1 day');
select throws_ok($$insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en) values (tests.id('empresa_a'), 'p@empresa-a.test', 'equipo', repeat('3', 64), now() + interval '1 day')$$, '23505', null, 'solo una invitacion pendiente por correo y empresa');
select throws_ok($$update public.invitaciones set token_hash = repeat('4', 64) where token_hash = repeat('2', 64)$$, '23514', null, 'el hash del token no se puede cambiar');
select throws_ok($$update public.invitaciones set usada_en = now(), usada_por = tests.id('equipo_b'), miembro_id = tests.id('miembro_equipo_b') where token_hash = repeat('2', 64)$$, '23503', null, 'llave compuesta: una invitacion de A no puede apuntar a un miembro de B');
select throws_ok($$insert into public.miembros (empresa_id, user_id, rol) values (tests.id('empresa_b'), tests.id('equipo_a'), 'equipo')$$, '23505', null, 'un usuario solo puede estar activo en una empresa');

select * from finish();
rollback;
