-- Rollback del sprint 2 · logica.
drop trigger if exists proyectos_avance on public.proyectos;
drop trigger if exists sprints_derivados on public.sprints;
drop trigger if exists hitos_tocar_proyecto on public.hitos;
drop function if exists private.bloquear_escritura_ver_como();
drop function if exists private.ver_como_activa_de(uuid);
drop function if exists private.avisos_plan(uuid);
drop function if exists private.trg_hitos_tocar_proyecto();
drop function if exists private.trg_sprints_derivados();
drop function if exists private.recalcular_hito_sprints(uuid);
drop function if exists private.tocar_proyecto(uuid);
drop function if exists private.trg_proyecto_avance();
drop function if exists private.calcular_avance(uuid, boolean);
drop function if exists private.hoy();
