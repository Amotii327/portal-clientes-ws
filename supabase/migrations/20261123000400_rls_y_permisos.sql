-- Sprint 1 · RLS en TODAS las tablas, permisos minimos por columna y politicas con WITH CHECK.
-- La fuente de verdad es docs/matriz-permisos.md. Equipo Websourcing · Desarrollo.
--
-- Regla general:
--   * anon no tiene ningun permiso. service_role tampoco (se concede tabla por tabla cuando
--     un modulo lo necesite, hoy ninguno).
--   * authenticated solo recibe los permisos de columna que la matriz permite; el resto de las
--     escrituras pasan por las funciones RPC (migracion 000600), que validan quien llama.
--   * Nadie borra filas desde la API.

alter table public.perfiles              enable row level security;
alter table public.super_admins          enable row level security;
alter table public.empresas              enable row level security;
alter table public.datos_facturacion     enable row level security;
alter table public.miembros              enable row level security;
alter table public.invitaciones          enable row level security;
alter table public.aceptaciones_politica enable row level security;
alter table public.registro_actividad    enable row level security;
alter table public.configuracion         enable row level security;
alter table public.preferencias_usuario  enable row level security;

revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;

-- super_admins: RLS activa y SIN politicas ni permisos: invisible desde la API.

-- ---- Permisos por columna (authenticated) ----
grant select on public.empresas, public.datos_facturacion, public.perfiles, public.miembros,
  public.aceptaciones_politica, public.registro_actividad, public.configuracion,
  public.preferencias_usuario to authenticated;
-- invitaciones: todo menos token_hash (el hash no sale nunca por la API).
grant select (id, empresa_id, correo, rol, aprobar, ver_dinero, ver_todos_tickets, subir_archivos,
              creada_en, vence_en, usada_en, usada_por, miembro_id, revocada_en, invitada_por)
  on public.invitaciones to authenticated;

grant update (nombre, logo_path)                                     on public.empresas to authenticated;
grant update (razon_social, nit, correo_facturas)                    on public.datos_facturacion to authenticated;
grant update (nombre, celular)                                       on public.perfiles to authenticated;
grant update (aprobar, ver_dinero, ver_todos_tickets, subir_archivos) on public.miembros to authenticated;
grant insert (clave, valor), update (valor)                          on public.configuracion to authenticated;
grant insert (user_id, tema), update (tema)                          on public.preferencias_usuario to authenticated;

-- ---- empresas: la edita solo el super admin; estado solo por pausar/reactivar ----
create policy empresas_leer on public.empresas for select to authenticated
  using ((select private.es_super_admin()) or id = (select private.mi_empresa_id()));
create policy empresas_editar on public.empresas for update to authenticated
  using ((select private.es_super_admin()))
  with check ((select private.es_super_admin()));

-- ---- datos_facturacion: leen admin y quien tenga ver_dinero; edita admin del cliente y super admin ----
create policy facturacion_leer on public.datos_facturacion for select to authenticated
  using ((select private.es_super_admin())
         or private.es_admin_cliente(empresa_id)
         or private.tiene_permiso(empresa_id, 'ver_dinero'));
create policy facturacion_editar on public.datos_facturacion for update to authenticated
  using ((select private.es_super_admin()) or private.es_admin_cliente(empresa_id))
  with check ((select private.es_super_admin()) or private.es_admin_cliente(empresa_id));

-- ---- perfiles ----
create policy perfiles_leer on public.perfiles for select to authenticated
  using ((select private.es_super_admin())
         or (user_id = (select auth.uid()) and (select private.tiene_acceso()))
         or private.es_admin_de_usuario(user_id));
create policy perfiles_editar_propio on public.perfiles for update to authenticated
  using (user_id = (select auth.uid()) and (select private.tiene_acceso()))
  with check (user_id = (select auth.uid()) and (select private.tiene_acceso()));

-- ---- miembros: el admin cambia permisos de su equipo; rol, empresa y usuario son fijos (trigger) ----
create policy miembros_leer on public.miembros for select to authenticated
  using ((select private.es_super_admin())
         or (user_id = (select auth.uid()) and empresa_id = (select private.mi_empresa_id()))
         or private.es_admin_cliente(empresa_id));
create policy miembros_editar_permisos on public.miembros for update to authenticated
  using ((select private.es_super_admin())
         or (private.es_admin_cliente(empresa_id) and rol = 'equipo' and quitado_en is null))
  with check ((select private.es_super_admin())
         or (private.es_admin_cliente(empresa_id) and rol = 'equipo' and quitado_en is null));

-- ---- invitaciones: solo lectura (crear/revocar/aceptar = RPC) ----
create policy invitaciones_leer on public.invitaciones for select to authenticated
  using ((select private.es_super_admin()) or private.es_admin_cliente(empresa_id));

-- ---- aceptaciones_politica: solo lectura propia o del super admin (se escribe por RPC) ----
create policy aceptaciones_leer on public.aceptaciones_politica for select to authenticated
  using ((select private.es_super_admin())
         or (user_id = (select auth.uid()) and (select private.tiene_acceso())));

-- ---- registro_actividad: solo el super admin lee; nadie escribe desde la API ----
create policy registro_leer on public.registro_actividad for select to authenticated
  using ((select private.es_super_admin()));

-- ---- configuracion: lee quien tiene acceso; escribe solo el super admin ----
create policy configuracion_leer on public.configuracion for select to authenticated
  using ((select private.tiene_acceso()));
create policy configuracion_crear on public.configuracion for insert to authenticated
  with check ((select private.es_super_admin()));
create policy configuracion_editar on public.configuracion for update to authenticated
  using ((select private.es_super_admin()))
  with check ((select private.es_super_admin()));

-- ---- preferencias_usuario: cada quien la suya ----
create policy preferencias_leer on public.preferencias_usuario for select to authenticated
  using (user_id = (select auth.uid()) and (select private.tiene_acceso()));
create policy preferencias_crear on public.preferencias_usuario for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.tiene_acceso()));
create policy preferencias_editar on public.preferencias_usuario for update to authenticated
  using (user_id = (select auth.uid()) and (select private.tiene_acceso()))
  with check (user_id = (select auth.uid()) and (select private.tiene_acceso()));
