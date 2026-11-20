-- Quitar y bloquear miembros, pausar y reactivar empresas, bloqueo global de usuarios y los casos
-- limite de aceptar_invitacion (vencida, revocada, ya miembro, empresa pausada, etc.).
begin;
select plan(62);
\ir ../local/fixtures.sql

create function tests.sesiones(p_user uuid) returns bigint language sql security definer as $$
  select count(*) from auth.sessions where user_id = p_user $$;

-- ================= quitar_miembro =================
select tests.como(tests.id('equipo_a'));
select throws_ok($$select public.quitar_miembro(tests.id('miembro_equipo_a2'))$$, '42501', 'no_autorizado', 'equipo: no quita a nadie');
select throws_ok($$select public.bloquear_miembro(tests.id('miembro_equipo_a2'))$$, '42501', 'no_autorizado', 'equipo: no bloquea a nadie');

select tests.como(tests.id('admin_a'));
select throws_ok($$select public.quitar_miembro(tests.id('miembro_admin_a'))$$, '42501', 'no_autorizado', 'admin A: no se quita a si mismo');
select throws_ok($$select public.bloquear_miembro(tests.id('miembro_admin_a'))$$, '42501', 'no_autorizado', 'admin A: no se bloquea a si mismo');
select throws_ok($$select public.quitar_miembro(gen_random_uuid())$$, '42501', 'no_autorizado', 'quitar un miembro que no existe da el mismo error que uno ajeno');
select is(tests.sesiones(tests.id('equipo_a')), 1::bigint, 'antes: equipo A tiene una sesion abierta');
select lives_ok($$select public.quitar_miembro(tests.id('miembro_equipo_a'))$$, 'admin A: quita a un miembro de su equipo');
select tests.admin();
select is(tests.sesiones(tests.id('equipo_a')), 0::bigint, 'quitar: se cierran las sesiones del usuario');
select is(tests.sesiones(tests.id('equipo_a2')), 1::bigint, 'quitar: las sesiones de los demas siguen');
select ok((select quitado_en is not null from public.miembros where id = tests.id('miembro_equipo_a')), 'quitar: la fila se conserva (historial) con la fecha de salida');
select ok((select count(*) = 1 from public.perfiles where user_id = tests.id('equipo_a')), 'quitar: el perfil se conserva');
select tests.como(tests.id('equipo_a'));
select is(public.mi_contexto() ->> 'estado', 'miembro_quitado', 'quitar: el usuario ve el estado miembro_quitado');
select is(tests.contar('select 1 from public.empresas'), 0::bigint, 'quitar: no ve nada');
select tests.como(tests.id('admin_a'));
select throws_ok($$select public.quitar_miembro(tests.id('miembro_equipo_a'))$$, 'P0001', 'miembro_ya_quitado', 'quitar dos veces: error claro');

-- Un admin del cliente no gestiona a otro admin
select tests.admin();
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000a8', 'admin2.a@empresa-a.test', now());
insert into public.perfiles (user_id, nombre, correo) values ('00000000-0000-0000-0000-0000000000a8', 'Admin Dos', 'admin2.a@empresa-a.test');
insert into public.miembros (id, empresa_id, user_id, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos)
  values ('00000000-0000-0000-0000-00000000f0a8', tests.id('empresa_a'), '00000000-0000-0000-0000-0000000000a8', 'admin_cliente', true, true, true, true);
select tests.como(tests.id('admin_a'));
select throws_ok($$select public.quitar_miembro('00000000-0000-0000-0000-00000000f0a8')$$, '42501', 'no_autorizado', 'admin A: no quita a otro admin (solo el super admin)');
select throws_ok($$select public.bloquear_miembro('00000000-0000-0000-0000-00000000f0a8')$$, '42501', 'no_autorizado', 'admin A: no bloquea a otro admin');

-- ================= bloquear_miembro =================
select lives_ok($$select public.bloquear_miembro(tests.id('miembro_equipo_a2'))$$, 'admin A: bloquea a un miembro');
select tests.admin();
select is(tests.sesiones(tests.id('equipo_a2')), 0::bigint, 'bloquear: se cierran sus sesiones');
select ok((select bloqueado and bloqueado_en is not null from public.miembros where id = tests.id('miembro_equipo_a2')), 'bloquear: queda marcado con fecha');
select tests.como(tests.id('equipo_a2'));
select is(public.mi_contexto() ->> 'estado', 'miembro_bloqueado', 'bloquear: ve el estado miembro_bloqueado');
select is(tests.contar('select 1 from public.empresas'), 0::bigint, 'bloquear: no ve nada');
select tests.como(tests.id('admin_a'));
select lives_ok($$select public.bloquear_miembro(tests.id('miembro_equipo_a2'), false)$$, 'admin A: desbloquea');
select tests.como(tests.id('equipo_a2'));
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'desbloquear: recupera el acceso');
select tests.como(tests.id('admin_b'));
select throws_ok($$select public.bloquear_miembro(tests.id('miembro_equipo_a2'))$$, '42501', 'no_autorizado', 'admin B: no bloquea miembros de A');

