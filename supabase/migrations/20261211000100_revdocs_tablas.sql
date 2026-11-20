-- Sprint 3 · Tablas de revisiones y documentos: revisiones, revision_versiones, aprobaciones,
-- documentos, documento_versiones, documento_permisos, archivos_cliente y subidas_reservadas.
-- Las reglas (RLS) van en la migracion 000300; la logica en la 000200; Storage en la 000600.
-- Equipo Websourcing · Desarrollo
--
-- Convenciones: llaves compuestas (x_id, empresa_id) -> padre (id, empresa_id), asi una fila de la
-- empresa A nunca apunta a algo de la B; empresa_id inmutable; escrituras solo por funciones RPC.

-- ============================== REVISIONES ==============================
-- Un "entregable para revisar": el diseno del proyecto, un sprint o un documento.
-- El contenido (link de prueba, video, acta) vive en revision_versiones.
create table public.revisiones (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null,
  proyecto_id    uuid not null,
  tipo           text not null check (tipo in ('diseno', 'sprint', 'documento')),
  sprint_id      uuid,
  documento_id   uuid,
  titulo         text not null check (char_length(btrim(titulo)) between 3 and 160),
  -- borrador: el cliente no la ve. publicada: espera al cliente. aprobada / cambios_pedidos: respuesta.
  -- reabierta: la aprobada que el super admin reabrio (espera una version nueva).
  estado         text not null default 'borrador'
                 check (estado in ('borrador', 'publicada', 'aprobada', 'cambios_pedidos', 'reabierta')),
  version_actual integer not null default 1 check (version_actual >= 1),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint revisiones_proyecto_fk foreign key (proyecto_id, empresa_id) references public.proyectos (id, empresa_id),
  constraint revisiones_sprint_fk foreign key (empresa_id, sprint_id) references public.sprints (empresa_id, id),
  constraint revisiones_tipo_sprint check ((tipo = 'sprint') = (sprint_id is not null)),
  constraint revisiones_tipo_documento check ((tipo = 'documento') = (documento_id is not null)),
  constraint revisiones_id_empresa_unico unique (id, empresa_id)
);
-- Un diseno por proyecto y una revision por sprint: las rondas nuevas son versiones, no filas nuevas.
create unique index revisiones_un_diseno_por_proyecto on public.revisiones (proyecto_id) where tipo = 'diseno';
create unique index revisiones_una_por_sprint on public.revisiones (sprint_id) where tipo = 'sprint';
create index revisiones_proyecto_idx on public.revisiones (empresa_id, proyecto_id);
create index revisiones_estado_idx on public.revisiones (estado, actualizado_en desc);

-- Documentos de Websourcing (se crean mas abajo); la revision tipo "documento" y el acta los referencian.
create table public.documentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  proyecto_id    uuid,
  categoria      text not null check (categoria in ('contrato', 'propuesta', 'requerimientos', 'arquitectura',
                                                     'acta', 'manual', 'entregable', 'otro')),
  titulo         text not null check (char_length(btrim(titulo)) between 2 and 160),
  descripcion    text check (descripcion is null or char_length(descripcion) <= 1000),
  -- La decide Websourcing: todo_el_equipo = todos los miembros activos; solo_admin = solo el admin del cliente;
  -- personas = el admin y los miembros elegidos en documento_permisos.
  visibilidad    text not null default 'todo_el_equipo' check (visibilidad in ('todo_el_equipo', 'solo_admin', 'personas')),
  version_actual integer not null default 0 check (version_actual >= 0),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint documentos_proyecto_fk foreign key (proyecto_id, empresa_id) references public.proyectos (id, empresa_id),
  constraint documentos_id_empresa_unico unique (id, empresa_id)
);
create index documentos_empresa_idx on public.documentos (empresa_id, proyecto_id);

alter table public.revisiones
  add constraint revisiones_documento_fk foreign key (documento_id, empresa_id) references public.documentos (id, empresa_id);

