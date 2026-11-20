-- Datos de prueba comunes. Se incluye desde cada prueba (\ir) DENTRO de su transaccion,
-- asi todo se deshace al terminar. Las filas se crean como superusuario (sin JWT), por eso
-- el registro de actividad las anota como "sistema".
--
-- Empresas:  A (activa), B (activa), C (pausada)
-- Personas:  ver comentarios de cada insert.

create schema tests;
grant usage on schema tests to public;

-- Entra como un usuario "authenticated" con ese JWT (aal2 = ya paso el 2FA).
create function tests.como(p_uid uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
                       'email', (select email from auth.users where id = p_uid))::text, true);
  execute 'set local role authenticated';
end $$;

-- Entra como visitante sin sesion.
create function tests.anonimo() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;

-- Vuelve a ser superusuario (para preparar o comprobar datos).
create function tests.admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Ejecuta una consulta que devuelve un numero (count) con el rol actual y lo devuelve.
create function tests.contar(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  return n;
end $$;

-- Filas afectadas por un INSERT/UPDATE/DELETE con el rol actual.
create function tests.afectadas(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- true si la sentencia da error O no toca ninguna fila (la cerradura la rechazo).
create function tests.rechazada(p_sql text) returns boolean language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n = 0;
exception when others then
  return true;
end $$;

-- Ids fijos para leer las pruebas con facilidad
create function tests.id(p_nombre text) returns uuid language sql immutable as $$
  select (case p_nombre
    when 'sa'        then '00000000-0000-0000-0000-0000000000a1'
    when 'admin_a'   then '00000000-0000-0000-0000-0000000000a2'
    when 'equipo_a'  then '00000000-0000-0000-0000-0000000000a3'  -- equipo A sin permisos
    when 'equipo_a2' then '00000000-0000-0000-0000-0000000000a4'  -- equipo A con aprobar y ver_dinero
    when 'quitado_a' then '00000000-0000-0000-0000-0000000000a5'  -- quitado de A
    when 'bloq_a'    then '00000000-0000-0000-0000-0000000000a6'  -- miembro de A bloqueado
    when 'perfil_bloq' then '00000000-0000-0000-0000-0000000000a7' -- miembro de A con perfil bloqueado
    when 'admin_b'   then '00000000-0000-0000-0000-0000000000b2'
    when 'equipo_b'  then '00000000-0000-0000-0000-0000000000b3'
    when 'admin_c'   then '00000000-0000-0000-0000-0000000000c2'  -- admin de la empresa pausada C
    when 'sin_perfil' then '00000000-0000-0000-0000-0000000000d2' -- usuario de Auth sin perfil ni empresa
    when 'empresa_a' then '00000000-0000-0000-0000-00000000e0a0'
    when 'empresa_b' then '00000000-0000-0000-0000-00000000e0b0'
    when 'empresa_c' then '00000000-0000-0000-0000-00000000e0c0'
    when 'miembro_admin_a'   then '00000000-0000-0000-0000-00000000f0a2'
    when 'miembro_equipo_a'  then '00000000-0000-0000-0000-00000000f0a3'
    when 'miembro_equipo_a2' then '00000000-0000-0000-0000-00000000f0a4'
    when 'miembro_quitado_a' then '00000000-0000-0000-0000-00000000f0a5'
    when 'miembro_bloq_a'    then '00000000-0000-0000-0000-00000000f0a6'
    when 'miembro_perfil_bloq' then '00000000-0000-0000-0000-00000000f0a7'
    when 'miembro_admin_b'   then '00000000-0000-0000-0000-00000000f0b2'
    when 'miembro_equipo_b'  then '00000000-0000-0000-0000-00000000f0b3'
    when 'miembro_admin_c'   then '00000000-0000-0000-0000-00000000f0c2'
  end)::uuid
$$;

insert into auth.users (id, email, email_confirmed_at) values
  (tests.id('sa'),        'dueno@websourcing.test',  now()),
  (tests.id('admin_a'),   'admin.a@empresa-a.test',  now()),
  (tests.id('equipo_a'),  'equipo.a@empresa-a.test', now()),
  (tests.id('equipo_a2'), 'equipo2.a@empresa-a.test', now()),
  (tests.id('quitado_a'), 'quitado.a@empresa-a.test', now()),
  (tests.id('bloq_a'),    'bloq.a@empresa-a.test',   now()),
  (tests.id('perfil_bloq'), 'perfilbloq.a@empresa-a.test', now()),
  (tests.id('admin_b'),   'admin.b@empresa-b.test',  now()),
  (tests.id('equipo_b'),  'equipo.b@empresa-b.test', now()),
  (tests.id('admin_c'),   'admin.c@empresa-c.test',  now()),
  (tests.id('sin_perfil'), 'nuevo@empresa-a.test',   now());

insert into public.perfiles (user_id, nombre, correo, bloqueado, bloqueado_en)
select u.id, 'Usuario ' || split_part(u.email, '@', 1), u.email,
       u.id = tests.id('perfil_bloq'), case when u.id = tests.id('perfil_bloq') then now() end
  from auth.users u where u.id <> tests.id('sin_perfil');

insert into public.super_admins (user_id) values (tests.id('sa'));

insert into public.empresas (id, nombre, nit_registro, estado, pausada_en) values
  (tests.id('empresa_a'), 'Empresa A', '900100100-1', 'activa', null),
  (tests.id('empresa_b'), 'Empresa B', '900200200-2', 'activa', null),
  (tests.id('empresa_c'), 'Empresa C', '900300300-3', 'pausada', now());

insert into public.datos_facturacion (empresa_id, razon_social, nit, correo_facturas) values
  (tests.id('empresa_a'), 'Empresa A SAS', '900100100-1', 'facturas@empresa-a.test'),
  (tests.id('empresa_b'), 'Empresa B SAS', '900200200-2', 'facturas@empresa-b.test'),
  (tests.id('empresa_c'), 'Empresa C SAS', '900300300-3', 'facturas@empresa-c.test');

insert into public.miembros (id, empresa_id, user_id, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos,
                             bloqueado, bloqueado_en, quitado_en) values
  (tests.id('miembro_admin_a'),   tests.id('empresa_a'), tests.id('admin_a'),   'admin_cliente', true, true, true, true, false, null, null),
  (tests.id('miembro_equipo_a'),  tests.id('empresa_a'), tests.id('equipo_a'),  'equipo', false, false, false, false, false, null, null),
  (tests.id('miembro_equipo_a2'), tests.id('empresa_a'), tests.id('equipo_a2'), 'equipo', true, true, false, false, false, null, null),
  (tests.id('miembro_quitado_a'), tests.id('empresa_a'), tests.id('quitado_a'), 'equipo', false, false, false, false, false, null, now()),
  (tests.id('miembro_bloq_a'),    tests.id('empresa_a'), tests.id('bloq_a'),    'equipo', false, false, false, false, true, now(), null),
  (tests.id('miembro_perfil_bloq'), tests.id('empresa_a'), tests.id('perfil_bloq'), 'equipo', false, false, false, false, false, null, null),
  (tests.id('miembro_admin_b'),   tests.id('empresa_b'), tests.id('admin_b'),   'admin_cliente', true, true, true, true, false, null, null),
  (tests.id('miembro_equipo_b'),  tests.id('empresa_b'), tests.id('equipo_b'),  'equipo', false, false, false, false, false, null, null),
  (tests.id('miembro_admin_c'),   tests.id('empresa_c'), tests.id('admin_c'),   'admin_cliente', true, true, true, true, false, null, null);

-- Una sesion abierta por usuario, para comprobar que se cierran al quitar/bloquear/pausar.
insert into auth.sessions (user_id) select id from auth.users;

-- Politica vigente: la semilla de configuracion ya trae 'v1'.

-- D-014: en las migraciones el 2FA del admin del cliente nace ENCENDIDO. Las pruebas de los sprints 1 a 3 entran
-- con sesiones aal1 de admin, asi que cada prueba parte con el 2FA del admin apagado; la prueba 26 comprueba
-- el valor de origen (antes de incluir este archivo) y la prueba 03 sigue probando el interruptor.
update public.configuracion set valor = jsonb_set(valor, '{exigir_2fa_admin_cliente}', 'false'::jsonb) where clave = 'seguridad';
