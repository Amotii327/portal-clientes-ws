-- Sprint 2 · Tablas: proyectos, hitos, hitos_pago_asociado, sprints, retrasos, cambios_plan,
-- historial_proyecto y sesiones_ver_como. Las reglas (RLS) van en la migracion 000300.
-- Equipo Websourcing · Desarrollo
--
-- Convenciones: llaves compuestas (empresa_id, id); empresa_id inmutable; sin columnas "creado_por"
-- en lo que ve el cliente (quien lo hizo queda en registro_actividad). Escrituras solo por RPC.

create table public.proyectos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas (id),
  nombre           text not null check (char_length(btrim(nombre)) between 2 and 160),
  descripcion      text check (descripcion is null or char_length(descripcion) <= 1000),
  estado           text not null default 'activo' check (estado in ('activo', 'pausado', 'terminado', 'cancelado')),
  fecha_inicio     date,
  fecha_fin_planeada date,
  fecha_fin_real   date,
  -- Plan de sprints: 'propuesta' (borrador, el cliente NO lo ve) o 'aprobado' (el cliente lo ve).
  plan_estado      text not null default 'propuesta' check (plan_estado in ('propuesta', 'aprobado')),
  plan_aprobado_en timestamptz,
  -- Avance (D-013), calculado por la base. Nadie lo escribe a mano.
  avance_pct       numeric(5,2) not null default 0 check (avance_pct between 0 and 100),
  avance_partes_hechas smallint not null default 0,
  avance_partes_total  smallint not null default 12,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint proyectos_fechas_coherentes check (fecha_fin_planeada is null or fecha_inicio is null or fecha_fin_planeada >= fecha_inicio),
  constraint proyectos_plan_coherente check ((plan_estado = 'aprobado') = (plan_aprobado_en is not null)),
  -- Llaves para las tablas hijas, de este y de otros modulos (tickets, dinero, documentos...).
  constraint proyectos_empresa_id_unico unique (empresa_id, id),
  constraint proyectos_id_empresa_unico unique (id, empresa_id)
);
create index proyectos_empresa_idx on public.proyectos (empresa_id);

create table public.hitos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null,
  proyecto_id   uuid not null,
  numero        smallint not null check (numero between 1 and 13),
  nombre        text not null check (char_length(btrim(nombre)) between 2 and 120),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'esperando_aprobacion', 'terminado')),
  fecha_planeada date,
  fecha_real    date,
  -- Solo el hito 13 (mantenimiento) puede estar oculto: nace oculto hasta que se active el mantenimiento.
  visible       boolean not null default true,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint hitos_proyecto_fk foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id),
  constraint hitos_numero_unico unique (proyecto_id, numero),
  constraint hitos_empresa_id_unico unique (empresa_id, id),
  constraint hitos_real_coherente check ((estado = 'terminado') = (fecha_real is not null)),
  constraint hitos_solo_13_oculto check (visible or numero = 13)
);
create index hitos_proyecto_idx on public.hitos (empresa_id, proyecto_id);

-- Pago asociado a un hito (solo la etiqueta: "Anticipo", "Saldo final"...). Los montos son del sprint 4.
-- Va aparte para que solo lo vea quien puede ver dinero.
create table public.hitos_pago_asociado (
  hito_id     uuid primary key,
  empresa_id  uuid not null,
  concepto    text not null check (char_length(btrim(concepto)) between 2 and 120),
  actualizado_en timestamptz not null default now(),
  constraint hitos_pago_hito_fk foreign key (empresa_id, hito_id) references public.hitos (empresa_id, id)
);