-- El super admin si puede con cualquier rol
select tests.como(tests.id('sa'), 'aal2');
select lives_ok($$select public.bloquear_miembro('00000000-0000-0000-0000-00000000f0a8')$$, 'super admin: bloquea a un admin de cliente');
select lives_ok($$select public.quitar_miembro('00000000-0000-0000-0000-00000000f0a8')$$, 'super admin: quita a un admin de cliente');

-- ================= pausar / reactivar empresa =================
select tests.como(tests.id('admin_a'));
select throws_ok($$select public.pausar_empresa(tests.id('empresa_a'))$$, '42501', 'no_autorizado', 'admin A: no pausa ni su propia empresa');
select throws_ok($$select public.reactivar_empresa(tests.id('empresa_c'))$$, '42501', 'no_autorizado', 'admin: no reactiva empresas');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.pausar_empresa(gen_random_uuid())$$, 'P0001', 'empresa_no_encontrada', 'pausar: empresa inexistente');
select throws_ok($$select public.pausar_empresa(tests.id('empresa_c'))$$, 'P0001', 'empresa_ya_pausada', 'pausar: ya estaba pausada');
select lives_ok($$select public.pausar_empresa(tests.id('empresa_a'), '  Pago pendiente  ')$$, 'super admin: pausa la empresa A');
select tests.admin();
select is((select estado from public.empresas where id = tests.id('empresa_a')), 'pausada', 'pausar: estado pausada');
select is((select motivo_pausa from public.empresas where id = tests.id('empresa_a')), 'Pago pendiente', 'pausar: guarda el motivo');
select is((select pausada_por from public.empresas where id = tests.id('empresa_a')), tests.id('sa'), 'pausar: guarda quien pauso');
select is(tests.sesiones(tests.id('admin_a')), 0::bigint, 'pausar: cierra las sesiones del admin de A');
select is(tests.sesiones(tests.id('equipo_a2')), 0::bigint, 'pausar: cierra las sesiones del equipo de A');
select is(tests.sesiones(tests.id('admin_b')), 1::bigint, 'pausar A: las sesiones de B siguen abiertas');
select is(tests.sesiones(tests.id('sa')), 1::bigint, 'pausar A: la sesion del super admin sigue');
select is((select count(*)::int from public.miembros where empresa_id = tests.id('empresa_a')), 7, 'pausar: no se borra nada');
select tests.como(tests.id('admin_a'));
select is(tests.contar('select 1 from public.empresas'), 0::bigint, 'pausar: el admin de A ya no ve datos');
select is(public.mi_contexto() ->> 'estado', 'empresa_pausada', 'pausar: el admin ve el mensaje de empresa pausada');
select tests.como(tests.id('sa'), 'aal2');
select ok(tests.contar($$select 1 from public.empresas where id = tests.id('empresa_a')$$) = 1, 'pausar: el super admin sigue viendo la empresa pausada');
select lives_ok($$select public.reactivar_empresa(tests.id('empresa_a'))$$, 'super admin: reactiva la empresa');
select throws_ok($$select public.reactivar_empresa(tests.id('empresa_a'))$$, 'P0001', 'empresa_ya_activa', 'reactivar: ya estaba activa');
select tests.admin();
select ok((select estado = 'activa' and pausada_en is null and motivo_pausa is null and pausada_por is null from public.empresas where id = tests.id('empresa_a')), 'reactivar: limpia el estado de pausa');
select tests.como(tests.id('admin_a'));
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'reactivar: el admin de A vuelve a ver sus datos');

-- ================= bloquear_usuario (global) =================
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.bloquear_usuario(tests.id('sa'))$$, 'P0001', 'no_se_puede_bloquear_super_admin', 'nadie bloquea a un super admin');
select throws_ok($$select public.bloquear_usuario(gen_random_uuid())$$, 'P0001', 'usuario_no_encontrado', 'bloquear usuario inexistente');
select lives_ok($$select public.bloquear_usuario(tests.id('equipo_b'))$$, 'super admin: bloquea a un usuario');
select tests.admin();
select is(tests.sesiones(tests.id('equipo_b')), 0::bigint, 'bloquear usuario: cierra sus sesiones');
select tests.como(tests.id('equipo_b'));
select is(public.mi_contexto() ->> 'estado', 'usuario_bloqueado', 'usuario bloqueado: lo sabe');
select tests.como(tests.id('admin_b'));
select throws_ok($$select public.bloquear_usuario(tests.id('equipo_b'), false)$$, '42501', 'no_autorizado', 'admin del cliente: no desbloquea usuarios globales');

-- ================= casos limite de aceptar_invitacion =================
select tests.admin();
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'caducada@empresa-a.test', now()),
  ('00000000-0000-0000-0000-0000000000f2', 'revocada@empresa-a.test', now()),
  ('00000000-0000-0000-0000-0000000000f3', 'sinconfirmar@empresa-a.test', null),
  ('00000000-0000-0000-0000-0000000000f4', 'bloqueado.libre@empresa-a.test', now()),
  ('00000000-0000-0000-0000-0000000000f6', 'nuevo@empresa-c.test', now());
