-- Rollback del sprint 4 · RLS, registro, avisos y reglas de Storage.
-- Las politicas y triggers de las tablas caen con las tablas (rollback 000100).
-- El bucket "dinero" NO se borra: Supabase no deja borrar un bucket con archivos por SQL (y no se pierden facturas).
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists dinero_subir on storage.objects';
    execute 'drop policy if exists dinero_leer on storage.objects';
  end if;
end $$;
drop function if exists private.puede_subir_archivo_dinero(text);
drop function if exists private.puede_leer_archivo_dinero(text);
drop function if exists private.trg_avisos_comprobantes() cascade;
drop function if exists private.trg_registro_dinero() cascade;
