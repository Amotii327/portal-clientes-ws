-- "Ver como el cliente" en dinero (solo lectura, ve lo que ve el cliente) y registro de actividad por triggers.
begin;
select plan(38);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_dinero.sql
select tests.preparar_dinero();
create temp table rutas as select tests.ruta('empresa_a', 'facturas') as fa, tests.ruta('empresa_b', 'facturas') as fb,
  tests.ruta('empresa_a', 'comprobantes') as ca;
grant select on rutas to public;

-- ---------- Registro de actividad ----------
select tests.como(tests.id('sa'), 'aal2');
select public.crear_abono(tests.contrato('Portal A'), 3000000, private.hoy() - 9, 'transferencia', tests.pago('Anticipo'), 'REF-9');
select public.crear_factura(tests.contrato('Portal A'), 'WS-REG-1', 3000000, private.hoy() - 9, (select fa from rutas), 'f.pdf', 1000, tests.pago('Anticipo'));
select public.crear_factura(tests.contrato('Portal B'), 'WS-REG-2', 5000, private.hoy() - 9, (select fb from rutas), 'f.pdf', 1000);
select public.editar_pago(tests.pago('Saldo final'), p_vence_el => private.hoy() + 70);
select public.quitar_pago(tests.pago('Saldo final'));
select public.editar_contrato(tests.contrato('Portal A'), p_fecha_firma => private.hoy() - 29);
select tests.como(tests.id('admin_a'));
select public.subir_comprobante(tests.pago('Segundo pago'), (select ca from rutas), 'c.pdf', 'application/pdf', 100, 4000000, private.hoy());
select tests.como(tests.id('sa'), 'aal2');
select public.confirmar_comprobante(tests.comprobante_de('Segundo pago'));
select public.anular_abono((select id from public.abonos where referencia = 'REF-9'), 'Pago aplicado a otra cuenta');
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'contrato_creado'), 2, 'registro: 2 contratos creados');
select is((select count(*)::int from public.registro_actividad where accion = 'contrato_editado'), 1, 'registro: contrato editado');
select is((select count(*)::int from public.registro_actividad where accion = 'pago_programado_creado'), 4, 'registro: 4 cuotas creadas');
select is((select count(*)::int from public.registro_actividad where accion = 'pago_programado_editado'), 1, 'registro: cuota editada');
select is((select count(*)::int from public.registro_actividad where accion = 'pago_programado_quitado'), 1, 'registro: cuota quitada');
select is((select count(*)::int from public.registro_actividad where accion = 'abono_registrado'), 2, 'registro: 2 abonos (uno manual y uno por comprobante)');
select is((select count(*)::int from public.registro_actividad where accion = 'abono_anulado'), 1, 'registro: abono anulado');
select is((select detalle ->> 'motivo' from public.registro_actividad where accion = 'abono_anulado'), 'Pago aplicado a otra cuenta', 'registro: con su motivo');
select is((select count(*)::int from public.registro_actividad where accion = 'factura_subida'), 2, 'registro: 2 facturas subidas');
select is((select count(*)::int from public.registro_actividad where accion in ('comprobante_subido', 'comprobante_confirmado')), 2, 'registro: comprobante subido y confirmado');
select is((select actor_id from public.registro_actividad where accion = 'comprobante_subido'), tests.id('admin_a'), 'registro: el comprobante lo subio el admin A');
select is((select actor_id from public.registro_actividad where accion = 'comprobante_confirmado'), tests.id('sa'), 'registro: lo confirmo el super admin');
select is((select empresa_id from public.registro_actividad where accion = 'comprobante_subido'), tests.id('empresa_a'), 'registro: queda en la empresa A');
select is((select count(*)::int from public.registro_actividad where accion like 'abono%' and detalle ->> 'proyecto_id' = tests.proy('Portal A')::text), 3, 'registro: se filtra por proyecto (indice existente)');
select tests.como(tests.id('admin_a'));
select is((select count(*)::int from public.registro_actividad), 0, 'el cliente no lee el registro de actividad');
select tests.admin();

