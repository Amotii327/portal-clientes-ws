-- Sprint 3 · Storage: buckets PRIVADOS y reglas por empresa sobre storage.objects.
-- Equipo Websourcing · Desarrollo
--
-- Tres buckets, ninguno publico, con tope de tamano y tipos permitidos (Storage los exige al subir):
--   documentos          lo que publica Websourcing (50 MB)
--   archivos-empresa    lo que sube el cliente (50 MB)
--   capturas-revisiones capturas de "pido cambios" (10 MB, solo imagenes)
-- Rutas: <empresa_id>/<carpeta>/<uuid>.<ext>. Las genera el SERVIDOR (public.reservar_subida), nunca la persona.
--
-- Reglas (siguen la arquitectura, seccion 4: la regla de Storage mira la TABLA DUENA del archivo, no solo la carpeta):
--   LEER   -> solo si la persona ya puede ver la fila que apunta a ese objeto (las politicas RLS de la tabla se
--             aplican a la subconsulta, porque corre con el rol de la persona). Mismo criterio para el super admin.
--   SUBIR  -> solo con una reserva vigente a su nombre, en la empresa de la ruta y con el permiso del destino.
--   BORRAR -> solo el cliente que subio un archivo que ya borro en el portal (estado "nuevo"). Nadie borra
--             documentos ni capturas; no hay politica de UPDATE (no se pisa un archivo).
-- El enlace firmado (10 minutos) lo genera la aplicacion con la sesion de la persona, despues de leer la fila.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documentos', 'documentos', false, 52428800, private.tipos_permitidos()),
  ('archivos-empresa', 'archivos-empresa', false, 52428800, private.tipos_permitidos()),
  ('capturas-revisiones', 'capturas-revisiones', false, 10485760, private.tipos_de_captura())
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Borrado de un objeto de "archivos-empresa": el que subio el archivo, si ya lo borro en el portal y
-- Websourcing no lo habia marcado "recibido". Lee la fila sin RLS porque el borrado suave la oculta al cliente.
create function private.puede_borrar_objeto(p_bucket text, p_ruta text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_bucket = 'archivos-empresa' and auth.uid() is not null and exists (
    select 1 from public.archivos_cliente a
     where a.storage_path = p_ruta and a.subido_por = auth.uid() and a.borrado_en is not null and a.estado = 'nuevo')
$$;
revoke all on function private.puede_borrar_objeto(text, text) from public, anon, authenticated, service_role;
grant execute on function private.puede_borrar_objeto(text, text) to authenticated;

create policy revdocs_leer on storage.objects for select to authenticated
  using (
    (bucket_id = 'documentos'
       and exists (select 1 from public.documento_versiones dv where dv.storage_path = objects.name))
    or (bucket_id = 'archivos-empresa'
       and exists (select 1 from public.archivos_cliente a where a.storage_path = objects.name))
    -- Quien borro su archivo en el portal lo sigue viendo en Storage hasta quitarlo (borrar exige poder leer la fila).
    or private.puede_borrar_objeto(bucket_id, name)
    or (bucket_id = 'capturas-revisiones'
       and exists (select 1 from public.aprobaciones ap where ap.captura_path = objects.name))
    -- Quien subio el objeto lo puede ver mientras la reserva siga abierta (Storage lee la fila al insertar).
    -- Al confirmar, la reserva se cierra y desde entonces vale solo la regla de la tabla dueña.
    or (bucket_id in ('documentos', 'archivos-empresa', 'capturas-revisiones')
       and exists (select 1 from public.subidas_reservadas r
                    where r.ruta = objects.name and r.bucket_id = objects.bucket_id and r.user_id = (select auth.uid())
                      and r.usada_en is null and r.vence_en > now()))
  );

create policy revdocs_subir on storage.objects for insert to authenticated
  with check (
    bucket_id in ('documentos', 'archivos-empresa', 'capturas-revisiones')
    and exists (
      select 1 from public.subidas_reservadas r
       where r.ruta = objects.name and r.bucket_id = objects.bucket_id
         and r.user_id = (select auth.uid())
         and r.usada_en is null and r.vence_en > now()
         and r.empresa_id = private.empresa_de_ruta(objects.name)
         and private.puede_subir_destino(r.destino, r.empresa_id))
  );

create policy revdocs_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'archivos-empresa' and private.puede_borrar_objeto(bucket_id, name));
