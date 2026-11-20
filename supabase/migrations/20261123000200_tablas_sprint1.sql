-- Sprint 1 · Tablas: empresas, datos_facturacion, perfiles, super_admins, miembros,
-- invitaciones, aceptaciones_politica, registro_actividad, configuracion, preferencias_usuario.
-- Equipo Websourcing · Desarrollo
-- Las reglas de seguridad (RLS) y los permisos van en la migracion 000400.

-- Perfiles: 1 a 1 con el usuario de Supabase Auth. Nunca se borra (Ley 1581: se anonimiza).
create table public.perfiles (
  user_id        uuid primary key references auth.users (id) on delete restrict,
  nombre         text not null check (char_length(btrim(nombre)) between 2 and 120),
  correo         text not null check (correo = lower(correo) and char_length(correo) <= 254
                                      and correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  celular        text check (celular is null or celular ~ '^[0-9+() -]{7,20}$'),
  bloqueado      boolean not null default false,
  bloqueado_en   timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint perfiles_bloqueo_coherente check (bloqueado = (bloqueado_en is not null))
);

-- Super administradores: solo se cambia directo en la base. Sin acceso desde la API.
create table public.super_admins (
  user_id   uuid primary key references public.perfiles (user_id) on delete restrict,
  creado_en timestamptz not null default now()
);

create table public.empresas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (char_length(btrim(nombre)) between 2 and 120),
  nit_registro   text not null check (nit_registro ~ '^[0-9][0-9.-]{4,19}$'),
  logo_path      text check (logo_path is null or char_length(logo_path) <= 300),
  estado         text not null default 'activa' check (estado in ('activa', 'pausada')),
  motivo_pausa   text check (motivo_pausa is null or char_length(motivo_pausa) <= 500),
  pausada_en     timestamptz,
  pausada_por    uuid references public.perfiles (user_id),
  creada_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint empresas_nit_registro_unico unique (nit_registro),
  constraint empresas_pausa_coherente check ((estado = 'pausada') = (pausada_en is not null))
);

