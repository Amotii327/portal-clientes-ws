-- Solicitud de cambio No. 5 · Ahorro de espacio (aprobada por el dueño, 2026-11-20). Equipo Websourcing · Desarrollo
-- 1) Cupo de espacio por empresa (1 GB por defecto, el super admin lo cambia; aviso al 80 %, bloqueo de subidas al 100 %).
-- 2) Videos de tickets: maximo 20 MB, o un enlace de video en vez de archivo.
-- 3) Registro de archivos "archivados" (ubicacion externa y estado) y marca de los de proyectos cerrados hace mas de 30 dias.
-- 4) Resumen mensual del registro de actividad a los 12 meses.
-- El TRASLADO real al archivo externo (VPS de Hostinger, decision del dueño pendiente) NO esta aqui: es el script
-- scripts/archivo-externo-hostinger.sh, que no se ejecuta todavia. Esta migracion solo lleva la cuenta y el registro.
-- Imagenes comprimidas al subir: es del navegador (Frontend); no hay nada que hacer en la base.

-- ---------- Parametros (configuracion global; el dueño los puede cambiar) ----------
insert into public.configuracion (clave, valor) values
  ('cupo_espacio', '{"cupo_bytes_por_defecto": 1073741824, "aviso_porcentaje": 80}'),
  ('archivo_externo', '{"dias_tras_cierre": 30}'),
  ('registro_resumen', '{"meses": 12, "borrar_detalle": false}'),
  -- D-021: el archivo externo es el disco del VPS de Hostinger. Interruptor APAGADO hasta que el VPS exista: apagado, los videos
  -- de tickets se reciben como enlace o en Supabase (maximo 20 MB, dentro del cupo). Encendido, Supabase ya no recibe videos
  -- (error video_a_archivo_externo): van al archivo externo o se pegan como enlace.
  ('videos_a_archivo_externo', '{"activo": false}')
on conflict (clave) do nothing;

-- ---------- 1) Cupo por empresa ----------
create table public.cupos_espacio (
  empresa_id      uuid primary key references public.empresas (id),
  cupo_bytes      bigint not null check (cupo_bytes between 10485760 and 1099511627776),  -- de 10 MB a 1 TB
  actualizado_en  timestamptz not null default now()
);
create trigger cupos_actualizado before update on public.cupos_espacio for each row execute function private.poner_actualizado_en();
create trigger cupos_empresa_fija before update on public.cupos_espacio for each row execute function private.empresa_id_inmutable();

-- Cuanto pesa lo que la empresa tiene HOY en Supabase Storage: los metadatos de todas las tablas con archivos
-- (documentos, archivos de la empresa, adjuntos de tickets, comprobantes y facturas) + capturas de revisiones y
-- soportes de abonos (que no guardan tamano, se leen de Storage). Lo archivado y ya borrado de Supabase no cuenta.
create function private.espacio_usado(p_empresa uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare v bigint; v_extra bigint := 0;
begin
  select coalesce(sum(b), 0) into v from (
    select tamano_bytes::bigint as b from public.documento_versiones where empresa_id = p_empresa
    union all select tamano_bytes::bigint from public.archivos_cliente where empresa_id = p_empresa and borrado_en is null
    union all select tamano_bytes::bigint from public.ticket_adjuntos where empresa_id = p_empresa
    union all select tamano_bytes::bigint from public.comprobantes_pago where empresa_id = p_empresa
    union all select tamano_bytes::bigint from public.facturas where empresa_id = p_empresa
  ) x;
  v := v - coalesce((select sum(tamano_bytes) from public.archivos_archivados
                      where empresa_id = p_empresa and estado = 'borrado_de_supabase'), 0);
  if to_regclass('storage.objects') is not null then
    execute $q$select coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0) from storage.objects
                where (bucket_id = 'capturas-revisiones' and name like $1 || '/%')
                   or (bucket_id = 'dinero' and name like $1 || '/abonos/%')$q$
      into v_extra using p_empresa::text;
  end if;
  return greatest(v, 0) + v_extra;
end $$;

create function private.cupo_de(p_empresa uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.cupo_bytes from public.cupos_espacio c where c.empresa_id = p_empresa),
                  (select (g.valor ->> 'cupo_bytes_por_defecto')::bigint from public.configuracion g where g.clave = 'cupo_espacio'),
                  1073741824)
$$;

-- Bloquea la subida si con este archivo se pasa del cupo. Websourcing (super admin) no se bloquea: sube a nombre del cliente.
create function private.exigir_cupo(p_empresa uuid, p_bytes bigint) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.es_super_admin() then return; end if;
  if private.espacio_usado(p_empresa) + greatest(coalesce(p_bytes, 0), 0) > private.cupo_de(p_empresa) then
    raise exception 'cupo_espacio_lleno' using errcode = 'P0001';
  end if;
