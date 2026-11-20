-- Contrato, plan de pagos, abonos y saldo calculado en la base. Dinero exacto (numeric), sin pasarse del contrato,
-- abonos que no se editan ni se borran (se anulan con motivo).
begin;
select plan(65);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_dinero.sql
select tests.preparar_dinero();
select tests.como(tests.id('sa'), 'aal2');

-- ---------- Contrato ----------
select is(tests.saldo('Portal A'), 10000000.00, 'saldo inicial = valor del contrato');
select is((select abonado from public.v_contratos_saldo where proyecto_id = tests.proy('Portal A')), 0.00, 'abonado inicial = 0');
select is((select programado from public.v_contratos_saldo where proyecto_id = tests.proy('Portal A')), 10000000.00, 'el plan de pagos suma 10.000.000');
select is((select sin_programar from public.v_contratos_saldo where proyecto_id = tests.proy('Portal A')), 0.00, 'nada sin programar');
select is((select anticipo from public.contratos where proyecto_id = tests.proy('Portal A')), 3000000.00, 'el anticipo queda guardado');
select throws_ok($$select public.crear_contrato(tests.proy('Portal A'), 1, 'COP')$$, 'P0001', 'contrato_ya_existe', 'un solo contrato por proyecto');
select throws_ok($$select public.crear_contrato(gen_random_uuid(), 1, 'COP')$$, 'P0001', 'proyecto_no_encontrado', 'proyecto inexistente');
select throws_ok($$select public.crear_contrato(tests.proy('Portal A'), 1, 'EUR')$$, '22023', 'datos_invalidos', 'moneda distinta de COP/USD');
select throws_ok($$select public.crear_contrato(tests.proy('Portal A'), 0, 'COP')$$, '22023', 'datos_invalidos', 'valor cero');
select throws_ok($$select public.crear_contrato(tests.proy('Portal A'), -5, 'COP')$$, '22023', 'datos_invalidos', 'valor negativo');
select throws_ok($$select public.crear_contrato(tests.proy('Portal A'), 10.123, 'USD')$$, '22023', 'datos_invalidos', 'mas de 2 decimales: no se redondea en silencio');
select throws_ok($$select public.crear_contrato(tests.proy('Portal A'), 100, 'COP', 200)$$, '22023', 'anticipo_excede_valor', 'anticipo mayor que el valor');
select public.crear_proyecto(tests.id('empresa_a'), 'Portal A3');
select lives_ok($$select public.crear_contrato(tests.proy('Portal A3'), 1000.50, 'USD', 100.25)$$, 'contrato con centavos');
select is((select valor from public.contratos where proyecto_id = tests.proy('Portal A3')), 1000.50, 'los centavos se guardan exactos');
select lives_ok($$select public.editar_contrato(tests.contrato('Portal A3'), p_moneda => 'COP')$$, 'la moneda se corrige mientras no hay cuotas ni abonos');
select is((select moneda from public.contratos where proyecto_id = tests.proy('Portal A3')), 'COP', 'moneda corregida');

-- ---------- Estados de cuota ----------
select is((select estado from public.v_pagos_programados where concepto = 'Anticipo'), 'vencido', 'cuota con fecha pasada y sin pagar: vencido');
select is((select estado from public.v_pagos_programados where concepto = 'Segundo pago'), 'por_vencer', 'cuota que vence en 2 dias: por vencer');
select is((select estado from public.v_pagos_programados where concepto = 'Saldo final'), 'pendiente', 'cuota lejana: pendiente');
select is((select pagos_vencidos from public.v_contratos_saldo where proyecto_id = tests.proy('Portal A')), 1, 'el contrato cuenta 1 pago vencido');
select is((select monto_vencido from public.v_contratos_saldo where proyecto_id = tests.proy('Portal A')), 3000000.00, 'monto vencido 3.000.000');
select is((select hito_numero from public.v_pagos_programados where concepto = 'Anticipo'), 1::smallint, 'la cuota trae su hito asociado (1)');
select is((select hito_numero from public.v_pagos_programados where concepto = 'Segundo pago') is null, true, 'una cuota sin hito: hito null');

