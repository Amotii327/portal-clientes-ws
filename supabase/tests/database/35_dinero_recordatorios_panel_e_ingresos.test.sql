-- Recordatorios de pago (cola de avisos), panel del super admin, inicio del cliente e ingresos (solo super admin).
begin;
select plan(55);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_dinero.sql
select tests.preparar_dinero();

-- Un segundo contrato en la empresa A con cuotas en distintos dias, y un contrato en la empresa pausada C.
select tests.como(tests.id('sa'), 'aal2');
select public.crear_proyecto(tests.id('empresa_a'), 'Portal A3');
select public.crear_contrato(tests.proy('Portal A3'), 1000000, 'COP');
select public.agregar_pago(tests.contrato('Portal A3'), 'Vence hoy', 100000, private.hoy());
select public.agregar_pago(tests.contrato('Portal A3'), 'Vence en 3', 100000, private.hoy() + 3);
select public.agregar_pago(tests.contrato('Portal A3'), 'Vence en 4', 100000, private.hoy() + 4);
select public.agregar_pago(tests.contrato('Portal A3'), 'Ya pagada', 100000, private.hoy() - 1);
select public.agregar_pago(tests.contrato('Portal A3'), 'En revision', 100000, private.hoy() - 1);
select public.crear_abono(tests.contrato('Portal A3'), 100000, private.hoy(), 'efectivo', tests.pago('Ya pagada'));
select tests.admin();
insert into public.proyectos (empresa_id, nombre) values (tests.id('empresa_c'), 'Portal C');
insert into public.contratos (empresa_id, proyecto_id, valor, moneda) values (tests.id('empresa_c'), tests.proy('Portal C'), 900, 'COP');
insert into public.pagos_programados (empresa_id, contrato_id, concepto, valor, vence_el)
  values (tests.id('empresa_c'), tests.contrato('Portal C'), 'Pago C vencido', 900, private.hoy() - 20);
select tests.como(tests.id('admin_a'));
select public.subir_comprobante(tests.pago('En revision'), tests.ruta('empresa_a', 'comprobantes'), 'rev.pdf', 'application/pdf', 100, 100000, private.hoy() - 1);
select tests.admin();
-- Los avisos que ya trae la cola por el comprobante (no son recordatorios).
select is((select count(*)::int from public.avisos_salientes where tipo like 'pago\_%'), 0, 'antes de correr la tarea no hay recordatorios');

-- ---------- Quien puede disparar la tarea ----------
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.generar_recordatorios_pago()$$, '42501', null, 'ni el super admin la dispara desde la pantalla (solo la clave de sistema)');
select tests.como(tests.id('admin_a'));
select throws_ok($$select public.generar_recordatorios_pago()$$, '42501', null, 'admin del cliente: no la dispara');
select tests.anonimo();
select throws_ok($$select public.generar_recordatorios_pago()$$, '42501', null, 'visitante: no la dispara');
select tests.admin();

