-- Usuario quitado, bloqueado (miembro o perfil), empresa pausada, sin perfil y anonimo:
-- sin acceso a NINGUNA tabla. Y los cambios de permisos/estado valen en la siguiente consulta,
-- sin esperar a que se renueve el token (los permisos se leen de la base, no del JWT).
begin;
select plan(27);
\ir ../local/fixtures.sql

-- Un usuario con perfil pero sin ninguna empresa.
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000d3', 'suelto@otra.test', now());
insert into public.perfiles (user_id, nombre, correo) values ('00000000-0000-0000-0000-0000000000d3', 'Suelto', 'suelto@otra.test');

create function tests.total_visible() returns bigint language sql as $$
  select coalesce(sum(tests.contar('select 1 from public.' || t)), 0)::bigint
    from unnest(array['empresas', 'datos_facturacion', 'perfiles', 'miembros', 'invitaciones',
                      'aceptaciones_politica', 'registro_actividad', 'configuracion', 'preferencias_usuario']) t
$$;
-- Hay datos en todas las tablas para que el 0 signifique algo.
insert into public.aceptaciones_politica (user_id, version) values (tests.id('quitado_a'), 'v1'), (tests.id('bloq_a'), 'v1'), (tests.id('admin_c'), 'v1');
insert into public.preferencias_usuario (user_id) values (tests.id('quitado_a')), (tests.id('bloq_a')), (tests.id('admin_c')), (tests.id('perfil_bloq'));
insert into public.invitaciones (empresa_id, correo, rol, token_hash, vence_en)
  values (tests.id('empresa_a'), 'p@empresa-a.test', 'equipo', repeat('d', 64), now() + interval '2 days'),
         (tests.id('empresa_c'), 'p@empresa-c.test', 'equipo', repeat('e', 64), now() + interval '2 days');

select tests.como(tests.id('quitado_a'));
select is(tests.total_visible(), 0::bigint, 'usuario quitado: no ve nada');
select is(public.mi_contexto() ->> 'estado', 'miembro_quitado', 'usuario quitado: mi_contexto = miembro_quitado');
select is(tests.afectadas($$update public.perfiles set nombre = 'Sigo aqui' where user_id = auth.uid()$$), 0::bigint, 'usuario quitado: no edita ni su perfil');

select tests.como(tests.id('bloq_a'));
select is(tests.total_visible(), 0::bigint, 'miembro bloqueado: no ve nada');
select is(public.mi_contexto() ->> 'estado', 'miembro_bloqueado', 'miembro bloqueado: mi_contexto = miembro_bloqueado');

select tests.como(tests.id('perfil_bloq'));
select is(tests.total_visible(), 0::bigint, 'perfil bloqueado: no ve nada');
select is(public.mi_contexto() ->> 'estado', 'usuario_bloqueado', 'perfil bloqueado: mi_contexto = usuario_bloqueado');

select tests.como(tests.id('admin_c'));
select is(tests.total_visible(), 0::bigint, 'empresa pausada: su admin no ve nada');
select is(public.mi_contexto() ->> 'estado', 'empresa_pausada', 'empresa pausada: mi_contexto = empresa_pausada (mensaje amable)');
select is(public.mi_contexto() -> 'empresa' ->> 'nombre', 'Empresa C', 'empresa pausada: mi_contexto trae el nombre para el mensaje');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_c'), 'nuevo@empresa-c.test')$$, '42501', 'no_autorizado', 'empresa pausada: su admin no invita');

select tests.como(tests.id('sin_perfil'));
select is(tests.total_visible(), 0::bigint, 'usuario de Auth sin perfil: no ve nada');
select is(public.mi_contexto() ->> 'estado', 'sin_perfil', 'sin perfil: mi_contexto = sin_perfil');

select tests.como('00000000-0000-0000-0000-0000000000d3');
select is(tests.total_visible(), 0::bigint, 'usuario sin empresa: no ve nada');
select is(public.mi_contexto() ->> 'estado', 'sin_membresia', 'sin empresa: mi_contexto = sin_membresia');

select tests.anonimo();
select throws_ok('select 1 from public.configuracion', '42501', null, 'anonimo: sin acceso a configuracion');
select is(public.politica_vigente(), 'v1', 'anonimo: solo puede leer la version vigente de la politica');

-- ---------- El corte es inmediato, sin renovar el token ----------
select tests.como(tests.id('admin_a'));
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'admin A entra y ve su empresa');
select tests.admin();
update public.miembros set quitado_en = now() where id = tests.id('miembro_admin_a');
select tests.como(tests.id('admin_a'));   -- mismo usuario, mismo tipo de token
select is(tests.contar('select 1 from public.empresas'), 0::bigint, 'al quitarlo, en la siguiente consulta ya no ve nada');

select tests.admin();
update public.miembros set quitado_en = null where id = tests.id('miembro_admin_a');
update public.empresas set estado = 'pausada', pausada_en = now() where id = tests.id('empresa_a');
select tests.como(tests.id('equipo_a'));
select is(tests.total_visible(), 0::bigint, 'al pausar la empresa, su equipo pierde el acceso al instante');
select tests.admin();
update public.empresas set estado = 'activa', pausada_en = null where id = tests.id('empresa_a');
select tests.como(tests.id('equipo_a'));
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'al reactivar, vuelve el acceso');

-- Cambios de permisos: efecto inmediato
select is(tests.contar('select 1 from public.datos_facturacion'), 0::bigint, 'equipo A sin ver_dinero no ve facturacion');
select tests.admin();
update public.miembros set ver_dinero = true where id = tests.id('miembro_equipo_a');
select tests.como(tests.id('equipo_a'));
select is(tests.contar('select 1 from public.datos_facturacion'), 1::bigint, 'al darle ver_dinero, la ve en su proxima consulta');

-- ---------- 2FA obligatorio para el admin del cliente (D-014), interruptor en configuracion ----------
select tests.admin();
update public.configuracion set valor = '{"exigir_2fa_admin_cliente": true}' where clave = 'seguridad';
select tests.como(tests.id('admin_a'), 'aal1');
select is(tests.contar('select 1 from public.empresas'), 0::bigint, 'con 2FA exigido: el admin sin codigo no ve nada');
select is(public.mi_contexto() ->> 'estado', 'requiere_2fa', 'con 2FA exigido: mi_contexto = requiere_2fa');
select tests.como(tests.id('admin_a'), 'aal2');
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'con 2FA exigido: el admin con codigo entra');
select tests.como(tests.id('equipo_a'), 'aal1');
select is(tests.contar('select 1 from public.empresas'), 1::bigint, 'con 2FA exigido: el equipo sigue entrando sin codigo (opcional)');

select * from finish();
rollback;