create table public.revision_versiones (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null,
  revision_id      uuid not null,
  version          integer not null check (version >= 1),
  link_prueba      text check (link_prueba is null or (char_length(link_prueba) <= 500 and link_prueba ~ '^https://[^[:space:]]+$')),
  video_url        text check (video_url is null or (char_length(video_url) <= 500 and video_url ~ '^https://[^[:space:]]+$')),
  acta_documento_id uuid,
  resumen          text check (resumen is null or char_length(resumen) <= 2000),
  creada_en        timestamptz not null default now(),
  -- null = borrador de la version (el cliente no la ve). Una version publicada ya no cambia.
  publicada_en     timestamptz,
  constraint revision_versiones_revision_fk foreign key (revision_id, empresa_id) references public.revisiones (id, empresa_id),
  constraint revision_versiones_acta_fk foreign key (acta_documento_id, empresa_id) references public.documentos (id, empresa_id),
  constraint revision_versiones_unica unique (revision_id, version),
  constraint revision_versiones_id_empresa_unico unique (id, empresa_id)
);
create index revision_versiones_idx on public.revision_versiones (empresa_id, revision_id);

-- La respuesta del cliente. Solo se agrega: una por version. La IP y el navegador quedan como evidencia
-- (D-004: quien, cuando y desde donde) y el cliente no los lee (permiso de columna).
create table public.aprobaciones (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null,
  revision_id  uuid not null,
  version      integer not null,
  decision     text not null check (decision in ('apruebo', 'pido_cambios')),
  comentario   text check (comentario is null or char_length(comentario) <= 2000),
  captura_path text check (captura_path is null or char_length(captura_path) <= 300),
  miembro_id   uuid not null,
  persona      text not null,                       -- nombre de quien respondio, tal como estaba ese dia
  user_id      uuid not null references public.perfiles (user_id),
  ip           inet,
  user_agent   text check (user_agent is null or char_length(user_agent) <= 300),
  creado_en    timestamptz not null default now(),
  constraint aprobaciones_revision_fk foreign key (revision_id, empresa_id) references public.revisiones (id, empresa_id),
  constraint aprobaciones_version_fk foreign key (revision_id, version) references public.revision_versiones (revision_id, version),
  constraint aprobaciones_miembro_fk foreign key (empresa_id, miembro_id) references public.miembros (empresa_id, id),
  constraint aprobaciones_una_por_version unique (revision_id, version),
  constraint aprobaciones_cambios_con_texto check (decision <> 'pido_cambios' or char_length(btrim(coalesce(comentario, ''))) >= 5),
  constraint aprobaciones_captura_solo_cambios check (captura_path is null or decision = 'pido_cambios'),
  constraint aprobaciones_id_empresa_unico unique (id, empresa_id)
);
create index aprobaciones_revision_idx on public.aprobaciones (empresa_id, revision_id);

-- ============================== DOCUMENTOS ==============================
-- Cada subida es una version nueva: nunca se reemplaza en silencio. Solo se agrega.
create table public.documento_versiones (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null,
  documento_id    uuid not null,
  version         integer not null check (version >= 1),
  bucket_id       text not null default 'documentos' check (bucket_id = 'documentos'),
  storage_path    text not null unique check (char_length(storage_path) <= 300),
  nombre_original text not null check (char_length(btrim(nombre_original)) between 1 and 200),
  mime_type       text not null check (char_length(mime_type) <= 150),
  tamano_bytes    bigint not null check (tamano_bytes between 1 and 52428800),
  nota            text check (nota is null or char_length(nota) <= 500),
  creado_en       timestamptz not null default now(),
  constraint documento_versiones_documento_fk foreign key (documento_id, empresa_id) references public.documentos (id, empresa_id),
  constraint documento_versiones_unica unique (documento_id, version),
  constraint documento_versiones_ruta_empresa check (starts_with(storage_path, empresa_id::text || '/')),
  constraint documento_versiones_id_empresa_unico unique (id, empresa_id)
);
create index documento_versiones_idx on public.documento_versiones (empresa_id, documento_id);

