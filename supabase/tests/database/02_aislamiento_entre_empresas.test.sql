-- Un usuario de la empresa A no puede ver ni tocar datos de la B (y viceversa).
-- Cada perfil intenta leer y cambiar lo que no le toca; todo debe fallar o devolver 0 filas.
begin;
select plan(45);
\ir ../local/fixtures.sql

-- Invitaciones de A y de B (hechas como superusuario, solo para tener que mirar).
insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en) values
  (tests.id('empresa_a'), 'pendiente@empresa-a.test', 'equipo', repeat('a', 64), now() + interval '3 days'),
  (tests.id('empresa_b'), 'pendiente@empresa-b.test', 'equipo', repeat('b', 64), now() + interval '3 days');
insert into public.aceptaciones_politica (user_id, version) values
  (tests.id('admin_a'), 'v1'), (tests.id('admin_b'), 'v1');
insert into public.preferencias_usuario (user_id, tema) values
  (tests.id('admin_a'), 'oscura'), (tests.id('admin_b'), 'oscura');

-- ---------- Admin de A ----------
select tests.como(tests.id('admin_a'));
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'admin A: ve 1 empresa');
select is(tests.contar($$select 1 from public.empresas where id = tests.id('empresa_b')$$), 0::bigint, 'admin A: no ve la empresa B ni por id directo');
select is(tests.contar('select 1 from public.datos_facturacion'), 1::bigint, 'admin A: ve solo la facturacion de A');
select is(tests.contar($$select 1 from public.datos_facturacion where empresa_id = tests.id('empresa_b')$$), 0::bigint, 'admin A: no ve la facturacion de B');
select is(tests.contar('select 1 from public.miembros'), 6::bigint, 'admin A: ve los 6 miembros de A (incluido el quitado)');
select is(tests.contar($$select 1 from public.miembros where empresa_id = tests.id('empresa_b')$$), 0::bigint, 'admin A: no ve miembros de B');
select is(tests.contar('select 1 from public.perfiles'), 6::bigint, 'admin A: ve los perfiles de su equipo, no los de B ni el del super admin');
select is(tests.contar($$select 1 from public.perfiles where user_id in (tests.id('admin_b'), tests.id('equipo_b'), tests.id('sa'))$$), 0::bigint, 'admin A: no ve perfiles de B ni del super admin');
select is(tests.contar('select id from public.invitaciones'), 1::bigint, 'admin A: ve solo las invitaciones de A');
select is(tests.contar('select 1 from public.aceptaciones_politica'), 1::bigint, 'admin A: solo ve su propia aceptacion de politica');
select is(tests.contar('select 1 from public.preferencias_usuario'), 1::bigint, 'admin A: solo ve su propio tema');
select is(tests.contar('select 1 from public.registro_actividad'), 0::bigint, 'admin A: no lee el registro de actividad');
select throws_ok('select 1 from public.super_admins', '42501', null, 'admin A: no lee super_admins');
select throws_ok('select token_hash from public.invitaciones', '42501', null, 'admin A: no lee el hash de los tokens');

