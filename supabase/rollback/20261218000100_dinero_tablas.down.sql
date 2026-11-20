-- Rollback del sprint 4 · tablas de dinero. Los triggers y politicas caen con las tablas.
drop table if exists public.avisos_salientes;
drop table if exists public.comprobantes_pago;
drop table if exists public.facturas;
drop table if exists public.abonos;
drop table if exists public.pagos_programados;
drop table if exists public.contratos;
