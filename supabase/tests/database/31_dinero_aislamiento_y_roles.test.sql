-- Separacion por empresa y por rol en el modulo de dinero. Un usuario de la empresa A no ve nada de la B; el equipo SIN
-- "ver dinero" no ve ni una fila, ni por tabla, ni por vista, ni por funcion, ni por llave directa.
begin;
select plan(74);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_dinero.sql
select tests.preparar_dinero();

-- Empresa C (pausada): un contrato con una cuota, escritos directo como superusuario.
insert into public.proyectos (empresa_id, nombre) values (tests.id('empresa_c'), 'Portal C');
insert into public.contratos (empresa_id, proyecto_id, valor, moneda) values (tests.id('empresa_c'), tests.proy('Portal C'), 900, 'COP');
insert into public.pagos_programados (empresa_id, contrato_id, concepto, valor, vence_el)
  values (tests.id('empresa_c'), tests.contrato('Portal C'), 'Pago C', 900, current_date + 5);
-- Un abono en A y otro en B, una factura en cada una y un comprobante en cada una (como el cliente).
select tests.como(tests.id('sa'), 'aal2');
select public.crear_abono(tests.contrato('Portal A'), 3000000, private.hoy() - 9, 'transferencia', tests.pago('Anticipo'));
select public.crear_abono(tests.contrato('Portal B'), 2000, private.hoy() - 1, 'tarjeta', tests.pago('Anticipo B'));
select public.crear_factura(tests.contrato('Portal A'), 'WS-A-001', 3000000, private.hoy() - 9, tests.ruta('empresa_a', 'facturas'), 'factura-a.pdf', 1000, tests.pago('Anticipo'));
select public.crear_factura(tests.contrato('Portal B'), 'WS-B-001', 2000, private.hoy() - 1, tests.ruta('empresa_b', 'facturas'), 'factura-b.pdf', 1000, tests.pago('Anticipo B'));
select tests.como(tests.id('admin_a'));
select public.subir_comprobante(tests.pago('Segundo pago'), tests.ruta('empresa_a', 'comprobantes', 'pdf'), 'pago-a.pdf', 'application/pdf', 2000, 4000000, private.hoy() - 1);
select tests.como(tests.id('admin_b'));
select public.subir_comprobante(tests.pago('Anticipo B'), tests.ruta('empresa_b', 'comprobantes', 'png'), 'pago-b.png', 'image/png', 2000, 3000, private.hoy());
select tests.admin();

-- ---------- Super admin ----------
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.contratos), 3, 'super admin (2FA): ve los contratos de todas las empresas');
select is((select count(*)::int from public.pagos_programados), 5, 'super admin: ve todas las cuotas');
select is((select count(*)::int from public.abonos), 2, 'super admin: ve todos los abonos');
select is((select count(*)::int from public.facturas), 2, 'super admin: ve todas las facturas');
select is((select count(*)::int from public.comprobantes_pago), 2, 'super admin: ve todos los comprobantes');
select cmp_ok((select count(*)::int from public.avisos_salientes), '>=', 2, 'super admin: ve la cola de avisos');
select is((select count(*)::int from public.v_contratos_saldo), 3, 'super admin: la vista de saldos trae todo');
select tests.como(tests.id('sa'), 'aal1');
select is((select count(*)::int from public.contratos) + (select count(*)::int from public.pagos_programados) + (select count(*)::int from public.abonos)
        + (select count(*)::int from public.facturas) + (select count(*)::int from public.comprobantes_pago) + (select count(*)::int from public.avisos_salientes),
  0, 'super admin SIN 2FA: no ve nada de dinero');
select is((select count(*)::int from public.v_contratos_saldo) + (select count(*)::int from public.v_pagos_programados) + (select count(*)::int from public.v_ingresos_por_mes), 0,
  'super admin SIN 2FA: las vistas vienen vacias');