create table public.sprints (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null,
  proyecto_id uuid not null,
  numero      integer not null check (numero >= 1),
  nombre      text not null check (char_length(btrim(nombre)) between 2 and 120),
  estado      text not null default 'propuesto' check (estado in ('propuesto', 'aprobado', 'en_curso', 'en_revision', 'terminado')),
  fecha_inicio date not null,
  fecha_fin   date not null,
  fecha_demo  date,
  -- Que incluye: lista de entregables o historias.
  incluye     text[] not null default '{}' check (cardinality(incluye) <= 30),
  terminado_en date,
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint sprints_proyecto_fk foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id),
  -- Diferida: permite renumerar (reordenar) dentro de una sola operacion.
  constraint sprints_numero_unico unique (proyecto_id, numero) deferrable initially deferred,
  constraint sprints_empresa_id_unico unique (empresa_id, id),
  constraint sprints_fechas check (fecha_fin >= fecha_inicio and (fecha_demo is null or fecha_demo >= fecha_inicio)),
  constraint sprints_terminado_coherente check ((estado = 'terminado') = (terminado_en is not null))
);
create index sprints_proyecto_idx on public.sprints (empresa_id, proyecto_id);

-- Retrasos: cada cambio de una fecha planeada ya fijada. Motivo y lado obligatorios. Solo se agrega.
create table public.retrasos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null,
  proyecto_id    uuid not null,
  hito_id        uuid not null,
  fecha_anterior date not null,
  fecha_nueva    date not null check (fecha_nueva is not null),
  motivo         text not null check (char_length(btrim(motivo)) between 5 and 1000),
  lado           text not null check (lado in ('websourcing', 'cliente')),
  -- Si se espera al cliente: que falta (el cliente lo ve como aviso).
  que_falta      text check (que_falta is null or char_length(btrim(que_falta)) between 3 and 500),
  creado_en      timestamptz not null default now(),
  constraint retrasos_hito_fk foreign key (empresa_id, hito_id) references public.hitos (empresa_id, id),
  constraint retrasos_proyecto_fk foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id),
  constraint retrasos_cliente_que_falta check (lado <> 'cliente' or que_falta is not null),
  constraint retrasos_fecha_distinta check (fecha_nueva <> fecha_anterior)
);
create index retrasos_hito_idx on public.retrasos (empresa_id, hito_id, creado_en desc);

-- Cambios al plan de sprints YA aprobado (el cliente los ve con su motivo). Solo se agrega.
create table public.cambios_plan (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null,
  proyecto_id uuid not null,
  tipo        text not null check (tipo in ('sprint_agregado', 'sprint_quitado', 'sprint_editado', 'sprints_reordenados', 'fechas_corridas')),
  motivo      text not null check (char_length(btrim(motivo)) between 5 and 1000),
  detalle     jsonb not null default '{}'::jsonb,
  creado_en   timestamptz not null default now(),
  constraint cambios_plan_proyecto_fk foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id)
);
create index cambios_plan_proyecto_idx on public.cambios_plan (empresa_id, proyecto_id, creado_en desc);

-- Historial del proyecto "apto para el cliente": sin IP, sin acciones internas, sin nombres del equipo.
-- Lo escriben los triggers (migracion 000400). visible_cliente = false para borradores y hitos ocultos.
create table public.historial_proyecto (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null,
  proyecto_id uuid not null,
  tipo        text not null,
  actor_tipo  text not null check (actor_tipo in ('equipo_websourcing', 'cliente', 'sistema')),
  detalle     jsonb not null default '{}'::jsonb,
  visible_cliente boolean not null default true,
  creado_en   timestamptz not null default now(),
  constraint historial_proyecto_fk foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id)
);
create index historial_proyecto_idx on public.historial_proyecto (empresa_id, proyecto_id, id desc);

-- "Ver como el cliente": la marca vive en el servidor, no en el token (ver docs/decisiones D-020).
create table public.sesiones_ver_como (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.perfiles (user_id),
  empresa_id  uuid not null references public.empresas (id),
  rol         text not null check (rol in ('admin_cliente', 'equipo')),
  aprobar           boolean not null default false,
  ver_dinero        boolean not null default false,
  ver_todos_tickets boolean not null default false,
  subir_archivos    boolean not null default false,
  iniciada_en timestamptz not null default now(),
  vence_en    timestamptz not null,
  terminada_en timestamptz,
  motivo_cierre text check (motivo_cierre is null or motivo_cierre in ('manual', 'vencida', 'reemplazada')),
  constraint ver_como_vence_maximo check (vence_en > iniciada_en and vence_en <= iniciada_en + interval '2 hours'),
  constraint ver_como_cierre_coherente check ((terminada_en is null) = (motivo_cierre is null)),
  constraint ver_como_admin_todos check (rol <> 'admin_cliente' or (aprobar and ver_dinero and ver_todos_tickets and subir_archivos))
);
create unique index ver_como_una_activa on public.sesiones_ver_como (user_id) where terminada_en is null;

