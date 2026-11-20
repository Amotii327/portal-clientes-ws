-- Sprint 3 · RLS de revisiones y documentos, permisos minimos por columna y cerradura "ver como".
-- Fuente de verdad: docs/matriz-permisos-revisiones-docs.md. Equipo Websourcing · Desarrollo
-- Todo es de solo lectura desde la API: TODA escritura pasa por las funciones RPC (migracion 000500).

alter table public.revisiones         enable row level security;
alter table public.revision_versiones enable row level security;
alter table public.aprobaciones       enable row level security;
alter table public.documentos         enable row level security;
alter table public.documento_versiones enable row level security;
alter table public.documento_permisos enable row level security;
alter table public.archivos_cliente   enable row level security;
alter table public.subidas_reservadas enable row level security;

grant select on public.revisiones, public.revision_versiones, public.documentos, public.documento_versiones,
  public.documento_permisos, public.archivos_cliente, public.subidas_reservadas to authenticated;
-- aprobaciones: todo menos la evidencia (user_id, ip, user_agent); esa la lee el super admin en el registro.
grant select (id, empresa_id, revision_id, version, decision, comentario, captura_path, miembro_id, persona, creado_en)
  on public.aprobaciones to authenticated;

-- ---------- revisiones ----------
-- Los borradores no los ve el cliente. Todos los miembros activos ven las publicadas (el equipo, por defecto,
-- ve "avance y revisiones"); responder exige el permiso "aprobar" (funcion responder_revision).
create policy revisiones_leer on public.revisiones for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and estado <> 'borrador'));

-- Versiones: el cliente solo las publicadas, de revisiones que puede ver.
create policy revision_versiones_leer on public.revision_versiones for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and publicada_en is not null
             and revision_id in (select r.id from public.revisiones r)));

create policy aprobaciones_leer on public.aprobaciones for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id())
             and revision_id in (select r.id from public.revisiones r)));

-- ---------- documentos ----------
-- Super admin: todos. Cliente: los de su empresa que Websourcing le dejo ver:
--   todo_el_equipo -> cualquier miembro activo; solo_admin -> el admin; personas -> el admin y los elegidos.
create policy documentos_leer on public.documentos for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id())
             and (visibilidad = 'todo_el_equipo'
                  or (select private.soy_admin_cliente())
                  or (visibilidad = 'personas'
                      and exists (select 1 from public.documento_permisos dp
                                   where dp.documento_id = documentos.id and dp.revocado_en is null
                                     and dp.miembro_id = (select private.mi_miembro_id()))))));

-- Versiones: solo de los documentos que ya puedo ver (la regla de arriba se aplica a la subconsulta).
create policy documento_versiones_leer on public.documento_versiones for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id())
             and documento_id in (select d.id from public.documentos d)));

-- Quien tiene el documento compartido: el super admin, el admin del cliente y cada persona su propia fila.
create policy documento_permisos_leer on public.documento_permisos for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id())
             and ((select private.soy_admin_cliente()) or miembro_id = (select private.mi_miembro_id()))));

-- ---------- archivos_cliente: los ve su empresa y Websourcing; los borrados ya no salen al cliente ----------
create policy archivos_cliente_leer on public.archivos_cliente for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and borrado_en is null));

-- ---------- subidas_reservadas: cada quien las suyas ----------
create policy subidas_reservadas_leer on public.subidas_reservadas for select to authenticated
  using (user_id = (select auth.uid()) and (select private.tiene_acceso()));

-- ---------- Cerradura de solo lectura del modo "ver como" (la exige la prueba 01_estructura) ----------
create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.revisiones
  for each statement execute function private.bloquear_escritura_ver_como();
create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.revision_versiones
  for each statement execute function private.bloquear_escritura_ver_como();
create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.aprobaciones
  for each statement execute function private.bloquear_escritura_ver_como();
create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.documentos
  for each statement execute function private.bloquear_escritura_ver_como();
create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.documento_versiones
  for each statement execute function private.bloquear_escritura_ver_como();
create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.documento_permisos
  for each statement execute function private.bloquear_escritura_ver_como();
create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.archivos_cliente
  for each statement execute function private.bloquear_escritura_ver_como();
create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.subidas_reservadas
  for each statement execute function private.bloquear_escritura_ver_como();