select throws_ok($$select public.crear_contrato(tests.proy('Portal C'), 1, 'COP')$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no crea contratos');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 1, private.hoy(), 'otro')$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no crea abonos');
select throws_ok($$select public.comprobantes_por_revisar()$$, '42501', 'no_autorizado', 'super admin SIN 2FA: no abre la bandeja de comprobantes');

-- ---------- Admin de A ----------
select tests.como(tests.id('admin_a'));
select is((select count(*)::int from public.contratos), 1, 'admin A: ve solo su contrato');
select is((select moneda from public.contratos), 'COP', 'admin A: es el contrato de A');
select is((select count(*)::int from public.contratos where id = tests.contrato('Portal B')), 0, 'admin A: no ve el contrato de B ni por su id');
select is((select count(*)::int from public.pagos_programados), 3, 'admin A: ve sus 3 cuotas');
select is((select count(*)::int from public.pagos_programados where concepto in ('Anticipo B', 'Pago C')), 0, 'admin A: no ve cuotas de B ni de C');
select is((select count(*)::int from public.abonos), 1, 'admin A: ve su abono');
select is((select count(*)::int from public.facturas), 1, 'admin A: ve su factura');
select is((select numero from public.facturas), 'WS-A-001', 'admin A: es la factura de A');
select is((select count(*)::int from public.comprobantes_pago), 1, 'admin A: ve su comprobante');
select is((select count(*)::int from public.avisos_salientes), 0, 'admin A: la cola de avisos no es suya');
select is((select count(*)::int from public.v_pagos_programados), 3, 'admin A: la vista de cuotas trae solo las suyas');
select is((select count(*)::int from public.v_contratos_saldo), 1, 'admin A: la vista de saldos trae solo el suyo');
select is((select count(*)::int from public.v_ingresos_por_mes) + (select count(*)::int from public.v_ingresos_por_cliente) + (select count(*)::int from public.v_ingresos_por_mes_y_cliente), 0,
  'admin A: los ingresos son solo del super admin (vistas vacias)');
select is((public.dinero_del_proyecto(tests.proy('Portal A')) #>> '{contrato,moneda}'), 'COP', 'admin A: dinero_del_proyecto de A trae su contrato');
select throws_ok($$select public.dinero_del_proyecto(tests.proy('Portal B'))$$, 'P0001', 'proyecto_no_encontrado', 'admin A: dinero_del_proyecto de B responde "no encontrado"');
select throws_ok($$select public.dinero_del_proyecto(gen_random_uuid())$$, 'P0001', 'proyecto_no_encontrado', 'mismo mensaje para un id que no existe (no revela)');
select throws_ok($$select public.comprobantes_por_revisar()$$, '42501', 'no_autorizado', 'admin A: no abre la bandeja del super admin');
select throws_ok($$select public.subir_comprobante(tests.pago('Anticipo B'), tests.ruta('empresa_a', 'comprobantes'), 'x.pdf', 'application/pdf', 100, 1, private.hoy())$$,
  'P0001', 'pago_no_encontrado', 'admin A: no sube comprobante a una cuota de B (mismo mensaje que si no existe)');
select throws_ok($$select public.subir_comprobante(tests.pago('Saldo final'), tests.ruta('empresa_b', 'comprobantes'), 'x.pdf', 'application/pdf', 100, 1, private.hoy())$$,
  '22023', 'archivo_invalido', 'admin A: no usa una ruta de archivo de la carpeta de B');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 1, private.hoy(), 'otro')$$, '42501', 'no_autorizado', 'admin A: no registra abonos (solo el super admin)');