-- Escrituras contra B
select is(tests.afectadas($$update public.datos_facturacion set razon_social = 'Hackeada' where empresa_id = tests.id('empresa_b')$$), 0::bigint, 'admin A: no edita la facturacion de B');
select is(tests.afectadas($$update public.miembros set ver_dinero = true where empresa_id = tests.id('empresa_b')$$), 0::bigint, 'admin A: no cambia permisos de miembros de B');
select is(tests.afectadas($$update public.empresas set nombre = 'Hackeada' where id = tests.id('empresa_b')$$), 0::bigint, 'admin A: no edita la empresa B');
select is(tests.afectadas($$update public.perfiles set nombre = 'Hackeado' where user_id = tests.id('admin_b')$$), 0::bigint, 'admin A: no edita perfiles de B');
select throws_ok($$update public.datos_facturacion set empresa_id = tests.id('empresa_b') where empresa_id = tests.id('empresa_a')$$, '42501', null, 'admin A: no puede mudar su facturacion a B (columna sin permiso)');
select throws_ok($$insert into public.miembros (empresa_id, user_id, rol) values (tests.id('empresa_b'), tests.id('equipo_a'), 'equipo')$$, '42501', null, 'admin A: no inserta miembros directamente');
select throws_ok($$insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en) values (tests.id('empresa_b'), 'x@x.co', 'equipo', repeat('c', 64), now() + interval '1 day')$$, '42501', null, 'admin A: no inserta invitaciones directamente');
select throws_ok($$delete from public.miembros where empresa_id = tests.id('empresa_b')$$, '42501', null, 'admin A: no borra nada');
select throws_ok($$insert into public.registro_actividad (accion, entidad) values ('falsa', 'x')$$, '42501', null, 'admin A: no escribe en el registro');
select throws_ok($$insert into public.preferencias_usuario (user_id, tema) values (tests.id('admin_b'), 'clara')$$, '42501', null, 'admin A: no crea preferencias a nombre de otro');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_b'), 'intruso@empresa-a.test')$$, '42501', 'no_autorizado', 'admin A: no invita a la empresa B');
select throws_ok($$select public.quitar_miembro(tests.id('miembro_equipo_b'))$$, '42501', 'no_autorizado', 'admin A: no quita miembros de B');
select throws_ok($$select public.bloquear_miembro(tests.id('miembro_equipo_b'))$$, '42501', 'no_autorizado', 'admin A: no bloquea miembros de B');

-- ---------- Equipo de A sin permisos ----------
select tests.como(tests.id('equipo_a'));
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'equipo A: ve su empresa');
select is(tests.contar('select 1 from public.datos_facturacion'), 0::bigint, 'equipo A sin ver_dinero: no ve facturacion');
select is(tests.contar('select 1 from public.miembros'), 1::bigint, 'equipo A: solo ve su propia fila de miembro');
select is(tests.contar('select 1 from public.perfiles'), 1::bigint, 'equipo A: solo ve su propio perfil');
select is(tests.contar('select id from public.invitaciones'), 0::bigint, 'equipo A: no ve invitaciones');
select is(tests.contar('select 1 from public.registro_actividad'), 0::bigint, 'equipo A: no lee el registro');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'otro@empresa-a.test')$$, '42501', 'no_autorizado', 'equipo A: no invita a nadie');

-- ---------- Equipo de A con ver_dinero ----------
select tests.como(tests.id('equipo_a2'));
select is(tests.contar('select 1 from public.datos_facturacion'), 1::bigint, 'equipo A con ver_dinero: ve la facturacion de A');
select is(tests.afectadas($$update public.datos_facturacion set razon_social = 'Cambiada' where empresa_id = tests.id('empresa_a')$$), 0::bigint, 'equipo A con ver_dinero: ve pero no edita la facturacion');

-- ---------- Admin de B (simetria) ----------
select tests.como(tests.id('admin_b'));
select is(tests.contar($$select 1 from public.empresas where id = tests.id('empresa_a')$$), 0::bigint, 'admin B: no ve la empresa A');
select is(tests.contar('select 1 from public.miembros'), 2::bigint, 'admin B: ve solo los 2 miembros de B');
select is(tests.contar($$select 1 from public.miembros where empresa_id = tests.id('empresa_a')$$), 0::bigint, 'admin B: no ve miembros de A');
select is(tests.contar('select id from public.invitaciones'), 1::bigint, 'admin B: ve solo la invitacion de B');

select tests.como(tests.id('equipo_b'));
select is(tests.contar($$select 1 from public.datos_facturacion$$), 0::bigint, 'equipo B sin ver_dinero: no ve facturacion');
select is(tests.contar($$select 1 from public.perfiles where user_id <> auth.uid()$$), 0::bigint, 'equipo B: no ve perfiles ajenos');

-- ---------- Anonimo ----------
select tests.anonimo();
select throws_ok('select 1 from public.empresas', '42501', null, 'anonimo: sin permiso sobre empresas');
select throws_ok('select 1 from public.miembros', '42501', null, 'anonimo: sin permiso sobre miembros');
select is(public.mi_contexto() ->> 'estado', 'sin_sesion', 'anonimo: mi_contexto solo responde sin_sesion');

select * from finish();
rollback;
