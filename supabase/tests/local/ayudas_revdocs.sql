-- Ayudas para las pruebas del sprint 3 (se incluye despues de fixtures.sql y ayudas_proyectos.sql).
-- Funciones SIN security definer: corren con el rol que tenga la prueba en ese momento (tests.como(...)).

create function tests.rev(p_titulo text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.revisiones where titulo = p_titulo
$$;
create function tests.doc(p_titulo text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.documentos where titulo = p_titulo
$$;
create function tests.version_doc(p_titulo text, p_version int) returns uuid language sql security definer set search_path = '' as $$
  select dv.id from public.documento_versiones dv join public.documentos d on d.id = dv.documento_id
   where d.titulo = p_titulo and dv.version = p_version
$$;
create function tests.archivo(p_nombre text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.archivos_cliente where nombre_original = p_nombre
$$;
create function tests.ruta_archivo(p_nombre text) returns text language sql security definer set search_path = '' as $$
  select storage_path from public.archivos_cliente where nombre_original = p_nombre
$$;
create function tests.ruta_doc(p_titulo text, p_version int) returns text language sql security definer set search_path = '' as $$
  select dv.storage_path from public.documento_versiones dv join public.documentos d on d.id = dv.documento_id
   where d.titulo = p_titulo and dv.version = p_version
$$;
grant execute on function tests.rev(text), tests.doc(text), tests.version_doc(text, int), tests.archivo(text),
  tests.ruta_archivo(text), tests.ruta_doc(text, int) to public;

-- Reserva, sube el objeto a Storage (con la politica del usuario actual) y devuelve la reserva.
create function tests.subir(p_destino text, p_empresa uuid, p_nombre text, p_mime text, p_tam bigint) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  r := public.reservar_subida(p_destino, p_empresa, p_nombre, p_mime, p_tam);
  insert into storage.objects (bucket_id, name, metadata)
  values (r ->> 'bucket', r ->> 'ruta', jsonb_build_object('size', p_tam, 'mimetype', p_mime));
  return r;
end $$;

-- Idem, y devuelve solo el id de la reserva (para pasarlo a crear_documento, etc.).
create function tests.reserva(p_destino text, p_empresa uuid, p_nombre text, p_mime text, p_tam bigint default 1000) returns uuid
language sql as $$
  select (tests.subir(p_destino, p_empresa, p_nombre, p_mime, p_tam) ->> 'reserva_id')::uuid
$$;

-- Hace el viaje completo de un archivo del cliente (como el usuario actual) y devuelve el id.
create function tests.archivo_cliente(p_empresa uuid, p_nombre text, p_mime text default 'application/pdf') returns uuid
language sql as $$
  select (public.confirmar_archivo_cliente(tests.reserva('archivo_cliente', p_empresa, p_nombre, p_mime)) ->> 'archivo_id')::uuid
$$;

-- Crea un documento como super admin (sesion con 2FA) y devuelve su id.
create function tests.crear_doc(p_empresa uuid, p_proyecto uuid, p_titulo text, p_visibilidad text default 'todo_el_equipo',
                                p_miembros uuid[] default '{}', p_categoria text default 'manual') returns uuid
language sql as $$
  select (public.crear_documento(p_empresa, p_proyecto, p_categoria, p_titulo, null, p_visibilidad, p_miembros,
            tests.reserva('documento', p_empresa, p_titulo || '.pdf', 'application/pdf')) ->> 'documento_id')::uuid
$$;

-- Prepara Portal A (plan de 2 sprints aprobado) y Portal B.
create function tests.preparar_revdocs() returns void language plpgsql as $$
begin
  perform tests.crear_proyectos();
  perform tests.como(tests.id('sa'), 'aal2');
  perform public.cargar_plan_sprints(tests.proy('Portal A'),
    '[{"nombre": "Sprint A1", "fecha_inicio": "2026-11-30", "fecha_fin": "2026-12-04"}, {"nombre": "Sprint A2", "fecha_inicio": "2026-12-07", "fecha_fin": "2026-12-11"}]'::jsonb);
  perform public.aprobar_plan_sprints(tests.proy('Portal A'));
  perform tests.admin();
end $$;

-- Simula la cabecera que pone el proxy (IP y navegador) para la peticion actual.
create function tests.desde(p_ip text, p_agente text default 'PruebaNavegador/1.0') returns void language plpgsql as $$
begin
  perform set_config('request.headers', jsonb_build_object('x-forwarded-for', p_ip, 'user-agent', p_agente)::text, true);
end $$;