select throws_ok($$select public.crear_contrato(tests.proy('Portal A'), 1, 'COP')$$, '42501', 'no_autorizado', 'admin A: no crea contratos');
select throws_ok($$select public.confirmar_comprobante(tests.comprobante_de('Segundo pago'))$$, '42501', 'no_autorizado', 'admin A: no confirma su propio comprobante');
select throws_ok($$select public.rechazar_comprobante(tests.comprobante_de('Segundo pago'), 'Quiero rechazarlo')$$, '42501', 'no_autorizado', 'admin A: no rechaza comprobantes');
select throws_ok($$select public.anular_abono((select id from public.abonos), 'Quiero anularlo')$$, '42501', 'no_autorizado', 'admin A: no anula abonos');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'X-1', 1, private.hoy(), tests.ruta('empresa_a', 'facturas'), 'x.pdf', 10)$$, '42501', 'no_autorizado', 'admin A: no sube facturas');
select throws_ok($$select public.generar_recordatorios_pago()$$, '42501', null, 'admin A: no dispara los recordatorios');
-- Escrituras directas: ninguna.
select throws_ok($$update public.contratos set valor = 1$$, '42501', null, 'admin A: no actualiza contratos directo');
select throws_ok($$insert into public.abonos (empresa_id, contrato_id, valor, fecha_pago, medio) values (tests.id('empresa_a'), tests.contrato('Portal A'), 1, current_date, 'otro')$$,
  '42501', null, 'admin A: no inserta abonos directo');
select throws_ok($$update public.comprobantes_pago set estado = 'confirmado'$$, '42501', null, 'admin A: no confirma comprobantes por UPDATE');
select throws_ok($$delete from public.facturas$$, '42501', null, 'admin A: no borra facturas');
select throws_ok($$insert into public.comprobantes_pago (empresa_id, contrato_id, pago_programado_id, valor_declarado, fecha_pago_declarada, archivo_path, archivo_nombre, archivo_tipo, tamano_bytes, subido_por)
  values (tests.id('empresa_a'), tests.contrato('Portal A'), tests.pago('Saldo final'), 1, current_date, 'x', 'x', 'application/pdf', 1, tests.id('admin_a'))$$, '42501', null,
  'admin A: no inserta comprobantes directo (solo por la funcion)');

-- ---------- Equipo A sin "ver dinero" ----------
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.contratos) + (select count(*)::int from public.pagos_programados) + (select count(*)::int from public.abonos)
        + (select count(*)::int from public.facturas) + (select count(*)::int from public.comprobantes_pago) + (select count(*)::int from public.avisos_salientes),
  0, 'equipo sin ver dinero: no ve ninguna fila del modulo');
select is((select count(*)::int from public.v_contratos_saldo) + (select count(*)::int from public.v_pagos_programados), 0, 'equipo sin ver dinero: las vistas vienen vacias');
select throws_ok($$select public.dinero_del_proyecto(tests.proy('Portal A'))$$, '42501', 'no_autorizado', 'equipo sin ver dinero: la funcion de lectura responde no_autorizado (no vacio)');
select throws_ok($$select public.subir_comprobante(tests.pago('Saldo final'), tests.ruta('empresa_a', 'comprobantes'), 'x.pdf', 'application/pdf', 100, 1, private.hoy())$$,
  '42501', 'no_autorizado', 'equipo sin ver dinero: no sube comprobantes');
select is((select count(*)::int from public.comprobantes_pago), 0, 'equipo sin ver dinero: no quedo ningun comprobante nuevo');
select is(public.inicio_cliente() -> 'pagos_vencidos', 'null'::jsonb, 'equipo sin ver dinero: el inicio no trae pagos vencidos (null)');
select is(public.inicio_cliente() -> 'proximo_pago', 'null'::jsonb, 'equipo sin ver dinero: el inicio no trae el proximo pago (null)');
select is((select count(*)::int from public.hitos_pago_asociado), 0, 'equipo sin ver dinero: tampoco la etiqueta de pago del hito (sprint 2)');
select is((public.linea_de_tiempo(tests.proy('Portal A')) -> 'hitos' -> 0 ->> 'pago_asociado') is null, true, 'equipo sin ver dinero: la linea de tiempo no trae el pago asociado');

