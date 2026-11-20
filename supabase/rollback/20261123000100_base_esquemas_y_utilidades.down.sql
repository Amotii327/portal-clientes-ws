drop function if exists private.solo_agregar();
drop function if exists private.campos_inmutables();
drop function if exists private.empresa_id_inmutable();
drop function if exists private.poner_actualizado_en();
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
revoke usage on schema private from authenticated, supabase_auth_admin;
drop schema if exists private;