-- ---------- Abonos y saldo ----------
select is((public.crear_abono(tests.contrato('Portal A'), 3000000, private.hoy() - 9, 'transferencia', tests.pago('Anticipo'), 'REF-1') ->> 'saldo')::numeric,
  7000000.00, 'el abono devuelve el saldo recalculado');
select is(tests.saldo('Portal A'), 7000000.00, 'el saldo se recalculo solo: 10.000.000 - 3.000.000');
select is((select estado from public.v_pagos_programados where concepto = 'Anticipo'), 'pagado', 'la cuota abonada completa queda pagada');
select is((select pagos_vencidos from public.v_contratos_saldo where proyecto_id = tests.proy('Portal A')), 0, 'ya no hay pagos vencidos');
select public.crear_abono(tests.contrato('Portal A'), 1000000, private.hoy(), 'efectivo', tests.pago('Segundo pago'));
select is(tests.saldo('Portal A'), 6000000.00, 'abono parcial: saldo 6.000.000');
select is((select pendiente from public.v_pagos_programados where concepto = 'Segundo pago'), 3000000.00, 'abono parcial: a la cuota le faltan 3.000.000');
select is((select estado from public.v_pagos_programados where concepto = 'Segundo pago'), 'por_vencer', 'abono parcial: la cuota sigue por vencer');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 3000000.01, private.hoy(), 'otro', tests.pago('Segundo pago'))$$,
  'P0001', 'abono_excede_pago', 'un abono no pasa de lo que falta de la cuota');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 6000000.01, private.hoy(), 'otro')$$,
  'P0001', 'abono_excede_saldo', 'un abono no pasa del saldo del contrato');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 100, private.hoy() + 1, 'otro')$$, '22023', 'fechas_invalidas', 'abono con fecha futura');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 100, private.hoy(), 'bitcoin')$$, '22023', 'datos_invalidos', 'medio de pago desconocido');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 0, private.hoy(), 'otro')$$, '22023', 'datos_invalidos', 'abono en cero');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 100.001, private.hoy(), 'otro')$$, '22023', 'datos_invalidos', 'abono con 3 decimales');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), null, private.hoy(), 'otro')$$, '22023', 'datos_invalidos', 'abono sin valor');
select throws_ok($$select public.crear_abono(tests.contrato('Portal B'), 100, private.hoy(), 'otro', tests.pago('Segundo pago'))$$, 'P0001', 'pago_no_encontrado', 'una cuota de otro contrato no sirve');
select throws_ok($$select public.crear_abono(gen_random_uuid(), 100, private.hoy(), 'otro')$$, 'P0001', 'contrato_no_encontrado', 'contrato inexistente');
select throws_ok($$select public.crear_abono(tests.contrato('Portal A'), 100, private.hoy(), 'otro', null, null, 'cualquier/cosa.pdf')$$, '22023', 'archivo_invalido', 'ruta de archivo que no es del modulo');
-- Dinero exacto: 0,10 + 0,20 = 0,30 (con float daria 0,30000000000000004).
select public.crear_abono(tests.contrato('Portal B'), 0.10, private.hoy(), 'otro');
select public.crear_abono(tests.contrato('Portal B'), 0.20, private.hoy(), 'otro');
select is((select abonado from public.v_contratos_saldo where proyecto_id = tests.proy('Portal B')), 0.30, '0,10 + 0,20 = 0,30 exacto (numeric)');
select is(tests.saldo('Portal B'), 4999.70, 'saldo en USD con centavos exacto');