end $$;

-- Aviso al 80 % y al 100 % (a los admin del cliente y a los super admin), como mucho uno por mes y por nivel.
create function private.revisar_cupo(p_empresa uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_usado bigint := private.espacio_usado(p_empresa);
  v_cupo bigint := private.cupo_de(p_empresa);
  v_pct numeric := coalesce((select (g.valor ->> 'aviso_porcentaje')::numeric from public.configuracion g where g.clave = 'cupo_espacio'), 80);
  v_tipo text;
  v_mes text := to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
  v_datos jsonb;
begin
  if v_usado >= v_cupo then v_tipo := 'cupo_espacio_lleno';
  elsif v_usado * 100 >= v_cupo * v_pct then v_tipo := 'cupo_espacio_aviso';
  else return;
  end if;
  v_datos := jsonb_build_object('usado_bytes', v_usado, 'cupo_bytes', v_cupo, 'porcentaje', round(v_usado * 100.0 / v_cupo, 1));
  insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
  values (p_empresa, 'archivos', v_tipo, 'cliente_admin', p_empresa, v_tipo || ':cliente:' || p_empresa || ':' || v_mes, v_datos),
         (p_empresa, 'archivos', v_tipo, 'super_admin', p_empresa, v_tipo || ':super_admin:' || p_empresa || ':' || v_mes, v_datos)
  on conflict (clave_unica) do nothing;
end $$;

create function private.trg_revisar_cupo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.revisar_cupo(new.empresa_id);
  return null;
end $$;
create trigger documento_versiones_cupo after insert on public.documento_versiones for each row execute function private.trg_revisar_cupo();
create trigger archivos_cliente_cupo after insert on public.archivos_cliente for each row execute function private.trg_revisar_cupo();
create trigger ticket_adjuntos_cupo after insert on public.ticket_adjuntos for each row execute function private.trg_revisar_cupo();
create trigger comprobantes_pago_cupo after insert on public.comprobantes_pago for each row execute function private.trg_revisar_cupo();
create trigger facturas_cupo after insert on public.facturas for each row execute function private.trg_revisar_cupo();

-- Segunda cerradura, en Storage: con el cupo lleno el navegador tampoco puede subir directo (regla RESTRICTIVA: se suma
-- a las de cada bucket). Mira la carpeta de la empresa (primer tramo de la ruta).
create function private.cupo_permite_subida(p_bucket text, p_ruta text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid;
begin
  if p_bucket not in ('documentos', 'archivos-empresa', 'capturas-revisiones', 'dinero', 'portal-tickets') then return true; end if;
  if private.es_super_admin() then return true; end if;
  if split_part(p_ruta, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return true; end if;
  v_emp := split_part(p_ruta, '/', 1)::uuid;
  return private.espacio_usado(v_emp) < private.cupo_de(v_emp);
end $$;
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute $p$create policy cupo_espacio_subir on storage.objects as restrictive for insert to authenticated
               with check (private.cupo_permite_subida(bucket_id, name))$p$;
  end if;
end $$;

-- Lecturas y cambio del cupo
create function public.fijar_cupo_espacio(p_empresa_id uuid, p_cupo_bytes bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_super_admin();
  perform private.exigir_no_ver_como();
  if not exists (select 1 from public.empresas e where e.id = p_empresa_id) then raise exception 'empresa_no_encontrada' using errcode = 'P0001'; end if;
  if p_cupo_bytes is null then
    delete from public.cupos_espacio where empresa_id = p_empresa_id;   -- vuelve al cupo por defecto
  else
    if p_cupo_bytes not between 10485760 and 1099511627776 then raise exception 'datos_invalidos' using errcode = '22023'; end if;
    insert into public.cupos_espacio (empresa_id, cupo_bytes) values (p_empresa_id, p_cupo_bytes)
    on conflict (empresa_id) do update set cupo_bytes = excluded.cupo_bytes;
  end if;
  perform private.registrar(p_empresa_id, 'cupo_espacio_cambiado', 'cupos_espacio', p_empresa_id::text,
                            jsonb_build_object('cupo_bytes', p_cupo_bytes));
  return jsonb_build_object('empresa_id', p_empresa_id, 'cupo_bytes', private.cupo_de(p_empresa_id));
end $$;

-- Espacio de UNA empresa. Super admin: cualquiera. Cliente: solo el admin de la suya (p_empresa_id se ignora).
create function public.espacio_de_empresa(p_empresa_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_emp uuid; v_usado bigint; v_cupo bigint;
begin
  if auth.uid() is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if private.es_super_admin() then v_emp := p_empresa_id;
  elsif private.soy_admin_cliente() then v_emp := private.mi_empresa_id();
  else raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if v_emp is null or not exists (select 1 from public.empresas e where e.id = v_emp) then
    raise exception 'empresa_no_encontrada' using errcode = 'P0001';
  end if;
  v_usado := private.espacio_usado(v_emp);
  v_cupo := private.cupo_de(v_emp);
  return jsonb_build_object('empresa_id', v_emp, 'usado_bytes', v_usado, 'cupo_bytes', v_cupo,
    'porcentaje', round(v_usado * 100.0 / v_cupo, 1),
    'estado', case when v_usado >= v_cupo then 'lleno' when v_usado * 100 >= v_cupo * 80 then 'aviso' else 'ok' end);
end $$;

-- Super admin: todas las empresas, de la mas llena a la menos llena.
create function public.espacio_por_empresas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_super_admin();
  return coalesce((select jsonb_agg(x order by (x ->> 'porcentaje')::numeric desc, x ->> 'nombre') from (
    select jsonb_build_object('empresa_id', e.id, 'nombre', e.nombre, 'usado_bytes', private.espacio_usado(e.id),
             'cupo_bytes', private.cupo_de(e.id),
             'porcentaje', round(private.espacio_usado(e.id) * 100.0 / private.cupo_de(e.id), 1)) as x
      from public.empresas e) y), '[]'::jsonb);
end $$;

-- ---------- 2) Videos de tickets: 20 MB maximo o un enlace ----------
create or replace function public.preparar_adjunto_ticket(
  p_ticket_id uuid, p_nombre text, p_mime text, p_tamano_bytes bigint, p_mensaje_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tickets := private.ticket_visible(p_ticket_id, false);
  v_ext text;
  v_nombre text;
  v_ruta text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  v_ext := case p_mime
    when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' when 'image/gif' then 'gif'
    when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' when 'video/quicktime' then 'mov'
    when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a' when 'audio/x-m4a' then 'm4a'
    when 'audio/wav' then 'wav' when 'audio/ogg' then 'ogg' when 'audio/webm' then 'weba' end;
  if v_ext is null or p_tamano_bytes is null or p_tamano_bytes not between 1 and 52428800 then
    raise exception 'adjunto_invalido' using errcode = '22023';
  end if;
  if p_mime like 'video/%' and coalesce((select (g.valor ->> 'activo')::boolean from public.configuracion g
                                          where g.clave = 'videos_a_archivo_externo'), false) then
    raise exception 'video_a_archivo_externo' using errcode = 'P0001';
  end if;
  -- Solicitud de cambio 5: un video pesa maximo 20 MB; si es mas grande, se pega un enlace (agregar_enlace_video_ticket).
  if p_mime like 'video/%' and p_tamano_bytes > 20971520 then
    raise exception 'video_demasiado_grande' using errcode = 'P0001';
  end if;
  -- ... y el espacio de la empresa no puede estar lleno (el super admin no se bloquea).
  perform private.exigir_cupo(t.empresa_id, p_tamano_bytes);
  v_nombre := left(regexp_replace(btrim(coalesce(p_nombre, '')), '[/\\[:cntrl:]]', '_', 'g'), 200);
  if v_nombre = '' then raise exception 'adjunto_invalido' using errcode = '22023'; end if;
  if (select count(*) from public.ticket_adjuntos a where a.ticket_id = t.id) >= 30 then
    raise exception 'demasiados_adjuntos' using errcode = 'P0001';
  end if;
  if p_mensaje_id is not null and not exists (
       select 1 from public.ticket_mensajes m
        where m.id = p_mensaje_id and m.ticket_id = t.id and m.empresa_id = t.empresa_id
          and (private.es_super_admin() or not m.interno)) then
    raise exception 'mensaje_no_encontrado' using errcode = 'P0001';
  end if;
  v_id := gen_random_uuid();
  v_ruta := t.empresa_id::text || '/tickets/' || t.id::text || '/' || gen_random_uuid()::text || '.' || v_ext;
  insert into public.ticket_adjuntos (id, empresa_id, ticket_id, mensaje_id, subido_por, nombre_original, mime, tamano_bytes, storage_path)
  values (v_id, t.empresa_id, t.id, p_mensaje_id, auth.uid(), v_nombre, p_mime, p_tamano_bytes, v_ruta);
  return jsonb_build_object('adjunto_id', v_id, 'bucket', 'portal-tickets', 'ruta', v_ruta);
end $$;

create table public.ticket_enlaces_video (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id),
  ticket_id   uuid not null,
  mensaje_id  uuid,
  subido_por  uuid not null default auth.uid() references public.perfiles (user_id),
  url         text not null check (char_length(url) between 12 and 500
                                   and url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{2,5})?(/[^[:space:][:cntrl:]]*)?$'),
  creado_en   timestamptz not null default now(),
  constraint enlaces_ticket_misma_empresa foreign key (empresa_id, ticket_id) references public.tickets (empresa_id, id),
  constraint enlaces_mensaje_misma_empresa foreign key (empresa_id, mensaje_id) references public.ticket_mensajes (empresa_id, id)
);
create index ticket_enlaces_video_ticket_idx on public.ticket_enlaces_video (ticket_id);
create trigger ticket_enlaces_empresa_fija before update on public.ticket_enlaces_video for each row execute function private.empresa_id_inmutable();

create function public.agregar_enlace_video_ticket(p_ticket_id uuid, p_url text, p_mensaje_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tickets := private.ticket_visible(p_ticket_id, false); v_url text := btrim(coalesce(p_url, '')); v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if t.id is null then raise exception 'ticket_no_encontrado' using errcode = 'P0001'; end if;
  if t.estado = 'cerrado' then raise exception 'ticket_cerrado' using errcode = 'P0001'; end if;
  if v_url !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{2,5})?(/[^[:space:][:cntrl:]]*)?$' or char_length(v_url) not between 12 and 500 then
    raise exception 'enlace_invalido' using errcode = '22023';
  end if;
  if (select count(*) from public.ticket_enlaces_video e where e.ticket_id = t.id) >= 10 then
    raise exception 'demasiados_enlaces' using errcode = 'P0001';
  end if;
  if p_mensaje_id is not null and not exists (
       select 1 from public.ticket_mensajes m
        where m.id = p_mensaje_id and m.ticket_id = t.id and m.empresa_id = t.empresa_id
          and (private.es_super_admin() or not m.interno)) then
    raise exception 'mensaje_no_encontrado' using errcode = 'P0001';
  end if;
  insert into public.ticket_enlaces_video (empresa_id, ticket_id, mensaje_id, subido_por, url)
  values (t.empresa_id, t.id, p_mensaje_id, auth.uid(), v_url) returning id into v_id;
  return jsonb_build_object('enlace_id', v_id);
end $$;

-- ---------- Subida de los demas archivos: tambien respetan el cupo ----------
create or replace function public.reservar_subida(p_destino text, p_empresa_id uuid, p_nombre text, p_mime text, p_tamano bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nombre text;
  v_tope bigint := case when p_destino = 'captura' then 10485760 else 52428800 end;
  v_carpeta text;
  v_ruta text;
  v_id uuid;
  v_vence timestamptz := now() + interval '30 minutes';
  v_bucket text;
begin
  if auth.uid() is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_destino is null or p_destino not in ('documento', 'archivo_cliente', 'captura') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform private.exigir_no_ver_como();
  if not private.puede_subir_destino(p_destino, p_empresa_id) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa_id and e.estado = 'activa') then
    raise exception 'empresa_no_disponible' using errcode = 'P0001';
  end if;
  -- El nombre original solo se guarda para mostrarlo: sin separadores ni caracteres de control.
  v_nombre := btrim(regexp_replace(coalesce(p_nombre, ''), '[[:cntrl:]/\\]', '', 'g'));
  if char_length(v_nombre) not between 1 and 200 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if p_tamano is null or p_tamano < 1 or p_tamano > v_tope then
    raise exception 'archivo_demasiado_grande' using errcode = 'P0001';
  end if;
  perform private.exigir_cupo(p_empresa_id, p_tamano);
  if p_mime is null or not (p_mime = any (case when p_destino = 'captura' then private.tipos_de_captura() else private.tipos_permitidos() end)) then
    raise exception 'tipo_no_permitido' using errcode = 'P0001';
  end if;
  if (select count(*) from public.subidas_reservadas s where s.user_id = auth.uid() and s.creada_en > now() - interval '1 hour') >= 60 then
    raise exception 'demasiadas_subidas' using errcode = 'P0001';
  end if;
  v_bucket := case p_destino when 'documento' then 'documentos' when 'archivo_cliente' then 'archivos-empresa' else 'capturas-revisiones' end;
  v_carpeta := case p_destino when 'documento' then 'documentos' when 'archivo_cliente' then 'archivos' else 'capturas' end;
  v_ruta := p_empresa_id::text || '/' || v_carpeta || '/' || gen_random_uuid()::text || '.' || private.extension_de_tipo(p_mime);
  insert into public.subidas_reservadas (empresa_id, user_id, destino, bucket_id, ruta, nombre_original, mime_type, tamano_bytes, vence_en)
  values (p_empresa_id, auth.uid(), p_destino, v_bucket, v_ruta, v_nombre, p_mime, p_tamano, v_vence)
  returning id into v_id;
  return jsonb_build_object('reserva_id', v_id, 'bucket', v_bucket, 'ruta', v_ruta, 'vence_en', v_vence,
                            'tamano_maximo', v_tope);
end $$;

-- ---------- 3) Archivos "archivados" ----------
-- proyectos.cerrado_en: cuando el proyecto pasa a terminado o cancelado (si se reabre, se borra).
alter table public.proyectos add column cerrado_en timestamptz;
update public.proyectos set cerrado_en = actualizado_en where estado in ('terminado', 'cancelado');
create function private.trg_proyecto_cerrado_en() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.estado in ('terminado', 'cancelado') then
    if old.estado not in ('terminado', 'cancelado') or new.cerrado_en is null then new.cerrado_en := coalesce(old.cerrado_en, now()); end if;
    if old.estado not in ('terminado', 'cancelado') then new.cerrado_en := now(); end if;
  else
    new.cerrado_en := null;
  end if;
  return new;
end $$;
create trigger proyectos_cerrado_en before update of estado on public.proyectos
  for each row execute function private.trg_proyecto_cerrado_en();

create table public.archivos_archivados (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references public.empresas (id),
  proyecto_id              uuid,
  origen_tabla             text not null check (origen_tabla in ('documento_versiones', 'archivos_cliente', 'ticket_adjuntos')),
  origen_id                uuid not null,
  bucket_id                text not null,
  storage_path             text not null check (char_length(storage_path) <= 300),
  nombre_original          text not null,
  tamano_bytes             bigint not null check (tamano_bytes >= 1),
  -- marcado: toca archivarlo · trasladado: ya esta en el archivo externo (y verificado) · borrado_de_supabase: ya no ocupa espacio ·
  -- recuperacion_pedida: alguien lo pidio de vuelta · recuperado: volvio a Supabase · error: algo fallo (ver ultimo_error)
  estado                   text not null default 'marcado'
                             check (estado in ('marcado', 'trasladado', 'borrado_de_supabase', 'recuperacion_pedida', 'recuperado', 'error')),
  ubicacion_externa        text check (ubicacion_externa is null or (char_length(ubicacion_externa) between 3 and 500 and ubicacion_externa !~ '[[:cntrl:]]')),
  huella_sha256            text check (huella_sha256 is null or huella_sha256 ~ '^[0-9a-f]{64}$'),
  marcado_en               timestamptz not null default now(),
  trasladado_en            timestamptz,
  borrado_supabase_en      timestamptz,
  recuperacion_pedida_en   timestamptz,
  recuperado_en            timestamptz,
  ultimo_error             text check (ultimo_error is null or char_length(ultimo_error) <= 300),
  actualizado_en           timestamptz not null default now(),
  constraint archivados_ruta_unica unique (bucket_id, storage_path),
  constraint archivados_origen_unico unique (origen_tabla, origen_id),
  constraint archivados_ubicacion_coherente check (estado in ('marcado', 'error') or ubicacion_externa is not null),
  constraint archivados_borrado_exige_huella check (estado <> 'borrado_de_supabase' or huella_sha256 is not null)
);
create index archivados_empresa_idx on public.archivos_archivados (empresa_id, estado);
create trigger archivados_actualizado before update on public.archivos_archivados for each row execute function private.poner_actualizado_en();
create trigger archivados_empresa_fija before update on public.archivos_archivados for each row execute function private.empresa_id_inmutable();
create trigger archivados_campos_fijos before update on public.archivos_archivados
  for each row execute function private.campos_inmutables('id', 'empresa_id', 'proyecto_id', 'origen_tabla', 'origen_id', 'bucket_id', 'storage_path', 'nombre_original', 'tamano_bytes', 'marcado_en');
create trigger archivados_sin_borrar before delete on public.archivos_archivados for each row execute function private.solo_agregar();
create trigger archivados_sin_truncar before truncate on public.archivos_archivados for each statement execute function private.solo_agregar();

-- Marca para archivar los archivos de proyectos cerrados hace mas de N dias (30 por defecto; "documentos", "archivos de la
-- empresa" y "adjuntos de tickets"). Solo ANOTA: no mueve ni borra nada. Facturas y comprobantes de pago NO se archivan.
-- La corre la tarea diaria (clave de sistema) o el super admin.
create function public.marcar_para_archivar(p_dias integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dias integer := coalesce(p_dias, (select (g.valor ->> 'dias_tras_cierre')::int from public.configuracion g where g.clave = 'archivo_externo'), 30);
  v_n integer;
begin
  if auth.uid() is not null then
    perform private.exigir_super_admin();
    perform private.exigir_no_ver_como();
  end if;
  if v_dias < 1 then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  with candidatos as (
    select dv.empresa_id, d.proyecto_id, 'documento_versiones' as origen_tabla, dv.id as origen_id, dv.bucket_id, dv.storage_path,
           dv.nombre_original, dv.tamano_bytes
      from public.documento_versiones dv join public.documentos d on d.id = dv.documento_id and d.empresa_id = dv.empresa_id
     where d.proyecto_id is not null
    union all
    select a.empresa_id, a.proyecto_id, 'archivos_cliente', a.id, a.bucket_id, a.storage_path, a.nombre_original, a.tamano_bytes
      from public.archivos_cliente a where a.proyecto_id is not null and a.borrado_en is null
    union all
    select j.empresa_id, t.proyecto_id, 'ticket_adjuntos', j.id, 'portal-tickets', j.storage_path, j.nombre_original, j.tamano_bytes
      from public.ticket_adjuntos j join public.tickets t on t.id = j.ticket_id and t.empresa_id = j.empresa_id
     where t.proyecto_id is not null
  ), ins as (
    insert into public.archivos_archivados (empresa_id, proyecto_id, origen_tabla, origen_id, bucket_id, storage_path, nombre_original, tamano_bytes)
    select c.empresa_id, c.proyecto_id, c.origen_tabla, c.origen_id, c.bucket_id, c.storage_path, c.nombre_original, c.tamano_bytes
      from candidatos c join public.proyectos p on p.id = c.proyecto_id and p.empresa_id = c.empresa_id
     where p.estado in ('terminado', 'cancelado') and p.cerrado_en < now() - make_interval(days => v_dias)
    on conflict do nothing
    returning 1
  )
  select count(*) into v_n from ins;
  if v_n > 0 then
    perform private.registrar(null, 'archivos_marcados_para_archivar', 'archivos_archivados', null, jsonb_build_object('cantidad', v_n, 'dias', v_dias));
  end if;
  return jsonb_build_object('marcados', v_n, 'dias', v_dias);
end $$;

-- ---- Funciones del script de traslado (scripts/archivo-externo-hostinger.sh): solo service_role ----
create function public.archivos_por_trasladar(p_limite integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'accion', case a.estado when 'marcado' then 'archivar' else 'recuperar' end,
            'empresa_id', a.empresa_id, 'bucket', a.bucket_id, 'ruta', a.storage_path, 'tamano_bytes', a.tamano_bytes,
            'ubicacion_externa', a.ubicacion_externa, 'huella_sha256', a.huella_sha256) order by a.marcado_en)
     from (select * from public.archivos_archivados where estado in ('marcado', 'recuperacion_pedida')
            order by marcado_en limit least(greatest(coalesce(p_limite, 50), 1), 500)) a), '[]'::jsonb);
end $$;

-- Los ya trasladados y verificados (con huella): los candidatos a quitar de Supabase.
create function public.archivos_por_borrar(p_limite integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'bucket', a.bucket_id, 'ruta', a.storage_path) order by a.trasladado_en)
     from (select * from public.archivos_archivados where estado = 'trasladado' and huella_sha256 is not null
            order by trasladado_en limit least(greatest(coalesce(p_limite, 50), 1), 500)) a), '[]'::jsonb);
