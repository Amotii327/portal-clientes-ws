-- "Ver como el cliente" (D-020): solo el super admin con 2FA, ve exactamente lo del cliente, solo lectura,
-- vence solo y queda en el registro.
begin;
select plan(65);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
select tests.crear_proyectos();
select tests.como(tests.id('sa'), 'aal2');
select public.cargar_plan_sprints(tests.proy('Portal A'), '[{"nombre": "Borrador A", "fecha_inicio": "2026-12-01", "fecha_fin": "2026-12-04"}]'::jsonb);
select tests.admin();

-- ---------- Quien puede iniciar ----------
select tests.anonimo();
select throws_ok($$select public.iniciar_ver_como(tests.id('empresa_a'))$$, '42501', null, 'visitante: no inicia "ver como"');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.iniciar_ver_como(tests.id('empresa_a'))$$, '42501', 'no_autorizado', 'admin del cliente: no inicia "ver como"');
select throws_ok($$select public.iniciar_ver_como(tests.id('empresa_b'))$$, '42501', 'no_autorizado', 'admin del cliente: no mira otra empresa');
select tests.como(tests.id('equipo_a'));
select throws_ok($$select public.iniciar_ver_como(tests.id('empresa_a'))$$, '42501', 'no_autorizado', 'equipo del cliente: no inicia "ver como"');
select tests.como(tests.id('sa'), 'aal1');
select throws_ok($$select public.iniciar_ver_como(tests.id('empresa_a'))$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no inicia "ver como"');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.iniciar_ver_como(tests.id('empresa_c'))$$, 'P0001', 'empresa_no_disponible', 'empresa pausada: no aplica');
select throws_ok($$select public.iniciar_ver_como(gen_random_uuid())$$, 'P0001', 'empresa_no_encontrada', 'empresa inexistente');
select throws_ok($$select public.iniciar_ver_como(tests.id('empresa_a'), 'dueno')$$, '22023', 'datos_invalidos', 'rol desconocido: rechazado');
select throws_ok($$select public.terminar_ver_como()$$, 'P0001', 'sin_sesion_ver_como', 'terminar sin sesion abierta');
select is((select count(*)::int from public.sesiones_ver_como), 0, 'los rechazos no dejaron sesiones');
select is(public.mi_contexto() ->> 'estado', 'super_admin', 'antes de empezar: estado super_admin');

-- ---------- Empezar a ver como el admin de A ----------
select is((select public.iniciar_ver_como(tests.id('empresa_a')) ->> 'empresa_nombre'), 'Empresa A', 'inicia "ver como" la empresa A');
select is(public.mi_contexto() ->> 'estado', 'ver_como', 'mi_contexto: estado ver_como');
select is(public.mi_contexto() #>> '{empresa,nombre}', 'Empresa A', 'mi_contexto: trae la empresa vista');
select is(public.mi_contexto() ->> 'rol', 'admin_cliente', 'mi_contexto: rol simulado admin_cliente');
select is(public.mi_contexto() #>> '{permisos,ver_dinero}', 'true', 'mi_contexto: el admin tiene todos los permisos');
select ok((public.mi_contexto() #>> '{ver_como,vence_en}') is not null, 'mi_contexto: dice cuando vence');
select is((public.mi_contexto() ->> 'es_super_admin')::boolean, true, 'mi_contexto: sigue marcado como super admin (para mostrar el boton "salir")');

-- Ve exactamente lo que ve el cliente.
select is((select string_agg(nombre, ',') from public.proyectos), 'Portal A', 've solo los proyectos de A, no los de B');
select is((select count(*)::int from public.hitos), 12, 've 12 hitos: el 13 esta oculto como para el cliente');
select is((select count(*)::int from public.sprints), 0, 'NO ve el borrador del plan, igual que el cliente');
select is((select count(*)::int from public.hitos_pago_asociado), 3, 'como admin, ve el pago asociado');
select is((select count(*)::int from public.datos_facturacion), 1, 'como admin, ve la facturacion de A (y no la de B)');
select is((select count(*)::int from public.registro_actividad), 0, 'no lee el registro de actividad (el cliente tampoco)');
select is(jsonb_array_length(public.inicio_cliente() -> 'proyectos'), 1, 'inicio_cliente funciona en modo "ver como"');
select is(public.linea_de_tiempo(tests.proy('Portal A')) -> 'plan', 'null'::jsonb, 'la linea de tiempo no muestra el borrador');
select throws_ok($$select public.linea_de_tiempo(tests.proy('Portal B'))$$, 'P0001', 'proyecto_no_encontrado', 'la linea de tiempo de otra empresa no existe');
select is((select count(*)::int from public.sesiones_ver_como), 1, 'el super admin real ve su propia sesion');

-- Es solo lectura: nada se escribe.
select throws_ok($$select public.panel_super_admin()$$, '42501', 'no_autorizado', 'en "ver como" no se usan las funciones del super admin (panel)');
select throws_ok($$select public.crear_proyecto(tests.id('empresa_a'), 'Nuevo en modo ver como')$$, '42501', 'ver_como_solo_lectura', 'crear_proyecto: solo lectura');
select throws_ok($$select public.editar_hito(tests.hito('Portal A', 2), p_nombre => 'Cambiado a escondidas')$$, '42501', 'ver_como_solo_lectura', 'editar_hito: solo lectura');
select throws_ok($$select public.aprobar_plan_sprints(tests.proy('Portal A'))$$, '42501', 'ver_como_solo_lectura', 'aprobar el plan: solo lectura');
select throws_ok($$update public.datos_facturacion set razon_social = 'Cambiada por el super admin' where empresa_id = tests.id('empresa_a')$$, '42501', 'ver_como_solo_lectura', 'facturacion (que el admin del cliente si edita): bloqueada en "ver como"');
select throws_ok($$update public.miembros set ver_dinero = true where id = tests.id('miembro_equipo_a')$$, '42501', 'ver_como_solo_lectura', 'permisos del equipo (que el admin si cambia): bloqueado');
select throws_ok($$select public.invitar_miembro(tests.id('empresa_a'), 'nuevo.ver.como@empresa-a.test')$$, '42501', 'ver_como_solo_lectura', 'invitar (que el admin si puede): bloqueado');
select throws_ok($$select public.quitar_miembro(tests.id('miembro_equipo_a'))$$, '42501', 'ver_como_solo_lectura', 'quitar miembro: bloqueado');
select throws_ok($$select public.pausar_empresa(tests.id('empresa_a'), 'x')$$, '42501', null, 'pausar la empresa: bloqueado');
select throws_ok($$insert into public.preferencias_usuario (user_id, tema) values (tests.id('sa'), 'oscura')$$, '42501', null, 'ni siquiera su propio tema se guarda');
select throws_ok($$update public.configuracion set valor = '{"version": "v9"}' where clave = 'politica_datos'$$, '42501', null, 'configuracion: bloqueada');
select tests.admin();
select is((select razon_social from public.datos_facturacion where empresa_id = tests.id('empresa_a')), 'Empresa A SAS', 'comprobado en la base: la facturacion no cambio');
select is((select count(*)::int from public.invitaciones where correo like 'nuevo.ver.como%'), 0, 'comprobado en la base: no se creo la invitacion');
select is((select count(*)::int from public.miembros where quitado_en is not null and empresa_id = tests.id('empresa_a')), 1, 'comprobado en la base: no se quito a nadie (solo el quitado de antes)');

-- ---------- Registro ----------
select is((select count(*)::int from public.registro_actividad where accion = 'ver_como_iniciado' and actor_id = tests.id('sa') and empresa_id = tests.id('empresa_a')), 1, 'registro: inicio de "ver como", con quien y que empresa');
select is((select detalle ->> 'rol' from public.registro_actividad where accion = 'ver_como_iniciado'), 'admin_cliente', 'registro: guarda el rol simulado');

-- ---------- Cambiar de empresa y de rol ----------
select tests.como(tests.id('sa'), 'aal2');
select public.iniciar_ver_como(tests.id('empresa_b'), 'equipo');
select is((select count(*)::int from public.sesiones_ver_como where terminada_en is null), 1, 'solo una sesion abierta a la vez');
select is((select motivo_cierre from public.sesiones_ver_como where empresa_id = tests.id('empresa_a')), 'reemplazada', 'la anterior queda cerrada como "reemplazada"');
select is((select string_agg(nombre, ',') from public.proyectos), 'Portal B', 'ahora ve solo la empresa B');
select is((select count(*)::int from public.hitos_pago_asociado), 0, 'como equipo sin ver_dinero: no ve el pago asociado');
select is((select count(*)::int from public.datos_facturacion), 0, 'como equipo sin ver_dinero: no ve la facturacion');
select is(public.mi_contexto() #>> '{permisos,aprobar}', 'false', 'mi_contexto: el equipo simulado no tiene permisos por defecto');
select public.iniciar_ver_como(tests.id('empresa_b'), 'equipo', p_ver_dinero => true);
select is((select count(*)::int from public.hitos_pago_asociado), 3, 'como equipo con ver_dinero: si lo ve');

-- ---------- Terminar ----------
select public.terminar_ver_como();
select is(public.mi_contexto() ->> 'estado', 'super_admin', 'al terminar: vuelve a super_admin');
select is((select count(*)::int from public.proyectos), 2, 'al terminar: vuelve a ver todos los proyectos');
select lives_ok($$select public.crear_proyecto(tests.id('empresa_a'), 'Despues de ver como')$$, 'al terminar: vuelve a poder escribir');
select is((select count(*)::int from public.registro_actividad where accion = 'ver_como_terminado' and actor_id = tests.id('sa')), 3, 'registro: cada cierre queda anotado (2 reemplazos y 1 manual)');
select is((select string_agg(detalle ->> 'motivo', ',' order by id) from public.registro_actividad where accion = 'ver_como_terminado'), 'reemplazada,reemplazada,manual', 'registro: el motivo de cada cierre');

-- ---------- Vence solo ----------
select tests.admin();
insert into public.sesiones_ver_como (user_id, empresa_id, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos, iniciada_en, vence_en)
values (tests.id('sa'), tests.id('empresa_a'), 'admin_cliente', true, true, true, true, now() - interval '3 hours', now() - interval '2 hours');
select tests.como(tests.id('sa'), 'aal2');
select is(public.mi_contexto() ->> 'estado', 'super_admin', 'una sesion vencida ya no cuenta: vuelve a ser super admin');
select is((select count(*)::int from public.proyectos), 3, 'sesion vencida: ve todo otra vez');
select lives_ok($$select public.crear_proyecto(tests.id('empresa_a'), 'Con sesion vencida')$$, 'sesion vencida: puede escribir');
select public.iniciar_ver_como(tests.id('empresa_a'));
select is((select motivo_cierre from public.sesiones_ver_como where vence_en < now()), 'vencida', 'al iniciar otra, la vencida se cierra como "vencida"');
select public.terminar_ver_como();

-- ---------- Empresa pausada mientras se ve ----------
select public.iniciar_ver_como(tests.id('empresa_a'));
select tests.admin();
update public.empresas set estado = 'pausada', pausada_en = now() where id = tests.id('empresa_a');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.proyectos), 0, 'si la empresa se pausa, no ve nada (como el cliente)');
select is(public.mi_contexto() #>> '{permisos}', null, 'mi_contexto: sin permisos si la empresa esta pausada');
select tests.admin();

-- ---------- Restricciones de la tabla ----------
select throws_ok($$insert into public.sesiones_ver_como (user_id, empresa_id, rol, vence_en) values (tests.id('sa'), tests.id('empresa_b'), 'equipo', now() + interval '3 hours')$$, '23514', null, 'una sesion no puede durar mas de 2 horas');
select throws_ok($$delete from public.sesiones_ver_como$$, '42501', null, 'las sesiones "ver como" no se borran');
select throws_ok($$insert into public.sesiones_ver_como (user_id, empresa_id, rol, aprobar, vence_en) values (tests.id('admin_a'), tests.id('empresa_a'), 'admin_cliente', false, now() + interval '1 hour')$$, '23514', null, 'el admin simulado tiene todos los permisos (restriccion)');

select * from finish();
rollback;