-- ---------- Equipo A con "ver dinero" pero sin "subir archivos" ----------
select tests.como(tests.id('equipo_a2'));
select is((select count(*)::int from public.pagos_programados), 3, 'equipo con ver dinero: ve las cuotas de su empresa');
select is((select count(*)::int from public.pagos_programados where concepto in ('Anticipo B', 'Pago C')), 0, 'equipo con ver dinero: nunca las de otra empresa');
select is((public.dinero_del_proyecto(tests.proy('Portal A')) #>> '{contrato,valor}')::numeric, 10000000::numeric, 'equipo con ver dinero: lee el contrato');
select throws_ok($$select public.subir_comprobante(tests.pago('Saldo final'), tests.ruta('empresa_a', 'comprobantes'), 'x.pdf', 'application/pdf', 100, 1, private.hoy())$$,
  '42501', 'no_autorizado', 'equipo con ver dinero pero sin subir archivos: no sube comprobantes');
select is(public.inicio_cliente() ->> 'pagos_vencidos', '0', 'equipo con ver dinero: el inicio trae el conteo de pagos vencidos (0: el anticipo ya esta pagado)');

-- ---------- Sin acceso: quitado, bloqueado, perfil bloqueado, empresa pausada, otra empresa ----------
select tests.como(tests.id('quitado_a'));
select is((select count(*)::int from public.contratos) + (select count(*)::int from public.pagos_programados), 0, 'miembro quitado: no ve dinero');
select tests.como(tests.id('bloq_a'));
select is((select count(*)::int from public.contratos) + (select count(*)::int from public.pagos_programados), 0, 'miembro bloqueado: no ve dinero');
select tests.como(tests.id('perfil_bloq'));
select is((select count(*)::int from public.contratos) + (select count(*)::int from public.pagos_programados), 0, 'perfil bloqueado: no ve dinero');
select tests.como(tests.id('admin_c'));
select is((select count(*)::int from public.contratos) + (select count(*)::int from public.pagos_programados), 0, 'admin de empresa pausada: no ve dinero');
select tests.como(tests.id('sin_perfil'));
select is((select count(*)::int from public.contratos) + (select count(*)::int from public.v_contratos_saldo), 0, 'usuario sin empresa: no ve dinero');
select tests.como(tests.id('equipo_b'));
select is((select count(*)::int from public.contratos) + (select count(*)::int from public.pagos_programados), 0, 'equipo de B sin ver dinero: no ve dinero');
select tests.como(tests.id('admin_b'));
select is((select count(*)::int from public.contratos where moneda = 'USD'), 1, 'admin B: ve su contrato en USD');
select is((select count(*)::int from public.contratos where moneda = 'COP'), 0, 'admin B: no ve el de A');
select is((select count(*)::int from public.facturas where numero = 'WS-A-001'), 0, 'admin B: no ve la factura de A');
select is((select count(*)::int from public.comprobantes_pago where valor_declarado = 4000000), 0, 'admin B: no ve el comprobante de A');
select is((select count(*)::int from public.abonos where valor = 3000000), 0, 'admin B: no ve el abono de A');
select throws_ok($$select public.dinero_del_proyecto(tests.proy('Portal A'))$$, 'P0001', 'proyecto_no_encontrado', 'admin B: no abre el dinero del proyecto de A');
-- Visitante
select tests.anonimo();
select throws_ok($$select count(*) from public.contratos$$, '42501', null, 'visitante: sin permiso sobre contratos');
select throws_ok($$select count(*) from public.v_contratos_saldo$$, '42501', null, 'visitante: sin permiso sobre la vista de saldos');
select throws_ok($$select public.dinero_del_proyecto(tests.proy('Portal A'))$$, '42501', null, 'visitante: no ejecuta funciones de dinero');
select throws_ok($$select public.subir_comprobante(tests.pago('Saldo final'), 'x', 'x', 'application/pdf', 1, 1, current_date)$$, '42501', null, 'visitante: no sube comprobantes');
select tests.admin();
select is((select count(*)::int from public.contratos), 3, 'control: como superusuario siguen los 3 contratos');
select * from finish();
rollback;