-- ---------- Los abonos no se editan ni se borran: se anulan ----------
select tests.admin();
select throws_ok($$update public.abonos set valor = 1 where referencia = 'REF-1'$$, '23514', 'campo_inmutable: valor', 'el valor de un abono no se edita (ni con superusuario)');
select throws_ok($$delete from public.abonos$$, '42501', 'tabla_solo_agregar: abonos', 'un abono no se borra');
select throws_ok($$truncate public.facturas$$, '42501', 'tabla_solo_agregar: facturas', 'la tabla de facturas no se vacia');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.anular_abono((select id from public.abonos where referencia = 'REF-1'), 'mal')$$, '22023', 'datos_invalidos', 'anular exige un motivo de 5 letras o mas');
select is((public.anular_abono((select id from public.abonos where referencia = 'REF-1'), 'Registrado dos veces por error') ->> 'saldo')::numeric, 9000000.00, 'anular el abono devuelve el saldo (9.000.000: queda el de 1.000.000)');
select is(tests.saldo('Portal A'), 9000000.00, 'el saldo vuelve a subir');
select is((select estado from public.v_pagos_programados where concepto = 'Anticipo'), 'vencido', 'la cuota anulada vuelve a vencida');
select throws_ok($$select public.anular_abono((select id from public.abonos where referencia = 'REF-1'), 'Otra vez el mismo')$$, 'P0001', 'abono_ya_anulado', 'no se anula dos veces');
select is((select anulado_motivo from public.abonos where referencia = 'REF-1'), 'Registrado dos veces por error', 'el motivo queda guardado');
select tests.admin();
select throws_ok($$update public.abonos set anulado_en = null, anulado_motivo = null where referencia = 'REF-1'$$, 'P0001', 'abono_no_modificable', 'una anulacion no se deshace');

-- ---------- Plan de pagos ----------
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.agregar_pago(tests.contrato('Portal A'), 'Extra', 1, private.hoy() + 90)$$, 'P0001', 'pagos_exceden_contrato', 'las cuotas no suman mas que el contrato');
select throws_ok($$select public.editar_pago(tests.pago('Segundo pago'), p_valor => 500000)$$, 'P0001', 'pago_bajo_lo_abonado', 'una cuota no baja de lo ya abonado');
select throws_ok($$select public.editar_pago(tests.pago('Saldo final'), p_hito_id => tests.hito('Portal B', 2))$$, 'P0001', 'hito_de_otro_proyecto', 'el hito debe ser del mismo proyecto');
select throws_ok($$select public.agregar_pago(tests.contrato('Portal A'), 'Otro pago', 1, private.hoy(), tests.hito('Portal B', 2))$$, 'P0001', 'hito_de_otro_proyecto', 'agregar con hito de otro proyecto');
select throws_ok($$select public.quitar_pago(tests.pago('Segundo pago'))$$, 'P0001', 'pago_con_movimientos', 'no se quita una cuota con abonos');
select lives_ok($$select public.quitar_pago(tests.pago('Saldo final'))$$, 'se quita una cuota sin movimientos');
select is((select sin_programar from public.v_contratos_saldo where proyecto_id = tests.proy('Portal A')), 3000000.00, 'queda 3.000.000 sin programar');
select lives_ok($$select public.editar_pago(tests.pago('Segundo pago'), p_concepto => 'Segundo pago (entrega)', p_quitar_hito => true)$$, 'editar concepto de una cuota');

-- ---------- Editar el contrato ----------
select throws_ok($$select public.editar_contrato(tests.contrato('Portal A'), p_valor => 500000, p_anticipo => 0)$$, 'P0001', 'contrato_bajo_lo_comprometido', 'el contrato no baja de lo ya comprometido');
select throws_ok($$select public.editar_contrato(tests.contrato('Portal A'), p_moneda => 'USD')$$, 'P0001', 'moneda_con_movimientos', 'la moneda no cambia con cuotas o abonos');
select throws_ok($$select public.editar_contrato(tests.contrato('Portal A'), p_anticipo => 99999999)$$, '22023', 'anticipo_excede_valor', 'el anticipo no pasa del valor');
select lives_ok($$select public.editar_contrato(tests.contrato('Portal A'), p_valor => 12000000)$$, 'se puede subir el valor del contrato');
select is(tests.saldo('Portal A'), 11000000.00, 'el saldo sigue al nuevo valor: 12.000.000 - 1.000.000');
select * from finish();
rollback;
