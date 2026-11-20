-- Rollback del sprint 2 · RLS y "ver como". Vuelve a las definiciones del sprint 1.
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('drop trigger if exists ver_como_solo_lectura on public.%I', r.relname);
  end loop;
end $$;

-- Politicas de las tablas nuevas (las tablas las borra el rollback de la migracion 000100).
drop policy if exists proyectos_leer on public.proyectos;
drop policy if exists hitos_leer on public.hitos;
drop policy if exists hitos_pago_leer on public.hitos_pago_asociado;
drop policy if exists sprints_leer on public.sprints;
drop policy if exists cambios_plan_leer on public.cambios_plan;
drop policy if exists retrasos_leer on public.retrasos;
drop policy if exists historial_proyecto_leer on public.historial_proyecto;
drop policy if exists ver_como_leer on public.sesiones_ver_como;

-- Politicas del sprint 1 (como estaban en 000400).
drop policy facturacion_leer on public.datos_facturacion;
create policy facturacion_leer on public.datos_facturacion for select to authenticated
  using ((select private.es_super_admin())
         or private.es_admin_cliente(empresa_id)
         or private.tiene_permiso(empresa_id, 'ver_dinero'));
drop policy facturacion_editar on public.datos_facturacion;
create policy facturacion_editar on public.datos_facturacion for update to authenticated
  using ((select private.es_super_admin()) or private.es_admin_cliente(empresa_id))
  with check ((select private.es_super_admin()) or private.es_admin_cliente(empresa_id));
drop policy miembros_leer on public.miembros;
create policy miembros_leer on public.miembros for select to authenticated
  using ((select private.es_super_admin())
         or (user_id = (select auth.uid()) and empresa_id = (select private.mi_empresa_id()))
         or private.es_admin_cliente(empresa_id));
drop policy miembros_editar_permisos on public.miembros;
create policy miembros_editar_permisos on public.miembros for update to authenticated
  using ((select private.es_super_admin())
         or (private.es_admin_cliente(empresa_id) and rol = 'equipo' and quitado_en is null))
  with check ((select private.es_super_admin())
         or (private.es_admin_cliente(empresa_id) and rol = 'equipo' and quitado_en is null));
drop policy invitaciones_leer on public.invitaciones;
create policy invitaciones_leer on public.invitaciones for select to authenticated
  using ((select private.es_super_admin()) or private.es_admin_cliente(empresa_id));

-- Funciones del sprint 1 (como estaban en 000300).
create or replace function private.es_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.nivel_sesion() = 'aal2'
     and exists (select 1
                   from public.super_admins s
                   join public.perfiles p on p.user_id = s.user_id
                  where s.user_id = auth.uid() and not p.bloqueado)
$$;
create or replace function private.miembro_activo() returns public.miembros
language sql stable security definer set search_path = '' as $$
  select m.*
    from public.miembros m
    join public.perfiles p on p.user_id = m.user_id
    join public.empresas e on e.id = m.empresa_id
   where m.user_id = auth.uid()
     and m.quitado_en is null
     and not m.bloqueado
     and not p.bloqueado
     and e.estado = 'activa'
     and (m.rol <> 'admin_cliente'
          or not private.exigir_2fa_admin_cliente()
          or private.nivel_sesion() = 'aal2')
$$;
create or replace function private.es_admin_cliente(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((private.miembro_activo()).rol = 'admin_cliente'
                  and (private.miembro_activo()).empresa_id = p_empresa, false)
$$;
create or replace function private.tiene_permiso(p_empresa uuid, p_permiso text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (private.miembro_activo()).empresa_id = p_empresa
    and case p_permiso
          when 'aprobar'           then (private.miembro_activo()).aprobar
          when 'ver_dinero'        then (private.miembro_activo()).ver_dinero
          when 'ver_todos_tickets' then (private.miembro_activo()).ver_todos_tickets
          when 'subir_archivos'    then (private.miembro_activo()).subir_archivos
          else false
        end, false)
$$;
drop function if exists private.mi_ver_dinero();
drop function if exists private.soy_admin_cliente();
drop function if exists private.es_super_admin_real();
