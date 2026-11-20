-- Sprint 4 · Modulo 4 (Dinero) · Tablas: contratos, pagos_programados, abonos, facturas,
-- comprobantes_pago y avisos_salientes. Las reglas (RLS) van en la migracion 000300.
-- Equipo Websourcing · Desarrollo
--
-- Convenciones: dinero siempre en numeric(14,2) (nunca float) con moneda COP o USD; llaves compuestas
-- con empresa_id (un dato de la empresa A nunca apunta a uno de la B); empresa_id inmutable;
-- sin columnas "quien lo hizo" del equipo (eso queda en registro_actividad); escrituras solo por RPC.
-- Archivos: bucket privado "dinero", ruta <empresa_id>/<carpeta>/<uuid>.<ext> generada por el servidor.

-- Un contrato por proyecto: valor total, moneda y anticipo acordado.
create table public.contratos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null,
  proyecto_id    uuid not null,
  valor          numeric(14,2) not null check (valor > 0),
  moneda         text not null check (moneda in ('COP', 'USD')),
  anticipo       numeric(14,2) not null default 0 check (anticipo >= 0),
  fecha_firma    date check (fecha_firma is null or fecha_firma between date '2020-01-01' and date '2100-01-01'),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint contratos_proyecto_fk foreign key (proyecto_id, empresa_id) references public.proyectos (id, empresa_id),
  constraint contratos_proyecto_unico unique (proyecto_id),
  constraint contratos_anticipo_maximo check (anticipo <= valor),
  constraint contratos_empresa_id_unico unique (empresa_id, id)
);
create index contratos_empresa_idx on public.contratos (empresa_id);

-- Plan de pagos: cada cuota, con su vencimiento y (opcional) el hito al que esta atada.
-- El estado (pendiente, por vencer, vencido, en revision, pagado) NO se guarda: lo calcula la vista v_pagos_programados.
create table public.pagos_programados (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null,
  contrato_id    uuid not null,
  concepto       text not null check (char_length(btrim(concepto)) between 2 and 120),
  valor          numeric(14,2) not null check (valor > 0),
  vence_el       date not null check (vence_el between date '2020-01-01' and date '2100-01-01'),
  hito_id        uuid,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint pagos_contrato_fk foreign key (empresa_id, contrato_id) references public.contratos (empresa_id, id),
  constraint pagos_hito_fk foreign key (empresa_id, hito_id) references public.hitos (empresa_id, id),
  constraint pagos_empresa_id_unico unique (empresa_id, id),
  -- Para que abonos, facturas y comprobantes se enlacen con (empresa, contrato, pago) y no puedan mezclar contratos.
  constraint pagos_empresa_contrato_id_unico unique (empresa_id, contrato_id, id)
);
create index pagos_contrato_idx on public.pagos_programados (contrato_id, vence_el);
create index pagos_empresa_vence_idx on public.pagos_programados (empresa_id, vence_el);
create index pagos_hito_idx on public.pagos_programados (hito_id) where hito_id is not null;

-- Abonos: plata que ya entro. Solo se agregan; un error se corrige anulando (queda el rastro) y registrando otro.
create table public.abonos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null,
  contrato_id         uuid not null,
  pago_programado_id  uuid,
  valor               numeric(14,2) not null check (valor > 0),
  fecha_pago          date not null check (fecha_pago between date '2020-01-01' and date '2100-01-01'),
  medio               text not null check (medio in ('transferencia', 'consignacion', 'tarjeta', 'efectivo', 'otro')),
  referencia          text check (referencia is null or char_length(referencia) <= 120),
  archivo_path        text,
  anulado_en          timestamptz,
  -- El motivo lo ve tambien el cliente (explica por que cambio su saldo): se escribe pensando en el.
  anulado_motivo      text check (anulado_motivo is null or char_length(btrim(anulado_motivo)) between 5 and 500),
  creado_en           timestamptz not null default now(),
  constraint abonos_contrato_fk foreign key (empresa_id, contrato_id) references public.contratos (empresa_id, id),
  constraint abonos_pago_fk foreign key (empresa_id, contrato_id, pago_programado_id)
    references public.pagos_programados (empresa_id, contrato_id, id),
  constraint abonos_empresa_id_unico unique (empresa_id, id),
  constraint abonos_anulacion_coherente check ((anulado_en is null) = (anulado_motivo is null)),
  constraint abonos_ruta_archivo check (archivo_path is null or archivo_path ~
    ('^' || empresa_id::text || '/(abonos|comprobantes)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|webp)$'))
);
create index abonos_contrato_idx on public.abonos (contrato_id) where anulado_en is null;
create index abonos_pago_idx on public.abonos (pago_programado_id) where pago_programado_id is not null and anulado_en is null;
create index abonos_fecha_idx on public.abonos (fecha_pago) where anulado_en is null;

