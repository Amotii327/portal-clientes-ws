-- Rollback del sprint 2 · consumo del equipo.
drop function if exists public.consumo_equipo(uuid);
drop function if exists public.anotar_consumo_sprint(uuid, numeric, numeric);
drop function if exists public.fijar_consumo_proyecto(uuid, numeric, numeric);
drop table if exists public.consumo_equipo_sprint;
drop table if exists public.consumo_equipo_proyecto;
drop function if exists private.revisar_aviso_consumo(uuid);
drop function if exists private.trg_registro_consumo();
