drop function if exists public.mi_mantenimiento_activo();
drop function if exists public.autorizar_horas_extra(uuid);
drop function if exists public.decidir_horas_extra(uuid, boolean);
drop function if exists public.revisar_horas(uuid, boolean, text);
drop function if exists public.anotar_horas_ticket(uuid, numeric, text, date);
drop function if exists public.configurar_mantenimiento(uuid, jsonb, text, text);
drop function if exists public.apagar_mantenimiento(uuid, text);
drop function if exists public.activar_mantenimiento(uuid, text, jsonb, text);
drop function if exists private.proximo_mes();
