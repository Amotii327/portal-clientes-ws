drop function if exists public.generar_recordatorios_revisiones();
drop trigger if exists revisiones_avisos on public.revisiones;
drop function if exists private.trg_avisos_revisiones();
delete from public.avisos_salientes where modulo = 'revisiones';
