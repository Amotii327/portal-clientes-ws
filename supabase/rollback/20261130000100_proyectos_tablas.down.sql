-- Rollback del sprint 2 · tablas. Los triggers y politicas caen con las tablas.
drop table if exists public.sesiones_ver_como;
drop table if exists public.historial_proyecto;
drop table if exists public.cambios_plan;
drop table if exists public.retrasos;
drop table if exists public.sprints;
drop table if exists public.hitos_pago_asociado;
drop table if exists public.hitos;
drop table if exists public.proyectos;