-- Triggers de utilidad
create trigger proyectos_actualizado before update on public.proyectos for each row execute function private.poner_actualizado_en();
create trigger hitos_actualizado before update on public.hitos for each row execute function private.poner_actualizado_en();
create trigger sprints_actualizado before update on public.sprints for each row execute function private.poner_actualizado_en();
create trigger hitos_pago_actualizado before update on public.hitos_pago_asociado for each row execute function private.poner_actualizado_en();

-- empresa_id inmutable en toda tabla con empresa_id
create trigger proyectos_empresa_fija before update on public.proyectos for each row execute function private.empresa_id_inmutable();
create trigger hitos_empresa_fija before update on public.hitos for each row execute function private.empresa_id_inmutable();
create trigger hitos_pago_empresa_fija before update on public.hitos_pago_asociado for each row execute function private.empresa_id_inmutable();
create trigger sprints_empresa_fija before update on public.sprints for each row execute function private.empresa_id_inmutable();
create trigger retrasos_empresa_fija before update on public.retrasos for each row execute function private.empresa_id_inmutable();
create trigger cambios_plan_empresa_fija before update on public.cambios_plan for each row execute function private.empresa_id_inmutable();
create trigger historial_proyecto_empresa_fija before update on public.historial_proyecto for each row execute function private.empresa_id_inmutable();
create trigger sesiones_ver_como_empresa_fija before update on public.sesiones_ver_como for each row execute function private.empresa_id_inmutable();

-- Otros campos fijos
create trigger proyectos_campos_fijos before update on public.proyectos for each row execute function private.campos_inmutables('id', 'creado_en');
create trigger hitos_campos_fijos before update on public.hitos for each row execute function private.campos_inmutables('id', 'proyecto_id', 'numero', 'creado_en');
create trigger hitos_pago_campos_fijos before update on public.hitos_pago_asociado for each row execute function private.campos_inmutables('hito_id');
create trigger sprints_campos_fijos before update on public.sprints for each row execute function private.campos_inmutables('id', 'proyecto_id', 'creado_en');
create trigger sesiones_ver_como_campos_fijos before update on public.sesiones_ver_como
  for each row execute function private.campos_inmutables('id', 'user_id', 'rol', 'aprobar', 'ver_dinero', 'ver_todos_tickets', 'subir_archivos', 'iniciada_en', 'vence_en');

-- Solo se agrega
create trigger retrasos_solo_agregar before update or delete on public.retrasos for each row execute function private.solo_agregar();
create trigger retrasos_sin_truncate before truncate on public.retrasos for each statement execute function private.solo_agregar();
create trigger cambios_plan_solo_agregar before update or delete on public.cambios_plan for each row execute function private.solo_agregar();
create trigger cambios_plan_sin_truncate before truncate on public.cambios_plan for each statement execute function private.solo_agregar();
create trigger historial_proyecto_solo_agregar before update or delete on public.historial_proyecto for each row execute function private.solo_agregar();
create trigger historial_proyecto_sin_truncate before truncate on public.historial_proyecto for each statement execute function private.solo_agregar();
-- Las sesiones "ver como" no se borran (quedan de evidencia); solo se cierran.
create trigger sesiones_ver_como_sin_borrar before delete on public.sesiones_ver_como for each row execute function private.solo_agregar();
create trigger sesiones_ver_como_sin_truncate before truncate on public.sesiones_ver_como for each statement execute function private.solo_agregar();
