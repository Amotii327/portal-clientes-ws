-- Sprint 2 · RLS de las tablas nuevas, modo "ver como" (decision D-020) y cierre de M-8
-- (rendimiento de las reglas: el miembro activo se lee UNA vez por llamada y las politicas usan
-- subconsultas sin correlacion, que Postgres evalua una sola vez por consulta).
-- Fuente de verdad: docs/matriz-permisos.md. Equipo Websourcing · Desarrollo

-- ---------- Super admin real vs. super admin "actuando" ----------
-- es_super_admin_real: la persona es super admin con 2FA (solo para iniciar/terminar "ver como").
create function private.es_super_admin_real() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.nivel_sesion() = 'aal2'
     and exists (select 1
                   from public.super_admins s
                   join public.perfiles p on p.user_id = s.user_id
                  where s.user_id = auth.uid() and not p.bloqueado)
$$;

-- es_super_admin: lo de siempre, PERO mientras hay una sesion "ver como" vigente deja de serlo.
-- Asi el super admin ve exactamente lo que ve el cliente y no puede escribir nada.
create or replace function private.es_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.es_super_admin_real() and not private.ver_como_activa_de(auth.uid())
$$;

-- Miembro activo: el real, o (solo para el super admin real con sesion "ver como" vigente y empresa activa)
-- un miembro simulado con el rol y permisos elegidos. Devuelve null en cualquier otro caso.
create or replace function private.miembro_activo() returns public.miembros
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.miembros;
  v public.sesiones_ver_como;
begin
  select m.* into r
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
          or private.nivel_sesion() = 'aal2');
  if found then return r; end if;

  if private.es_super_admin_real() then
    select s.* into v from public.sesiones_ver_como s
     where s.user_id = auth.uid() and s.terminada_en is null and s.vence_en > now();
    if found and exists (select 1 from public.empresas e where e.id = v.empresa_id and e.estado = 'activa') then
      r := null;
      r.id := v.id; r.empresa_id := v.empresa_id; r.user_id := v.user_id; r.rol := v.rol;
      r.aprobar := v.aprobar; r.ver_dinero := v.ver_dinero;
      r.ver_todos_tickets := v.ver_todos_tickets; r.subir_archivos := v.subir_archivos;
      r.bloqueado := false; r.creado_en := v.iniciada_en; r.actualizado_en := v.iniciada_en;
      return r;
    end if;
  end if;
  return null;
end $$;

-- M-8: una sola lectura del miembro por llamada (antes eran dos).
create or replace function private.es_admin_cliente(p_empresa uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m public.miembros := private.miembro_activo();
begin
  return coalesce(m.rol = 'admin_cliente' and m.empresa_id = p_empresa, false);
end $$;

create or replace function private.tiene_permiso(p_empresa uuid, p_permiso text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m public.miembros := private.miembro_activo();
begin
  return coalesce(m.empresa_id = p_empresa and case p_permiso
          when 'aprobar'           then m.aprobar
          when 'ver_dinero'        then m.ver_dinero
          when 'ver_todos_tickets' then m.ver_todos_tickets
          when 'subir_archivos'    then m.subir_archivos
          else false end, false);
end $$;

-- Versiones SIN argumentos (sobre MI empresa) para usarlas como (select ...) en las politicas:
-- se evaluan una vez por consulta, no una vez por fila.
create function private.soy_admin_cliente() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m public.miembros := private.miembro_activo();
begin
  return coalesce(m.rol = 'admin_cliente', false);
end $$;

create function private.mi_ver_dinero() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m public.miembros := private.miembro_activo();
begin
  return coalesce(m.ver_dinero, false);
end $$;

revoke all on function private.es_super_admin_real(), private.soy_admin_cliente(), private.mi_ver_dinero()
  from public, anon, authenticated, service_role;
grant execute on function private.soy_admin_cliente(), private.mi_ver_dinero() to authenticated;
grant execute on function private.es_super_admin_real() to authenticated;

-- ---------- M-8: politicas del sprint 1 con subconsultas sin correlacion ----------
drop policy facturacion_leer on public.datos_facturacion;
create policy facturacion_leer on public.datos_facturacion for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.mi_ver_dinero())));
drop policy facturacion_editar on public.datos_facturacion;
create policy facturacion_editar on public.datos_facturacion for update to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.soy_admin_cliente())))
  with check ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.soy_admin_cliente())));