-- Facturas que sube Websourcing (PDF, a nombre de Amotii). Solo metadatos: el archivo vive en Storage privado.
create table public.facturas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null,
  contrato_id         uuid not null,
  pago_programado_id  uuid,
  numero              text not null check (numero ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
  valor               numeric(14,2) not null check (valor > 0),
  fecha_emision       date not null check (fecha_emision between date '2020-01-01' and date '2100-01-01'),
  archivo_path        text not null,
  archivo_nombre      text not null check (char_length(btrim(archivo_nombre)) between 1 and 200),
  tamano_bytes        integer not null check (tamano_bytes between 1 and 20971520),
  anulada_en          timestamptz,
  anulada_motivo      text check (anulada_motivo is null or char_length(btrim(anulada_motivo)) between 5 and 500),
  creado_en           timestamptz not null default now(),
  constraint facturas_contrato_fk foreign key (empresa_id, contrato_id) references public.contratos (empresa_id, id),
  constraint facturas_pago_fk foreign key (empresa_id, contrato_id, pago_programado_id)
    references public.pagos_programados (empresa_id, contrato_id, id),
  constraint facturas_numero_unico unique (numero),
  constraint facturas_empresa_id_unico unique (empresa_id, id),
  constraint facturas_anulacion_coherente check ((anulada_en is null) = (anulada_motivo is null)),
  constraint facturas_ruta_archivo check (archivo_path ~
    ('^' || empresa_id::text || '/facturas/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'))
);
create index facturas_contrato_idx on public.facturas (contrato_id);

-- Comprobantes que sube el cliente. Quedan "en_revision" hasta que el super admin los confirma o rechaza.
-- Solo al confirmar se crea el abono (abono_id). Un rechazado nunca crea abono y guarda el motivo.
create table public.comprobantes_pago (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null,
  contrato_id          uuid not null,
  pago_programado_id   uuid not null,
  valor_declarado      numeric(14,2) not null check (valor_declarado > 0),
  fecha_pago_declarada date not null check (fecha_pago_declarada between date '2020-01-01' and date '2100-01-01'),
  archivo_path         text not null,
  archivo_nombre       text not null check (char_length(btrim(archivo_nombre)) between 1 and 200),
  archivo_tipo         text not null check (archivo_tipo in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  tamano_bytes         integer not null check (tamano_bytes between 1 and 10485760),
  nota                 text check (nota is null or char_length(nota) <= 500),
  subido_por           uuid not null references public.perfiles (user_id),
  estado               text not null default 'en_revision' check (estado in ('en_revision', 'confirmado', 'rechazado')),
  motivo_rechazo       text check (motivo_rechazo is null or char_length(btrim(motivo_rechazo)) between 5 and 500),
  revisado_en          timestamptz,
  abono_id             uuid,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  constraint comprobantes_pago_fk foreign key (empresa_id, contrato_id, pago_programado_id)
    references public.pagos_programados (empresa_id, contrato_id, id),
  constraint comprobantes_abono_fk foreign key (empresa_id, abono_id) references public.abonos (empresa_id, id),
  constraint comprobantes_empresa_id_unico unique (empresa_id, id),
  constraint comprobantes_abono_unico unique (abono_id),
  constraint comprobantes_archivo_unico unique (archivo_path),
  -- Coherencia del estado: rechazado = con motivo; confirmado = con abono; en revision = sin revisar.
  constraint comprobantes_rechazo_coherente check ((estado = 'rechazado') = (motivo_rechazo is not null)),
  constraint comprobantes_confirmado_coherente check ((estado = 'confirmado') = (abono_id is not null)),
  constraint comprobantes_revision_coherente check ((estado = 'en_revision') = (revisado_en is null)),
  constraint comprobantes_ruta_archivo check (archivo_path ~
    ('^' || empresa_id::text || '/comprobantes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|webp)$'))
);
-- Un solo comprobante en revision por cuota (nadie llena la bandeja del super admin).
create unique index comprobantes_uno_en_revision on public.comprobantes_pago (pago_programado_id) where estado = 'en_revision';
create index comprobantes_empresa_idx on public.comprobantes_pago (empresa_id, creado_en desc);
create index comprobantes_estado_idx on public.comprobantes_pago (estado) where estado = 'en_revision';

-- Cola de avisos por salir (outbox). La llena la base (triggers y la tarea de recordatorios); un
-- modulo de notificaciones la vaciara (sprint 6). Forma generica a proposito (modulo, tipo, referencia_id)
-- para que tickets y mantenimiento puedan usar la MISMA tabla. Solo el super admin la lee.
create table public.avisos_salientes (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id),
  modulo          text not null check (modulo ~ '^[a-z][a-z_]{1,29}$'),
  tipo            text not null check (tipo ~ '^[a-z][a-z_]{2,59}$'),
  -- A quien: el super admin, o quienes de la empresa pueden ver dinero (se resuelven al enviar, con datos al dia).
  destino         text not null check (destino in ('super_admin', 'cliente_dinero', 'cliente_admin')),
  referencia_id   uuid,
  -- Evita avisos repetidos: la misma clave no se encola dos veces.
  clave_unica     text not null check (char_length(clave_unica) between 5 and 200),
  datos           jsonb not null default '{}'::jsonb,
  programado_para timestamptz not null default now(),
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'fallido', 'cancelado')),
  intentos        smallint not null default 0 check (intentos >= 0),
  enviado_en      timestamptz,
  ultimo_error    text check (ultimo_error is null or char_length(ultimo_error) <= 300),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint avisos_clave_unica unique (clave_unica),
  constraint avisos_envio_coherente check ((estado = 'enviado') = (enviado_en is not null))
);
create index avisos_pendientes_idx on public.avisos_salientes (programado_para) where estado = 'pendiente';
create index avisos_empresa_idx on public.avisos_salientes (empresa_id, creado_en desc);
