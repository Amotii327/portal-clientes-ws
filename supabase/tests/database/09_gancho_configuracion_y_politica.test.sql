-- Gancho de registro (solo por invitacion), configuracion inicial y politica de datos.
begin;
select plan(16);
\ir ../local/fixtures.sql

-- ---------- Gancho antes de crear usuario ----------
select ok(has_function_privilege('supabase_auth_admin', 'private.gancho_antes_de_crear_usuario(jsonb)', 'execute'), 'el servicio de Auth puede llamar al gancho');
select ok(not has_function_privilege('authenticated', 'private.gancho_antes_de_crear_usuario(jsonb)', 'execute')
      and not has_function_privilege('anon', 'private.gancho_antes_de_crear_usuario(jsonb)', 'execute'), 'nadie mas lo llama');

create function tests.gancho(p_correo text) returns jsonb language sql as $$
  select private.gancho_antes_de_crear_usuario(jsonb_build_object('user', jsonb_build_object('email', p_correo))) $$;

select is(tests.gancho('cualquiera@x.co'), '{"error": {"message": "registro_solo_por_invitacion", "http_code": 403}}'::jsonb, 'registro sin invitacion: rechazado');
insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en) values
  (tests.id('empresa_a'), 'invitado@x.co', 'equipo', repeat('5', 64), now() + interval '2 days');
select is(tests.gancho('  Invitado@X.co '), '{}'::jsonb, 'registro con invitacion vigente: permitido (sin importar mayusculas ni espacios)');
update public.invitaciones set revocada_en = now() where correo = 'invitado@x.co';
select isnt(tests.gancho('invitado@x.co'), '{}'::jsonb, 'registro con invitacion revocada: rechazado');
insert into public.invitaciones (empresa_id, correo, rol, token_hash, creada_en, vence_en) values
  (tests.id('empresa_a'), 'vencida@x.co', 'equipo', repeat('6', 64), now() - interval '6 days', now() - interval '1 day');
select isnt(tests.gancho('vencida@x.co'), '{}'::jsonb, 'registro con invitacion vencida: rechazado');
delete from public.super_admins;
select is(tests.gancho('primero@websourcing.test'), '{}'::jsonb, 'mientras no exista ningun super admin se permite crear el primero');

-- ---------- Configuracion inicial ----------
select is((select count(*)::int from public.configuracion where clave in ('marca', 'horario_habil', 'tiempos_respuesta', 'politica_datos', 'seguridad')), 5, 'configuracion inicial cargada');
select is((select valor ->> 'zona' from public.configuracion where clave = 'horario_habil'), 'America/Bogota', 'horario habil: hora de Colombia (D-002)');
select is((select valor -> 'urgente' ->> 'horas_habiles' from public.configuracion where clave = 'tiempos_respuesta'), '2', 'tiempos de respuesta por defecto (D-003)');
select is((select valor ->> 'exigir_2fa_admin_cliente' from public.configuracion where clave = 'seguridad'), 'false', '2FA de admin de cliente: apagado en desarrollo, se enciende antes de produccion');
select throws_ok($$insert into public.configuracion (clave, valor) values ('Mala Clave', '{}')$$, '23514', null, 'configuracion: rechaza claves con formato raro');

-- ---------- Politica de datos ----------
select is(public.politica_vigente(), 'v1', 'politica_vigente: v1 al inicio');
update public.configuracion set valor = '{"version": "v2"}' where clave = 'politica_datos';
select is(public.politica_vigente(), 'v2', 'politica_vigente: sigue a la configuracion');
select tests.como(tests.id('equipo_a'));
select is(tests.contar($$select 1 from public.configuracion where clave = 'politica_datos'$$), 1::bigint, 'un miembro activo lee la configuracion');
select tests.anonimo();
select is(public.politica_vigente(), 'v2', 'el visitante puede ver la version vigente (para la pantalla de activacion)');

select * from finish();
rollback;