-- Compartir documento por documento con personas elegidas. Revocar = marcar, no borrar.
create table public.documento_permisos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null,
  documento_id uuid not null,
  miembro_id   uuid not null,
  otorgado_en  timestamptz not null default now(),
  revocado_en  timestamptz,
  constraint documento_permisos_documento_fk foreign key (documento_id, empresa_id) references public.documentos (id, empresa_id),
  constraint documento_permisos_miembro_fk foreign key (empresa_id, miembro_id) references public.miembros (empresa_id, id),
  constraint documento_permisos_unico unique (documento_id, miembro_id)
);
create index documento_permisos_miembro_idx on public.documento_permisos (empresa_id, miembro_id) where revocado_en is null;

-- "Archivos de la empresa": lo que sube el cliente (logo, textos, fotos, bases de datos).
create table public.archivos_cliente (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id),
  proyecto_id     uuid,
  bucket_id       text not null default 'archivos-empresa' check (bucket_id = 'archivos-empresa'),
  storage_path    text not null unique check (char_length(storage_path) <= 300),
  nombre_original text not null check (char_length(btrim(nombre_original)) between 1 and 200),
  mime_type       text not null check (char_length(mime_type) <= 150),
  tamano_bytes    bigint not null check (tamano_bytes between 1 and 52428800),
  nota            text check (nota is null or char_length(nota) <= 500),
  -- nuevo: el cliente aun puede borrarlo. recibido: Websourcing lo marco y queda fijo.
  estado          text not null default 'nuevo' check (estado in ('nuevo', 'recibido')),
  subido_por      uuid not null references public.perfiles (user_id),
  subido_por_nombre text not null,
  creado_en       timestamptz not null default now(),
  recibido_en     timestamptz,
  -- Borrado suave: el rastro se conserva; el servidor quita el objeto de Storage con la sesion del usuario.
  borrado_en      timestamptz,
  actualizado_en  timestamptz not null default now(),
  constraint archivos_cliente_proyecto_fk foreign key (proyecto_id, empresa_id) references public.proyectos (id, empresa_id),
  constraint archivos_cliente_ruta_empresa check (starts_with(storage_path, empresa_id::text || '/')),
  constraint archivos_cliente_recibido_coherente check ((estado = 'recibido') = (recibido_en is not null)),
  constraint archivos_cliente_borrar_solo_nuevo check (borrado_en is null or estado = 'nuevo'),
  constraint archivos_cliente_id_empresa_unico unique (id, empresa_id)
);
create index archivos_cliente_idx on public.archivos_cliente (empresa_id, creado_en desc);
create index archivos_cliente_nuevos_idx on public.archivos_cliente (creado_en desc) where estado = 'nuevo' and borrado_en is null;

-- La ruta de cada archivo la genera el SERVIDOR (identificador aleatorio), no la persona: primero se reserva,
-- luego se sube a Storage (la regla de Storage exige una reserva vigente) y al final se confirma.
create table public.subidas_reservadas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id),
  user_id         uuid not null references public.perfiles (user_id),
  destino         text not null check (destino in ('documento', 'archivo_cliente', 'captura')),
  bucket_id       text not null check (bucket_id in ('documentos', 'archivos-empresa', 'capturas-revisiones')),
  ruta            text not null unique check (char_length(ruta) <= 300 and starts_with(ruta, empresa_id::text || '/')),
  nombre_original text not null check (char_length(btrim(nombre_original)) between 1 and 200),
  mime_type       text not null,
  tamano_bytes    bigint not null check (tamano_bytes between 1 and 52428800),
  creada_en       timestamptz not null default now(),
  vence_en        timestamptz not null,
  usada_en        timestamptz,
  constraint subidas_vence_maximo_2_horas check (vence_en > creada_en and vence_en <= creada_en + interval '2 hours'),
  constraint subidas_destino_bucket check (
    (destino = 'documento' and bucket_id = 'documentos') or
    (destino = 'archivo_cliente' and bucket_id = 'archivos-empresa') or
    (destino = 'captura' and bucket_id = 'capturas-revisiones'))
);
create index subidas_reservadas_usuario_idx on public.subidas_reservadas (user_id, creada_en desc);