insert into public.perfiles (user_id, nombre, correo, bloqueado, bloqueado_en)
  values ('00000000-0000-0000-0000-0000000000f4', 'Bloqueado Libre', 'bloqueado.libre@empresa-a.test', true, now());
insert into public.invitaciones (empresa_id, correo, rol, token_hash, creada_en, vence_en, revocada_en) values
  (tests.id('empresa_a'), 'caducada@empresa-a.test',  'equipo', encode(sha256(convert_to(repeat('a1', 32), 'utf8')), 'hex'), now() - interval '9 days', now() - interval '2 days', null),
  (tests.id('empresa_a'), 'revocada@empresa-a.test',  'equipo', encode(sha256(convert_to(repeat('a2', 32), 'utf8')), 'hex'), now(), now() + interval '3 days', now()),
  (tests.id('empresa_a'), 'sinconfirmar@empresa-a.test', 'equipo', encode(sha256(convert_to(repeat('a3', 32), 'utf8')), 'hex'), now(), now() + interval '3 days', null),
  (tests.id('empresa_a'), 'bloqueado.libre@empresa-a.test', 'equipo', encode(sha256(convert_to(repeat('a4', 32), 'utf8')), 'hex'), now(), now() + interval '3 days', null),
  (tests.id('empresa_a'), 'equipo.b@empresa-b.test', 'equipo', encode(sha256(convert_to(repeat('a5', 32), 'utf8')), 'hex'), now(), now() + interval '3 days', null),
  (tests.id('empresa_c'), 'nuevo@empresa-c.test', 'equipo', encode(sha256(convert_to(repeat('a6', 32), 'utf8')), 'hex'), now(), now() + interval '3 days', null),
  (tests.id('empresa_a'), 'dueno@websourcing.test', 'equipo', encode(sha256(convert_to(repeat('a7', 32), 'utf8')), 'hex'), now(), now() + interval '3 days', null);

select tests.como('00000000-0000-0000-0000-0000000000f1');
select throws_ok($$select public.aceptar_invitacion(repeat('a1', 32), 'v1', 'Caducada')$$, 'P0001', 'invitacion_invalida', 'aceptar: invitacion vencida (mas de 7 dias)');
select tests.como('00000000-0000-0000-0000-0000000000f2');
select throws_ok($$select public.aceptar_invitacion(repeat('a2', 32), 'v1', 'Revocada')$$, 'P0001', 'invitacion_invalida', 'aceptar: invitacion revocada');
select tests.como('00000000-0000-0000-0000-0000000000f3');
select throws_ok($$select public.aceptar_invitacion(repeat('a3', 32), 'v1', 'Sin Confirmar')$$, 'P0001', 'correo_sin_confirmar', 'aceptar: el correo debe estar confirmado');
select tests.como('00000000-0000-0000-0000-0000000000f4');
select throws_ok($$select public.aceptar_invitacion(repeat('a4', 32), 'v1', 'Bloqueado')$$, 'P0001', 'usuario_bloqueado', 'aceptar: un usuario bloqueado no entra por invitacion');
select tests.como(tests.id('equipo_b'));   -- ya esta en B (bloqueado globalmente por el test anterior, se libera)
select tests.admin();
update public.perfiles set bloqueado = false, bloqueado_en = null where user_id = tests.id('equipo_b');
select tests.como(tests.id('equipo_b'));
select throws_ok($$select public.aceptar_invitacion(repeat('a5', 32), 'v1', 'Equipo B')$$, 'P0001', 'ya_es_miembro', 'aceptar: quien ya esta activo en otra empresa no entra a una segunda');
select tests.como('00000000-0000-0000-0000-0000000000f6');
select throws_ok($$select public.aceptar_invitacion(repeat('a6', 32), 'v1', 'Nuevo C')$$, 'P0001', 'empresa_no_disponible', 'aceptar: la empresa pausada no admite miembros nuevos');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.aceptar_invitacion(repeat('a7', 32), 'v1', 'Dueno')$$, 'P0001', 'invitacion_invalida', 'aceptar: un super admin nunca entra como miembro');

-- Reingreso de alguien que fue quitado: conserva su perfil e historial
select tests.como(tests.id('admin_a'));
select public.invitar_miembro(tests.id('empresa_a'), 'quitado.a@empresa-a.test') ->> 'token' as tok_vuelta \gset
select tests.como(tests.id('quitado_a'));
select is(public.aceptar_invitacion(:'tok_vuelta'::text, 'v1') ->> 'rol', 'equipo', 'reingreso: el quitado vuelve con una invitacion nueva (sin repetir nombre)');
select tests.admin();
select is((select count(*)::int from public.miembros where user_id = tests.id('quitado_a')), 2, 'reingreso: la fila vieja se conserva y hay una nueva');
select is((select count(*)::int from public.miembros where user_id = tests.id('quitado_a') and quitado_en is null), 1, 'reingreso: solo una fila activa');

select * from finish();
rollback;