-- ---------- Generar ----------
set local role service_role;
select is((public.generar_recordatorios_pago() ->> 'avisos_nuevos')::int, 5, 'la tarea encola 5 avisos: vencido (cliente + super admin), por vencer x2 y vence hoy');
reset role;
select is((select count(*)::int from public.avisos_salientes where tipo = 'pago_vencido' and destino = 'cliente_dinero'), 1, 'un aviso de vencido para el cliente (Anticipo)');
select is((select count(*)::int from public.avisos_salientes where tipo = 'pago_vencido' and destino = 'super_admin'), 1, 'y uno para el super admin');
select is((select datos ->> 'concepto' from public.avisos_salientes where tipo = 'pago_vencido' and destino = 'super_admin'), 'Anticipo', 'el aviso del super admin dice cual cuota');
select is((select datos ->> 'empresa_nombre' from public.avisos_salientes where tipo = 'pago_vencido' and destino = 'super_admin'), 'Empresa A', '... y de que empresa');
select is((select count(*)::int from public.avisos_salientes where tipo = 'pago_por_vencer'), 2, 'dos avisos de "por vencer" (vence en 2 y vence en 3 dias)');
select is((select count(*)::int from public.avisos_salientes where tipo = 'pago_vence_hoy'), 1, 'un aviso de "vence hoy"');
select is((select datos ->> 'concepto' from public.avisos_salientes where tipo = 'pago_vence_hoy'), 'Vence hoy', 'es el de la cuota que vence hoy');
select is((select count(*)::int from public.avisos_salientes where datos ->> 'concepto' in ('Vence en 4', 'Saldo final', 'Anticipo B')), 0, 'las cuotas lejanas (4 dias o mas) no avisan');
select is((select count(*)::int from public.avisos_salientes where datos ->> 'concepto' = 'Ya pagada'), 0, 'una cuota pagada no avisa');
select is((select count(*)::int from public.avisos_salientes where tipo like 'pago\_%' and datos ->> 'concepto' = 'En revision'), 0, 'una cuota con comprobante en revision no avisa al cliente');
select is((select count(*)::int from public.avisos_salientes where empresa_id = tests.id('empresa_c')), 0, 'una empresa pausada no recibe avisos');
select is((select count(*)::int from public.avisos_salientes where tipo like 'pago\_%' and estado = 'pendiente' and modulo = 'dinero'), 5, 'todos quedan pendientes, del modulo dinero');
select is((select count(*)::int from public.avisos_salientes where tipo like 'pago\_%' and empresa_id = tests.id('empresa_b')), 0, 'la empresa B (cuota a 10 dias) no tiene avisos y nada de A le cae');
select is((select count(*)::int from public.registro_actividad where actor_tipo = 'sistema' and accion = 'abono_registrado'), 0, 'la tarea no inventa registros');
-- Idempotente: dos corridas no duplican (sin doble aviso).
set local role service_role;
select is((public.generar_recordatorios_pago() ->> 'avisos_nuevos')::int, 0, 'segunda corrida: 0 avisos nuevos (no se repite)');
reset role;
select is((select count(*)::int from public.avisos_salientes where tipo like 'pago\_%'), 5, 'siguen 5 en la cola');
-- Cambiar la fecha de una cuota puede generar un aviso nuevo (otra fecha, otra clave).
select tests.como(tests.id('sa'), 'aal2');
select public.editar_pago(tests.pago('Segundo pago'), p_vence_el => private.hoy() + 1);
select tests.admin();
set local role service_role;
select is((public.generar_recordatorios_pago() ->> 'avisos_nuevos')::int, 1, 'con la fecha nueva de la cuota se encola 1 aviso mas');
reset role;
-- Un abono completo apaga el aviso.
select tests.como(tests.id('sa'), 'aal2');
select public.crear_abono(tests.contrato('Portal A3'), 100000, private.hoy(), 'otro', tests.pago('Vence hoy'));
select tests.admin();
select is((select count(*)::int from public.v_pagos_programados where concepto = 'Vence hoy' and estado = 'pagado'), 1, 'la cuota que vencia hoy queda pagada');

-- ---------- Quien ve la cola ----------
select tests.como(tests.id('admin_a'));
select is((select count(*)::int from public.avisos_salientes), 0, 'el cliente NO lee la cola de avisos');
select throws_ok($$update public.avisos_salientes set estado = 'enviado'$$, '42501', null, 'el cliente no marca avisos como enviados');
select tests.como(tests.id('sa'), 'aal2');
select cmp_ok((select count(*)::int from public.avisos_salientes), '>=', 6, 'el super admin si la lee');
select throws_ok($$update public.avisos_salientes set estado = 'enviado', enviado_en = now()$$, '42501', null, 'ni el super admin la escribe desde la API (la vaciara el modulo de notificaciones)');
select tests.admin();
select throws_ok($$update public.avisos_salientes set clave_unica = 'otra-clave-distinta'$$, '23514', 'campo_inmutable: clave_unica', 'la clave unica de un aviso no cambia');

-- ---------- Panel del super admin ----------
select tests.como(tests.id('sa'), 'aal2');
select is((public.panel_super_admin() -> 'totales' ->> 'pagos_vencidos')::int, 1, 'panel: 1 pago vencido (el Anticipo de A; la cuota en revision y la de la empresa pausada no cuentan)');
select is((public.panel_super_admin() -> 'totales' ->> 'comprobantes_en_revision')::int, 1, 'panel: 1 comprobante en revision');
select is((public.panel_super_admin() -> 'totales') -> 'tickets_abiertos', 'null'::jsonb, 'panel: tickets sigue en null (sprint 5)');
select is((select x ->> 'concepto' from jsonb_array_elements(public.panel_super_admin() -> 'atencion') x where x ->> 'tipo' = 'pago_vencido'), 'Anticipo', 'panel: "atencion" trae el pago vencido');
select is((select (x ->> 'dias_de_atraso')::int from jsonb_array_elements(public.panel_super_admin() -> 'atencion') x where x ->> 'tipo' = 'pago_vencido'), 10, 'panel: con 10 dias de atraso');
select is((select x ->> 'prioridad' from jsonb_array_elements(public.panel_super_admin() -> 'atencion') x where x ->> 'tipo' = 'pago_vencido'), '1', 'panel: el pago vencido es prioridad 1');
select is((select count(*)::int from jsonb_array_elements(public.panel_super_admin() -> 'atencion') x where x ->> 'concepto' = 'Pago C vencido'), 0, 'panel: no muestra pagos de empresas pausadas');
select is(jsonb_typeof(public.panel_super_admin() -> 'totales' -> 'hitos_atrasados'), 'number', 'panel: lo del sprint 2 sigue funcionando');