drop policy miembros_leer on public.miembros;
create policy miembros_leer on public.miembros for select to authenticated
  using ((select private.es_super_admin())
         or (user_id = (select auth.uid()) and empresa_id = (select private.mi_empresa_id()))
         or (empresa_id = (select private.mi_empresa_id()) and (select private.soy_admin_cliente())));
drop policy miembros_editar_permisos on public.miembros;
create policy miembros_editar_permisos on public.miembros for update to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.soy_admin_cliente())
             and rol = 'equipo' and quitado_en is null))
  with check ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.soy_admin_cliente())
             and rol = 'equipo' and quitado_en is null));

drop policy invitaciones_leer on public.invitaciones;
create policy invitaciones_leer on public.invitaciones for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.soy_admin_cliente())));

-- ---------- RLS de las tablas del sprint 2 ----------
alter table public.proyectos            enable row level security;
alter table public.hitos                enable row level security;
alter table public.hitos_pago_asociado  enable row level security;
alter table public.sprints              enable row level security;
alter table public.retrasos             enable row level security;
alter table public.cambios_plan         enable row level security;
alter table public.historial_proyecto   enable row level security;
alter table public.sesiones_ver_como    enable row level security;

-- Solo lectura desde la API. TODA escritura pasa por las funciones RPC (migracion 000500).
grant select on public.proyectos, public.hitos, public.hitos_pago_asociado, public.sprints,
  public.retrasos, public.cambios_plan, public.historial_proyecto, public.sesiones_ver_como to authenticated;

-- proyectos: el super admin ve todos; el cliente, los de su empresa.
create policy proyectos_leer on public.proyectos for select to authenticated
  using ((select private.es_super_admin()) or empresa_id = (select private.mi_empresa_id()));

-- hitos: el cliente no ve los ocultos (hito 13 sin mantenimiento).
create policy hitos_leer on public.hitos for select to authenticated
  using ((select private.es_super_admin()) or (empresa_id = (select private.mi_empresa_id()) and visible));

-- pago asociado del hito: exige ver dinero (o ser admin) y que el hito sea visible.
create policy hitos_pago_leer on public.hitos_pago_asociado for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.mi_ver_dinero())
             and hito_id in (select h.id from public.hitos h)));

-- sprints y cambios del plan: el cliente solo los ve cuando el plan esta aprobado (nunca borradores).
create policy sprints_leer on public.sprints for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id())
             and proyecto_id in (select p.id from public.proyectos p where p.plan_estado = 'aprobado')));
create policy cambios_plan_leer on public.cambios_plan for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id())
             and proyecto_id in (select p.id from public.proyectos p where p.plan_estado = 'aprobado')));

-- retrasos: los de hitos que el cliente puede ver.
create policy retrasos_leer on public.retrasos for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and hito_id in (select h.id from public.hitos h)));

-- historial del proyecto: el cliente solo las filas marcadas como visibles (sin IP ni acciones internas).
create policy historial_proyecto_leer on public.historial_proyecto for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and visible_cliente));

-- sesiones "ver como": solo el super admin real las lee (nunca el cliente). Se escriben por RPC.
create policy ver_como_leer on public.sesiones_ver_como for select to authenticated
  using ((select private.es_super_admin_real()));

-- ---------- Cerradura de solo lectura del modo "ver como" en TODAS las tablas ----------
-- Excepciones: la propia tabla de sesiones (iniciar/terminar), el registro (lo escriben los triggers)
-- e intentos_acceso (solo la usa el gancho de Auth).
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p')
              and c.relname not in ('sesiones_ver_como', 'registro_actividad', 'intentos_acceso') loop
    execute format('create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.%I
                    for each statement execute function private.bloquear_escritura_ver_como()', r.relname);
  end loop;
end $$;