-- 1 a 1 con empresa. La edita el admin del cliente.
create table public.datos_facturacion (
  empresa_id     uuid primary key references public.empresas (id),
  razon_social   text not null check (char_length(btrim(razon_social)) between 2 and 200),
  nit            text not null check (nit ~ '^[0-9][0-9.-]{4,19}$'),
  correo_facturas text not null check (correo_facturas = lower(correo_facturas) and char_length(correo_facturas) <= 254
                                      and correo_facturas ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

-- Un usuario pertenece a UNA empresa activa a la vez (indice parcial). "Quitar" no borra la fila:
-- se marca quitado_en, asi el historial y las llaves compuestas de sprints futuros se conservan.
create table public.miembros (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas (id),
  user_id           uuid not null references public.perfiles (user_id),
  rol               text not null check (rol in ('admin_cliente', 'equipo')),
  aprobar           boolean not null default false,
  ver_dinero        boolean not null default false,
  ver_todos_tickets boolean not null default false,
  subir_archivos    boolean not null default false,
  bloqueado         boolean not null default false,
  bloqueado_en      timestamptz,
  quitado_en        timestamptz,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  -- Llave para que las tablas hijas (sprints siguientes) se enlacen con (empresa_id, miembro_id).
  constraint miembros_empresa_id_unico unique (empresa_id, id),
  constraint miembros_bloqueo_coherente check (bloqueado = (bloqueado_en is not null)),
  constraint miembros_admin_todos_los_permisos check (
    rol <> 'admin_cliente' or (aprobar and ver_dinero and ver_todos_tickets and subir_archivos))
);
create unique index miembros_un_usuario_una_empresa_activa on public.miembros (user_id) where quitado_en is null;
create index miembros_empresa_idx on public.miembros (empresa_id);

create table public.invitaciones (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas (id),
  correo            text not null check (correo = lower(correo) and char_length(correo) <= 254
                                         and correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Nunca super admin: el rol solo admite estos dos valores.
  rol               text not null check (rol in ('admin_cliente', 'equipo')),
  aprobar           boolean not null default false,
  ver_dinero        boolean not null default false,
  ver_todos_tickets boolean not null default false,
  subir_archivos    boolean not null default false,
  -- SHA-256 (hex) del token. El token en claro solo existe en el correo.
  token_hash        text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  creada_en         timestamptz not null default now(),
  vence_en          timestamptz not null,
  usada_en          timestamptz,
  usada_por         uuid references public.perfiles (user_id),
  miembro_id        uuid,
  revocada_en       timestamptz,
  invitada_por      uuid references public.perfiles (user_id),
  constraint invitaciones_vence_maximo_7_dias check (vence_en > creada_en and vence_en <= creada_en + interval '7 days'),
  constraint invitaciones_uso_coherente check ((usada_en is null) = (miembro_id is null) and (usada_en is null) = (usada_por is null)),
  constraint invitaciones_admin_todos_los_permisos check (
    rol <> 'admin_cliente' or (aprobar and ver_dinero and ver_todos_tickets and subir_archivos)),
  -- El miembro creado por la invitacion debe ser de la MISMA empresa.
  constraint invitaciones_miembro_misma_empresa foreign key (empresa_id, miembro_id)
    references public.miembros (empresa_id, id),
  constraint invitaciones_empresa_id_unico unique (empresa_id, id)
);
-- Una sola invitacion pendiente por correo y empresa.
create unique index invitaciones_una_pendiente on public.invitaciones (empresa_id, correo)
  where usada_en is null and revocada_en is null;

create table public.aceptaciones_politica (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.perfiles (user_id),
  version     text not null check (char_length(version) between 1 and 40),
  aceptada_en timestamptz not null default now(),
  ip          inet
);
create index aceptaciones_politica_user_idx on public.aceptaciones_politica (user_id);

-- Solo se agrega. Lo escriben los triggers (migracion 000500), nunca la pantalla.
create table public.registro_actividad (
  id          bigint generated always as identity primary key,
  empresa_id  uuid references public.empresas (id),   -- null = evento global
  actor_id    uuid,                                   -- null = sistema
  actor_tipo  text not null default 'usuario' check (actor_tipo in ('usuario', 'sistema')),
  accion      text not null,
  entidad     text not null,
  entidad_id  text,
  detalle     jsonb not null default '{}'::jsonb,
  ip          inet,
  creado_en   timestamptz not null default now()
);
create index registro_actividad_empresa_idx on public.registro_actividad (empresa_id, creado_en desc);
create index registro_actividad_fecha_idx on public.registro_actividad (creado_en desc);

create table public.configuracion (
  clave          text primary key check (clave ~ '^[a-z][a-z0-9_]{1,59}$'),
  valor          jsonb not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

-- Tema visual por usuario (D-017). Sin fila = clara.
create table public.preferencias_usuario (
  user_id        uuid primary key references public.perfiles (user_id),
  tema           text not null default 'clara' check (tema in ('clara', 'oscura')),
  actualizado_en timestamptz not null default now()
);

-- Triggers de utilidad
create trigger perfiles_actualizado before update on public.perfiles
  for each row execute function private.poner_actualizado_en();
create trigger empresas_actualizada before update on public.empresas
  for each row execute function private.poner_actualizado_en();
create trigger datos_facturacion_actualizado before update on public.datos_facturacion
  for each row execute function private.poner_actualizado_en();
create trigger miembros_actualizado before update on public.miembros
  for each row execute function private.poner_actualizado_en();
create trigger configuracion_actualizada before update on public.configuracion
  for each row execute function private.poner_actualizado_en();
create trigger preferencias_actualizada before update on public.preferencias_usuario
  for each row execute function private.poner_actualizado_en();

-- empresa_id inmutable
create trigger datos_facturacion_empresa_fija before update on public.datos_facturacion
  for each row execute function private.empresa_id_inmutable();
create trigger miembros_empresa_fija before update on public.miembros
  for each row execute function private.empresa_id_inmutable();
create trigger invitaciones_empresa_fija before update on public.invitaciones
  for each row execute function private.empresa_id_inmutable();
create trigger registro_actividad_empresa_fija before update on public.registro_actividad
  for each row execute function private.empresa_id_inmutable();

-- Otros campos que no cambian
create trigger empresas_id_fijo before update on public.empresas
  for each row execute function private.campos_inmutables('id', 'creada_en');
create trigger perfiles_user_fijo before update on public.perfiles
  for each row execute function private.campos_inmutables('user_id', 'creado_en');
create trigger miembros_campos_fijos before update on public.miembros
  for each row execute function private.campos_inmutables('id', 'user_id', 'rol', 'creado_en');
create trigger invitaciones_campos_fijos before update on public.invitaciones
  for each row execute function private.campos_inmutables('id', 'correo', 'rol', 'token_hash', 'creada_en', 'vence_en',
    'aprobar', 'ver_dinero', 'ver_todos_tickets', 'subir_archivos', 'invitada_por');

-- Solo se agrega
create trigger registro_actividad_solo_agregar before update or delete on public.registro_actividad
  for each row execute function private.solo_agregar();
create trigger registro_actividad_sin_truncate before truncate on public.registro_actividad
  for each statement execute function private.solo_agregar();
create trigger aceptaciones_politica_solo_agregar before update or delete on public.aceptaciones_politica
  for each row execute function private.solo_agregar();
create trigger aceptaciones_politica_sin_truncate before truncate on public.aceptaciones_politica
  for each statement execute function private.solo_agregar();