-- ---------- Inicio del cliente ----------
select tests.como(tests.id('admin_a'));
select is((public.inicio_cliente() ->> 'pagos_vencidos')::int, 1, 'inicio admin A: 1 pago vencido');
select is((public.inicio_cliente() -> 'proximo_pago' ->> 'concepto'), 'Anticipo', 'inicio admin A: el proximo pago es el vencido (el mas antiguo)');
select is((public.inicio_cliente() -> 'proximo_pago' ->> 'estado'), 'vencido', 'inicio admin A: marcado como vencido');
select is((public.inicio_cliente() -> 'proximo_pago' ->> 'pendiente')::numeric, 3000000.00, 'inicio admin A: con lo que falta');
select is(jsonb_array_length(public.inicio_cliente() -> 'proyectos'), 2, 'inicio admin A: lo del sprint 2 sigue (2 proyectos)');
select tests.como(tests.id('admin_b'));
select is((public.inicio_cliente() ->> 'pagos_vencidos')::int, 0, 'inicio admin B: 0 pagos vencidos (no cuenta los de A)');
select is((public.inicio_cliente() -> 'proximo_pago' ->> 'concepto'), 'Anticipo B', 'inicio admin B: su proximo pago');
select tests.como(tests.id('equipo_a'));
select is(public.inicio_cliente() -> 'proximo_pago', 'null'::jsonb, 'inicio equipo sin ver dinero: sin proximo pago');
select tests.como(tests.id('equipo_a2'));
select is((public.inicio_cliente() ->> 'pagos_vencidos')::int, 1, 'inicio equipo con ver dinero: 1 pago vencido');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.inicio_cliente()$$, '42501', 'no_autorizado', 'el super admin sigue usando el panel, no el inicio del cliente');

-- ---------- Ingresos: por mes y por cliente, solo super admin ----------
select tests.admin();
select tests.como(tests.id('sa'), 'aal2');
select public.crear_abono(tests.contrato('Portal A'), 3000000, private.hoy(), 'transferencia', tests.pago('Anticipo'));
select public.crear_abono(tests.contrato('Portal A'), 500000, (date_trunc('month', private.hoy()) - interval '1 day')::date, 'transferencia');
select public.crear_abono(tests.contrato('Portal B'), 2000, private.hoy(), 'tarjeta');
select public.anular_abono((public.crear_abono(tests.contrato('Portal B'), 777, private.hoy(), 'otro') ->> 'abono_id')::uuid, 'Registrado por error');
select is((select count(*)::int from public.v_ingresos_por_mes), 3, 'ingresos por mes: 3 filas (COP este mes, COP mes pasado, USD este mes)');
select is((select total from public.v_ingresos_por_mes where moneda = 'COP' and mes = date_trunc('month', private.hoy())::date), 3200000.00, 'ingresos del mes en COP: 3.200.000 (suma los dos contratos del cliente A)');
select is((select total from public.v_ingresos_por_mes where moneda = 'COP' and mes < date_trunc('month', private.hoy())::date), 500000.00, 'ingresos del mes pasado: 500.000');
select is((select total from public.v_ingresos_por_mes where moneda = 'USD'), 2000.00, 'los USD van aparte y sin el abono anulado (777)');
select is((select total from public.v_ingresos_por_cliente where empresa_nombre = 'Empresa A'), 3700000.00, 'ingresos por cliente: Empresa A 3.700.000');
select is((select abonos from public.v_ingresos_por_cliente where empresa_nombre = 'Empresa A'), 4, '... en 4 abonos');
select is((select count(*)::int from public.v_ingresos_por_mes_y_cliente), 3, 'ingresos por mes y por cliente: 3 filas');
select tests.como(tests.id('admin_a'));
select is((select count(*)::int from public.v_ingresos_por_mes) + (select count(*)::int from public.v_ingresos_por_cliente) + (select count(*)::int from public.v_ingresos_por_mes_y_cliente), 0, 'el cliente no ve ingresos (ni los suyos)');
select tests.como(tests.id('sa'), 'aal1');
select is((select count(*)::int from public.v_ingresos_por_mes_y_cliente), 0, 'super admin sin 2FA: ingresos vacios');
select * from finish();
rollback;
