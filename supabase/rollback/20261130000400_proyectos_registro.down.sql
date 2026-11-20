-- Rollback del sprint 2 · registro e historial.
drop index if exists public.registro_actividad_proyecto_idx;
drop index if exists public.registro_actividad_rechazos_idx;
drop trigger if exists proyectos_registro on public.proyectos;
drop trigger if exists hitos_registro on public.hitos;
drop trigger if exists sprints_registro on public.sprints;
drop trigger if exists retrasos_registro on public.retrasos;
drop trigger if exists cambios_plan_registro on public.cambios_plan;
drop trigger if exists hitos_pago_registro on public.hitos_pago_asociado;
drop trigger if exists sesiones_ver_como_registro on public.sesiones_ver_como;
drop function if exists private.trg_registro_proyectos();
drop function if exists private.campos_cambiados(jsonb, jsonb);
drop function if exists private.escribir_historial(uuid, uuid, text, jsonb, boolean);
