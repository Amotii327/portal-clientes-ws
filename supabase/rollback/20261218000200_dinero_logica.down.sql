-- Rollback del sprint 4 · vistas y reglas de dinero. Los triggers se van con "cascade".
drop view if exists public.v_ingresos_por_mes_y_cliente;
drop view if exists public.v_ingresos_por_cliente;
drop view if exists public.v_ingresos_por_mes;
drop view if exists public.v_contratos_saldo;
drop view if exists public.v_pagos_programados;
drop function if exists private.trg_comprobante_validar() cascade;
drop function if exists private.trg_factura_validar() cascade;
drop function if exists private.trg_abono_validar() cascade;
drop function if exists private.trg_pago_validar() cascade;
drop function if exists private.trg_contrato_validar() cascade;
