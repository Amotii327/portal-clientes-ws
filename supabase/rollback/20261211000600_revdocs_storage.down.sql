-- Rollback del sprint 3 · Storage. Quita las reglas (los buckets quedan cerrados para la API).
-- NO se borran los buckets ni los archivos: borrar datos de clientes es irreversible y exige aprobacion
-- escrita del dueño (CLAUDE.md, seccion 7). Ademas Supabase prohibe borrarlos con SQL; si hace falta,
-- se vacian y se eliminan con la API de Storage.
drop policy if exists revdocs_leer on storage.objects;
drop policy if exists revdocs_subir on storage.objects;
drop policy if exists revdocs_borrar on storage.objects;
drop function if exists private.puede_borrar_objeto(text, text);