-- ---------- Triggers de utilidad ----------
create trigger revisiones_actualizada before update on public.revisiones for each row execute function private.poner_actualizado_en();
create trigger documentos_actualizado before update on public.documentos for each row execute function private.poner_actualizado_en();
create trigger archivos_cliente_actualizado before update on public.archivos_cliente for each row execute function private.poner_actualizado_en();

-- empresa_id inmutable en toda tabla con empresa_id
create trigger revisiones_empresa_fija before update on public.revisiones for each row execute function private.empresa_id_inmutable();
create trigger revision_versiones_empresa_fija before update on public.revision_versiones for each row execute function private.empresa_id_inmutable();
create trigger aprobaciones_empresa_fija before update on public.aprobaciones for each row execute function private.empresa_id_inmutable();
create trigger documentos_empresa_fija before update on public.documentos for each row execute function private.empresa_id_inmutable();
create trigger documento_versiones_empresa_fija before update on public.documento_versiones for each row execute function private.empresa_id_inmutable();
create trigger documento_permisos_empresa_fija before update on public.documento_permisos for each row execute function private.empresa_id_inmutable();
create trigger archivos_cliente_empresa_fija before update on public.archivos_cliente for each row execute function private.empresa_id_inmutable();
create trigger subidas_reservadas_empresa_fija before update on public.subidas_reservadas for each row execute function private.empresa_id_inmutable();

-- Otros campos fijos
create trigger revisiones_campos_fijos before update on public.revisiones
  for each row execute function private.campos_inmutables('id', 'proyecto_id', 'tipo', 'sprint_id', 'documento_id', 'creado_en');
create trigger documentos_campos_fijos before update on public.documentos
  for each row execute function private.campos_inmutables('id', 'proyecto_id', 'categoria', 'creado_en');
create trigger documento_permisos_campos_fijos before update on public.documento_permisos
  for each row execute function private.campos_inmutables('id', 'documento_id', 'miembro_id', 'otorgado_en');
create trigger archivos_cliente_campos_fijos before update on public.archivos_cliente
  for each row execute function private.campos_inmutables('id', 'proyecto_id', 'bucket_id', 'storage_path', 'nombre_original',
    'mime_type', 'tamano_bytes', 'subido_por', 'subido_por_nombre', 'creado_en');
create trigger subidas_reservadas_campos_fijos before update on public.subidas_reservadas
  for each row execute function private.campos_inmutables('id', 'user_id', 'destino', 'bucket_id', 'ruta', 'nombre_original',
    'mime_type', 'tamano_bytes', 'creada_en', 'vence_en');

-- Solo se agrega
create trigger aprobaciones_solo_agregar before update or delete on public.aprobaciones for each row execute function private.solo_agregar();
create trigger aprobaciones_sin_truncate before truncate on public.aprobaciones for each statement execute function private.solo_agregar();
create trigger documento_versiones_solo_agregar before update or delete on public.documento_versiones for each row execute function private.solo_agregar();
create trigger documento_versiones_sin_truncate before truncate on public.documento_versiones for each statement execute function private.solo_agregar();
-- Las revisiones, los documentos, los archivos y sus reservas no se borran: el rastro es evidencia.
create trigger revisiones_sin_borrar before delete on public.revisiones for each row execute function private.solo_agregar();
create trigger revisiones_sin_truncate before truncate on public.revisiones for each statement execute function private.solo_agregar();
create trigger documentos_sin_borrar before delete on public.documentos for each row execute function private.solo_agregar();
create trigger documentos_sin_truncate before truncate on public.documentos for each statement execute function private.solo_agregar();
create trigger archivos_cliente_sin_borrar before delete on public.archivos_cliente for each row execute function private.solo_agregar();
create trigger archivos_cliente_sin_truncate before truncate on public.archivos_cliente for each statement execute function private.solo_agregar();
create trigger subidas_reservadas_sin_borrar before delete on public.subidas_reservadas for each row execute function private.solo_agregar();
create trigger subidas_reservadas_sin_truncate before truncate on public.subidas_reservadas for each statement execute function private.solo_agregar();
