-- Cierre de M-7 (rastro de intentos rechazados e inicios de sesion) y M-8 (reglas sin consultas por fila).
begin;
select plan(19);
\ir ../local/fixtures.sql

-- ---------- M-7: anotar_rechazo ----------
select tests.como(tests.id('admin_a'), 'aal2');
select public.anotar_rechazo('quitar_miembro', 'no_autorizado');
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'accion_rechazada' and actor_id = tests.id('admin_a') and empresa_id = tests.id('empresa_a')
             and entidad = 'quitar_miembro' and detalle ->> 'codigo' = 'no_autorizado'), 1, 'anota el rechazo con quien, su empresa, la funcion y el codigo');

select tests.como(tests.id('admin_a'), 'aal2');
select public.anotar_rechazo('Robert; drop table', 'no_autorizado');
select public.anotar_rechazo('quitar_miembro', 'texto libre con espacios');
select public.anotar_rechazo(null, null);
select public.anotar_rechazo('x', 'no_autorizado');
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'accion_rechazada'), 1, 'ignora acciones o codigos que no cumplen el patron (no se llena el registro con texto libre)');

select tests.como(tests.id('equipo_a'));
select public.anotar_rechazo('invitar_miembro', 'no_autorizado') from generate_series(1, 25);
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'accion_rechazada' and actor_id = tests.id('equipo_a')), 20, 'tope de 20 rechazos por minuto por persona');

select tests.como(tests.id('quitado_a'));
select public.anotar_rechazo('invitar_miembro', 'no_autorizado');
select tests.como(tests.id('sin_perfil'));
select public.anotar_rechazo('invitar_miembro', 'no_autorizado');
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'accion_rechazada' and actor_id in (tests.id('quitado_a'), tests.id('sin_perfil'))), 0, 'un usuario sin acceso no escribe en el registro');
select tests.anonimo();
select throws_ok($$select public.anotar_rechazo('invitar_miembro', 'no_autorizado')$$, '42501', null, 'un visitante no puede llamar la funcion');

select tests.como(tests.id('sa'), 'aal2');
select public.anotar_rechazo('crear_empresa', 'datos_invalidos');
select tests.admin();
select is((select empresa_id from public.registro_actividad where accion = 'accion_rechazada' and actor_id = tests.id('sa')), null, 'super admin: el rechazo queda sin empresa');
select tests.como(tests.id('sa'), 'aal1');
select public.anotar_rechazo('crear_empresa', 'no_autorizado');
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'accion_rechazada' and actor_id = tests.id('sa')), 1, 'super admin sin 2FA: no escribe (es un acceso sin poderes)');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.registro_actividad), 0, 'el cliente no lee el registro de rechazos');
select throws_ok($$insert into public.registro_actividad (accion, entidad) values ('accion_rechazada', 'falsa')$$, '42501', null, 'nadie escribe el registro directo: solo la funcion');
select ok(not has_function_privilege('anon', 'public.anotar_rechazo(text,text)', 'execute'), 'anon no ejecuta anotar_rechazo');

-- ---------- M-7: inicios de sesion desde el gancho de Auth ----------
select tests.admin();
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('admin_b'), 'valid', false)) as _a \gset
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('admin_b'), 'valid', false)) as _b \gset
select is((select string_agg(detalle ->> 'fallos_seguidos', ',' order by id) from public.registro_actividad where accion = 'inicio_de_sesion_fallido' and actor_id = tests.id('admin_b')), '1,2', 'cada fallo de entrada queda anotado, con el conteo seguido');
select is((select empresa_id from public.registro_actividad where accion = 'inicio_de_sesion_fallido' limit 1), tests.id('empresa_b'), 'el fallo queda en la empresa del usuario');
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('admin_b'), 'valid', true)) as _c \gset
select is((select count(*)::int from public.registro_actividad where accion = 'inicio_de_sesion' and actor_id = tests.id('admin_b')), 1, 'un inicio de sesion correcto queda anotado');
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('equipo_b'), 'valid', false)) as _d1 \gset
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('equipo_b'), 'valid', false)) as _d2 \gset
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('equipo_b'), 'valid', false)) as _d3 \gset
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('equipo_b'), 'valid', false)) as _d4 \gset
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('equipo_b'), 'valid', false)) ->> 'decision' as quinto \gset
select is(:'quinto'::text, 'reject', 'el quinto fallo frena la cuenta (sigue igual que antes)');
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('equipo_b'), 'valid', false)) as _e \gset
select private.gancho_intento_de_acceso(jsonb_build_object('user_id', tests.id('equipo_b'), 'valid', true)) as _f \gset
select is((select count(*)::int from public.registro_actividad where accion = 'inicio_de_sesion_fallido' and actor_id = tests.id('equipo_b')), 5, 'se anotan 5 fallos por racha; con la cuenta frenada no se anota mas (no se llena el registro)');
select is((select count(*)::int from public.registro_actividad where accion = 'inicio_de_sesion' and actor_id = tests.id('equipo_b')), 0, 'con la cuenta frenada ni la clave correcta entra ni se anota como inicio');
select is((select count(*)::int from public.registro_actividad where accion = 'cuenta_frenada_por_intentos' and entidad_id = tests.id('equipo_b')::text), 1, 'el frenado sigue anotado');

-- ---------- M-8: reglas sin consultas por fila ----------
select is_empty($$select tablename || '.' || policyname from pg_policies
                   where schemaname = 'public' and tablename in ('datos_facturacion', 'miembros', 'invitaciones')
                     and (qual like '%es_admin_cliente%' or with_check like '%es_admin_cliente%' or qual like '%tiene_permiso%')$$,
  'las politicas de facturacion, miembros e invitaciones ya no llaman funciones por fila (usan subconsultas que se evaluan una vez)');
select is_empty($$select tablename || '.' || policyname from pg_policies
                   where schemaname = 'public' and tablename in ('proyectos', 'hitos', 'hitos_pago_asociado', 'sprints', 'retrasos', 'cambios_plan', 'historial_proyecto', 'sesiones_ver_como')
                     and (qual like '%es_admin_cliente%' or qual like '%tiene_permiso%' or qual like '%miembro_activo%')$$,
  'las politicas nuevas tampoco');

select * from finish();
rollback;
