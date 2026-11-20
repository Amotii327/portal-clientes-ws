-- El registro de actividad lo escriben los triggers, solo se agrega y no guarda secretos.
begin;
select plan(24);
\ir ../local/fixtures.sql

-- Lo creado como superusuario (sin sesion) queda como "sistema".
select is((select count(*)::int from public.registro_actividad where accion = 'empresa_creada' and actor_tipo = 'sistema' and actor_id is null), 3, 'sin sesion: las 3 empresas quedan anotadas como "sistema"');
select ok((select count(*) from public.registro_actividad where accion = 'super_admin_agregado') = 1, 'super admin agregado: queda anotado');
select ok((select count(*) from public.registro_actividad where accion = 'miembro_agregado') = 9, 'cada miembro agregado queda anotado');

select set_config('request.headers', '{"x-forwarded-for": "198.51.100.20"}', true) is not null as _ \gset

-- ---------- Acciones de un admin de cliente ----------
select tests.como(tests.id('admin_a'));
update public.miembros set ver_dinero = true where id = tests.id('miembro_equipo_a');
update public.datos_facturacion set razon_social = 'A Renombrada SAS' where empresa_id = tests.id('empresa_a');
select public.invitar_miembro(tests.id('empresa_a'), 'nuevo@empresa-a.test') ->> 'token' as tok \gset
select public.quitar_miembro(tests.id('miembro_equipo_a2'));
select public.bloquear_miembro(tests.id('miembro_equipo_a'));
select tests.admin();

select is((select actor_id from public.registro_actividad where accion = 'permisos_cambiados'), tests.id('admin_a'), 'permisos cambiados: anota quien lo hizo');
select is((select empresa_id from public.registro_actividad where accion = 'permisos_cambiados'), tests.id('empresa_a'), 'permisos cambiados: anota la empresa');
select is((select host(ip) from public.registro_actividad where accion = 'permisos_cambiados'), '198.51.100.20', 'permisos cambiados: anota la IP de la cabecera del proxy');
select is((select detalle -> 'antes' ->> 'ver_dinero' || '>' || (detalle -> 'despues' ->> 'ver_dinero') from public.registro_actividad where accion = 'permisos_cambiados'), 'false>true', 'permisos cambiados: guarda el antes y el despues');
select is((select detalle ->> 'campos' from public.registro_actividad where accion = 'facturacion_editada'), '["razon_social"]', 'facturacion editada: guarda que campos cambio, no los valores');
select is((select count(*)::int from public.registro_actividad where accion = 'invitacion_creada' and actor_id = tests.id('admin_a')), 1, 'invitar: queda anotado');
select is((select count(*)::int from public.registro_actividad where accion = 'miembro_quitado' and entidad_id = tests.id('miembro_equipo_a2')::text), 1, 'quitar: queda anotado');
select is((select count(*)::int from public.registro_actividad where accion = 'miembro_bloqueado' and entidad_id = tests.id('miembro_equipo_a')::text), 1, 'bloquear: queda anotado');

-- ---------- Acciones del super admin ----------
select tests.como(tests.id('sa'), 'aal2');
select public.pausar_empresa(tests.id('empresa_b'), 'prueba');
select public.reactivar_empresa(tests.id('empresa_b'));
select public.bloquear_usuario(tests.id('equipo_b'));
update public.configuracion set valor = '{"version": "v2"}' where clave = 'politica_datos';
update public.empresas set nombre = 'Empresa B Ltda' where id = tests.id('empresa_b');
select public.crear_empresa('Registro SAS', 'Registro SAS', '900600600-6', 'f@registro.test', 'jefe@registro.test') ->> 'token' as tok_reg \gset
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'empresa_pausada' and empresa_id = tests.id('empresa_b') and actor_id = tests.id('sa')), 1, 'pausar: queda anotado con el super admin');
select is((select count(*)::int from public.registro_actividad where accion = 'empresa_reactivada' and empresa_id = tests.id('empresa_b')), 1, 'reactivar: queda anotado');
select is((select count(*)::int from public.registro_actividad where accion = 'usuario_bloqueado' and entidad_id = tests.id('equipo_b')::text), 1, 'bloqueo de usuario: queda anotado');
select is((select count(*)::int from public.registro_actividad where accion = 'configuracion_cambiada' and entidad_id = 'politica_datos' and actor_id = tests.id('sa')), 1, 'cambio de configuracion: queda anotado');
select is((select count(*)::int from public.registro_actividad where accion = 'empresa_editada' and empresa_id = tests.id('empresa_b')), 1, 'edicion de empresa: queda anotada');
select is((select count(*)::int from public.registro_actividad where accion = 'empresa_creada' and detalle ->> 'nombre' = 'Registro SAS'), 1, 'crear empresa: queda anotado');

-- Una actualizacion que no cambia nada relevante no genera ruido.
select tests.como(tests.id('equipo_a2'));
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'permisos_cambiados'), 1, 'sin cambios reales no se anota nada nuevo');

-- Ningun secreto en el registro: ni el token en claro ni su hash.
select is((select count(*)::int from public.registro_actividad r
            where r.detalle::text like '%' || :'tok'::text || '%' or r.detalle::text like '%' || :'tok_reg'::text || '%'
               or r.detalle::text like '%' || encode(sha256(convert_to(:'tok'::text, 'utf8')), 'hex') || '%'), 0, 'el registro no contiene tokens ni hashes de tokens');

-- ---------- Solo se agrega ----------
select throws_ok($$update public.registro_actividad set accion = 'borrada'$$, '42501', null, 'registro: ni el superusuario puede editar filas');
select throws_ok($$delete from public.registro_actividad$$, '42501', null, 'registro: ni el superusuario puede borrar filas');
select throws_ok($$truncate public.registro_actividad$$, '42501', null, 'registro: ni el superusuario puede vaciarlo');
insert into public.aceptaciones_politica (user_id, version) values (tests.id('admin_a'), 'v1');
select throws_ok($$update public.aceptaciones_politica set version = 'v0'$$, '42501', null, 'aceptaciones: no se editan');
select throws_ok($$delete from public.aceptaciones_politica$$, '42501', null, 'aceptaciones: no se borran');

select * from finish();
rollback;