-- ---------- Ver como el admin de A ----------
select tests.como(tests.id('sa'), 'aal2');
select public.iniciar_ver_como(tests.id('empresa_a'));
select is((select count(*)::int from public.contratos), 1, 've como admin A: solo el contrato de A');
select is((select count(*)::int from public.pagos_programados), 2, 've como admin A: sus cuotas (menos la que se quito)');
select is((select count(*)::int from public.facturas), 1, 've como admin A: su factura');
select is((public.dinero_del_proyecto(tests.proy('Portal A')) #>> '{contrato,moneda}'), 'COP', 've como admin A: dinero_del_proyecto funciona');
select throws_ok($$select public.dinero_del_proyecto(tests.proy('Portal B'))$$, 'P0001', 'proyecto_no_encontrado', 've como admin A: no ve el proyecto de B');
select is((select count(*)::int from public.v_ingresos_por_mes) + (select count(*)::int from public.avisos_salientes), 0, 've como admin A: ingresos y cola de avisos vacios (no es super admin)');
select throws_ok($$select public.comprobantes_por_revisar()$$, '42501', 'no_autorizado', 've como admin A: la bandeja del super admin no funciona');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 1, private.hoy(), 'otro')$$, '42501', 'ver_como_solo_lectura', 'solo lectura: no crea abonos');
select throws_ok($$select public.crear_contrato(tests.proy('Portal B'), 1, 'COP')$$, '42501', 'ver_como_solo_lectura', 'solo lectura: no crea contratos');
select throws_ok($$select public.confirmar_comprobante(gen_random_uuid())$$, '42501', 'ver_como_solo_lectura', 'solo lectura: no confirma comprobantes');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), tests.ruta('empresa_a', 'comprobantes'), 'x.pdf', 'application/pdf', 100, 1, private.hoy())$$, '42501', 'ver_como_solo_lectura', 'solo lectura: no sube comprobantes haciendose pasar por el cliente');
select throws_ok($$select public.anular_factura(tests.factura('WS-REG-1'), 'Intento anular viendo como')$$, '42501', 'ver_como_solo_lectura', 'solo lectura: no anula facturas');
select throws_ok($$insert into public.abonos (empresa_id, contrato_id, valor, fecha_pago, medio) values (tests.id('empresa_a'), tests.contrato('Portal A'), 1, current_date, 'otro')$$, '42501', null, 'solo lectura: tampoco por INSERT directo');
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'comprobantes')), false, 'solo lectura: la regla de Storage no deja subir');
select is(private.puede_leer_archivo_dinero((select fa from rutas)), true, 've como admin A: lee la factura de A');
select is(private.puede_leer_archivo_dinero((select fb from rutas)), false, 've como admin A: no lee la de B');
select public.anotar_descarga_factura(tests.factura('WS-REG-1'));
select throws_ok($$select public.panel_super_admin()$$, '42501', 'no_autorizado', 've como: el panel no abre (hay que salir)');
select public.terminar_ver_como();
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'factura_descargada'), 0, 'viendo como el cliente no se anotan descargas');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.contratos), 2, 'al salir, el super admin vuelve a ver todo');

-- ---------- Ver como equipo ----------
select public.iniciar_ver_como(tests.id('empresa_a'), 'equipo');
select is((select count(*)::int from public.contratos) + (select count(*)::int from public.pagos_programados), 0, 've como equipo sin ver dinero: no ve nada');
select throws_ok($$select public.dinero_del_proyecto(tests.proy('Portal A'))$$, '42501', 'no_autorizado', 've como equipo sin ver dinero: no_autorizado');
select public.iniciar_ver_como(tests.id('empresa_a'), 'equipo', false, true);
select is((select count(*)::int from public.contratos), 1, 've como equipo con ver dinero: ve el contrato');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), tests.ruta('empresa_a', 'comprobantes'), 'x.pdf', 'application/pdf', 100, 1, private.hoy())$$, '42501', 'ver_como_solo_lectura', 've como equipo con ver dinero: solo lectura tambien');
select public.terminar_ver_como();
select * from finish();
rollback;