end $$;

create function public.archivo_trasladado(p_id uuid, p_ubicacion text, p_huella text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  update public.archivos_archivados set estado = 'trasladado', ubicacion_externa = p_ubicacion, huella_sha256 = lower(p_huella),
         trasladado_en = now(), ultimo_error = null
   where id = p_id and estado in ('marcado', 'error');
  if not found then raise exception 'archivo_no_encontrado' using errcode = 'P0001'; end if;
end $$;

create function public.archivo_borrado_de_supabase(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  update public.archivos_archivados set estado = 'borrado_de_supabase', borrado_supabase_en = now()
   where id = p_id and estado = 'trasladado' and huella_sha256 is not null;
  if not found then raise exception 'archivo_no_encontrado' using errcode = 'P0001'; end if;
end $$;

create function public.archivo_recuperado(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  update public.archivos_archivados set estado = 'recuperado', recuperado_en = now(), ultimo_error = null
   where id = p_id and estado = 'recuperacion_pedida';
  if not found then raise exception 'archivo_no_encontrado' using errcode = 'P0001'; end if;
end $$;

create function public.archivo_con_error(p_id uuid, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  update public.archivos_archivados set ultimo_error = left(regexp_replace(coalesce(p_error, ''), '[^A-Za-z0-9_ .:-]', '', 'g'), 300),
         estado = case when estado = 'marcado' then 'error' else estado end
   where id = p_id and estado in ('marcado', 'recuperacion_pedida');
end $$;

-- "Se recuperan a pedido": el super admin o el admin del cliente piden un archivo de vuelta.
create function public.pedir_recuperar_archivo(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.archivos_archivados;
begin
  if auth.uid() is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  perform private.exigir_no_ver_como();
  select * into a from public.archivos_archivados x where x.id = p_id
     and (private.es_super_admin() or (x.empresa_id = private.mi_empresa_id() and private.soy_admin_cliente()));
  if not found then raise exception 'archivo_no_encontrado' using errcode = 'P0001'; end if;
  if a.estado not in ('trasladado', 'borrado_de_supabase') then raise exception 'archivo_no_archivado' using errcode = 'P0001'; end if;
  update public.archivos_archivados set estado = 'recuperacion_pedida', recuperacion_pedida_en = now() where id = a.id;
  perform private.registrar(a.empresa_id, 'archivo_recuperacion_pedida', 'archivos_archivados', a.id::text, '{}'::jsonb);
  return jsonb_build_object('archivo_id', a.id, 'estado', 'recuperacion_pedida');
end $$;

-- ---------- 4) Resumen del registro de actividad ----------
create table public.registro_actividad_resumen (
  id          bigint generated always as identity primary key,
  empresa_id  uuid references public.empresas (id),
  mes         date not null check (extract(day from mes) = 1),
  accion      text not null,
  entidad     text not null,
  cantidad    integer not null check (cantidad >= 1),
  primera_en  timestamptz not null,
  ultima_en   timestamptz not null,
  creado_en   timestamptz not null default now()
);
create unique index registro_resumen_unico on public.registro_actividad_resumen (empresa_id, mes, accion, entidad) nulls not distinct;
create trigger registro_resumen_empresa_fija before update on public.registro_actividad_resumen
  for each row execute function private.empresa_id_inmutable();
create trigger registro_resumen_solo_agregar before update or delete on public.registro_actividad_resumen
  for each row execute function private.solo_agregar();
create trigger registro_resumen_sin_truncar before truncate on public.registro_actividad_resumen
  for each statement execute function private.solo_agregar();

-- El registro detallado sigue siendo de solo agregar; la UNICA excepcion es esta funcion de resumen, que activa una
-- marca interna solo durante su propio borrado (y solo borra lo que ya quedo resumido).
create function private.registro_solo_agregar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('ws.resumen_registro', true) = 'si' then return old; end if;
  raise exception 'tabla_solo_agregar: %', tg_table_name using errcode = '42501';
end $$;
drop trigger registro_actividad_solo_agregar on public.registro_actividad;
create trigger registro_actividad_solo_agregar before update or delete on public.registro_actividad
  for each row execute function private.registro_solo_agregar();

-- Resume por mes, empresa, accion y entidad lo que tiene mas de N meses (12 por defecto). El resumen se crea SIEMPRE.
-- El detalle solo se borra si configuracion('registro_resumen').borrar_detalle es true: esta apagado hasta que el dueño
-- lo apruebe por escrito (CLAUDE.md: nada se borra sin su aprobacion).
create function public.resumir_registro_actividad(p_meses integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_meses integer := coalesce(p_meses, (select (g.valor ->> 'meses')::int from public.configuracion g where g.clave = 'registro_resumen'), 12);
  v_borrar boolean := coalesce((select (g.valor ->> 'borrar_detalle')::boolean from public.configuracion g where g.clave = 'registro_resumen'), false);
  v_corte timestamptz;
  v_resumidos integer; v_borrados integer := 0;
begin
  if auth.uid() is not null then
    perform private.exigir_super_admin();
    perform private.exigir_no_ver_como();
  end if;
  if v_meses < 1 then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  -- Solo meses completos: el corte es el primer dia del mes de hace N meses (hora de Colombia).
  v_corte := date_trunc('month', (now() at time zone 'America/Bogota') - make_interval(months => v_meses)) at time zone 'America/Bogota';
  with ins as (
    insert into public.registro_actividad_resumen (empresa_id, mes, accion, entidad, cantidad, primera_en, ultima_en)
    select r.empresa_id, date_trunc('month', r.creado_en at time zone 'America/Bogota')::date, r.accion, r.entidad,
           count(*), min(r.creado_en), max(r.creado_en)
      from public.registro_actividad r where r.creado_en < v_corte
     group by 1, 2, 3, 4
    on conflict do nothing
    returning 1
  ) select count(*) into v_resumidos from ins;
  if v_borrar then
    perform set_config('ws.resumen_registro', 'si', true);
    delete from public.registro_actividad r where r.creado_en < v_corte
       and exists (select 1 from public.registro_actividad_resumen s
                    where s.empresa_id is not distinct from r.empresa_id and s.accion = r.accion and s.entidad = r.entidad
                      and s.mes = date_trunc('month', r.creado_en at time zone 'America/Bogota')::date);
    get diagnostics v_borrados = row_count;
    perform set_config('ws.resumen_registro', 'no', true);
  end if;
  return jsonb_build_object('resumenes_nuevos', v_resumidos, 'detalle_borrado', v_borrados, 'borrar_detalle', v_borrar, 'corte', v_corte);
end $$;

-- ---------- Permisos, RLS y cerraduras de las tablas nuevas ----------
alter table public.cupos_espacio enable row level security;
alter table public.ticket_enlaces_video enable row level security;
alter table public.archivos_archivados enable row level security;
alter table public.registro_actividad_resumen enable row level security;
revoke all on public.cupos_espacio, public.ticket_enlaces_video, public.archivos_archivados, public.registro_actividad_resumen
  from anon, authenticated, service_role;
grant select on public.cupos_espacio, public.ticket_enlaces_video, public.archivos_archivados, public.registro_actividad_resumen to authenticated;

create policy cupos_leer on public.cupos_espacio for select to authenticated using ((select private.es_super_admin()));
create policy resumen_registro_leer on public.registro_actividad_resumen for select to authenticated using ((select private.es_super_admin()));
create policy enlaces_video_leer on public.ticket_enlaces_video for select to authenticated
  using ((select private.es_super_admin())
         or (exists (select 1 from public.tickets t where t.id = ticket_id and t.empresa_id = ticket_enlaces_video.empresa_id)
             and (mensaje_id is null or exists (select 1 from public.ticket_mensajes m where m.id = mensaje_id and m.empresa_id = ticket_enlaces_video.empresa_id))));
-- Cada quien ve la lista de lo archivado que ya podia ver (las politicas de la tabla de origen se aplican a la subconsulta).
create policy archivados_leer on public.archivos_archivados for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id())
             and case origen_tabla
                   when 'archivos_cliente' then exists (select 1 from public.archivos_cliente a where a.id = origen_id)
                   when 'documento_versiones' then exists (select 1 from public.documento_versiones v where v.id = origen_id)
                   when 'ticket_adjuntos' then exists (select 1 from public.ticket_adjuntos j where j.id = origen_id)
                   else false end));

do $$
declare t text;
begin
  foreach t in array array['cupos_espacio', 'ticket_enlaces_video', 'archivos_archivados', 'registro_actividad_resumen'] loop
    execute format('create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.%I
                    for each statement execute function private.bloquear_escritura_ver_como()', t);
  end loop;
end $$;

revoke all on function private.espacio_usado(uuid), private.cupo_de(uuid), private.exigir_cupo(uuid, bigint), private.revisar_cupo(uuid),
  private.trg_revisar_cupo(), private.cupo_permite_subida(text, text), private.trg_proyecto_cerrado_en(), private.registro_solo_agregar()
  from public, anon, authenticated, service_role;
grant execute on function private.cupo_permite_subida(text, text) to authenticated;
revoke all on function public.fijar_cupo_espacio(uuid, bigint), public.espacio_de_empresa(uuid), public.espacio_por_empresas(),
  public.agregar_enlace_video_ticket(uuid, text, uuid), public.marcar_para_archivar(integer), public.pedir_recuperar_archivo(uuid),
  public.resumir_registro_actividad(integer), public.archivos_por_trasladar(integer), public.archivos_por_borrar(integer), public.archivo_trasladado(uuid, text, text),
  public.archivo_borrado_de_supabase(uuid), public.archivo_recuperado(uuid), public.archivo_con_error(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.fijar_cupo_espacio(uuid, bigint), public.espacio_de_empresa(uuid), public.espacio_por_empresas(),
  public.agregar_enlace_video_ticket(uuid, text, uuid), public.pedir_recuperar_archivo(uuid) to authenticated;
grant execute on function public.marcar_para_archivar(integer), public.resumir_registro_actividad(integer) to authenticated, service_role;
grant execute on function public.archivos_por_trasladar(integer), public.archivos_por_borrar(integer), public.archivo_trasladado(uuid, text, text),
  public.archivo_borrado_de_supabase(uuid), public.archivo_recuperado(uuid), public.archivo_con_error(uuid, text) to service_role;
-- preparar_adjunto_ticket y reservar_subida conservan sus permisos (create or replace no los cambia).
