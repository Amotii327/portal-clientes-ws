-- Sprint 1 · Base: esquema privado, privilegios por defecto y triggers genericos.
-- Equipo Websourcing · Desarrollo

create extension if not exists pgcrypto with schema extensions;

-- Esquema NO expuesto por la API (ver supabase/config.toml: [api] schemas = ["public"]).
-- Aqui viven las funciones auxiliares de las reglas (SECURITY DEFINER, search_path fijo).
create schema if not exists private;
revoke all on schema private from public;
-- Las politicas RLS se evaluan con el rol del usuario; necesita poder resolver las funciones.
grant usage on schema private to authenticated;
grant usage on schema private to supabase_auth_admin;

-- Cerradura por defecto: las tablas, funciones y secuencias nuevas NO son accesibles
-- para anon, authenticated ni service_role. Cada migracion concede solo lo necesario.
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;

-- Pone la fecha de ultima modificacion.
create function private.poner_actualizado_en() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- empresa_id nunca cambia despues de creada la fila (nadie "muda" un dato a otra empresa).
create function private.empresa_id_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'empresa_id_inmutable' using errcode = '23514';
  end if;
  return new;
end $$;

-- Otras columnas que no deben cambiar nunca. Los nombres llegan como argumentos del trigger.
create function private.campos_inmutables() returns trigger
language plpgsql set search_path = '' as $$
declare
  c text;
begin
  foreach c in array tg_argv loop
    if to_jsonb(new) -> c is distinct from to_jsonb(old) -> c then
      raise exception 'campo_inmutable: %', c using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

-- Tablas "solo se agrega": ni cambios ni borrados, para ningun rol (ni el dueno de la tabla).
create function private.solo_agregar() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'tabla_solo_agregar: %', tg_table_name using errcode = '42501';
end $$;

-- Las funciones de trigger no las llama nadie directamente.
revoke all on function private.poner_actualizado_en(), private.empresa_id_inmutable(),
  private.campos_inmutables(), private.solo_agregar() from public, anon, authenticated, service_role;
