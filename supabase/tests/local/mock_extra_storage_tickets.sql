-- SOLO PARA PRUEBAS LOCALES. NO se despliega. Imita lo minimo del esquema `storage` de Supabase
-- para comprobar las reglas del bucket portal-tickets (las migraciones solo crean las reglas si existe).
-- Si otro modulo agrega un mock del mismo esquema, unificar en un solo archivo.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now(),
  unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
-- Como en Supabase: permisos amplios a nivel de tabla; manda la RLS.
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
