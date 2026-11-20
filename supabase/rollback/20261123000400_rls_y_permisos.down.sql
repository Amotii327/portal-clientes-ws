-- Quita politicas y permisos (las tablas las borra el rollback de la migracion 000200).
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;
revoke all on all tables in schema public from authenticated;
alter table public.perfiles disable row level security;
alter table public.super_admins disable row level security;
alter table public.empresas disable row level security;
alter table public.datos_facturacion disable row level security;
alter table public.miembros disable row level security;
alter table public.invitaciones disable row level security;
alter table public.aceptaciones_politica disable row level security;
alter table public.registro_actividad disable row level security;
alter table public.configuracion disable row level security;
alter table public.preferencias_usuario disable row level security;
