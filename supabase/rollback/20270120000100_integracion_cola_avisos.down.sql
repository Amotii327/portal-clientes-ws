-- Rollback de la integracion · cola unica de avisos. Deja las dos colas como antes (outbox_correos y avisos_salientes de dinero).
-- Los avisos para personas concretas (destino 'usuario') vuelven a outbox_correos con el correo de su perfil.
revoke select on public.avisos_salientes from service_role;
revoke update (estado, intentos, enviado_en, ultimo_error, programado_para, reclamado_hasta) on public.avisos_salientes from service_role;
drop function if exists public.marcar_avisos_sin_proveedor();
drop function if exists public.marcar_aviso(uuid, text, text);
drop function if exists public.reclamar_avisos(integer);
drop function if exists private.destinatarios_aviso(text, uuid, uuid);

create table public.outbox_correos (
  id                  bigint generated always as identity primary key,
  empresa_id          uuid references public.empresas (id),
  tipo                text not null check (tipo ~ '^[a-z][a-z0-9_]{2,59}$'),
  destinatario_user_id uuid references public.perfiles (user_id),
  destinatario_correo text not null check (destinatario_correo = lower(destinatario_correo)
                          and char_length(destinatario_correo) <= 254
                          and destinatario_correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Solo identificadores y datos cortos para armar el texto; nunca claves ni contenido de adjuntos.
  datos               jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 8192),
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'fallo', 'omitido')),
  intentos            smallint not null default 0 check (intentos >= 0),
  clave_unica         text check (clave_unica is null or char_length(clave_unica) <= 200),
  programado_para     timestamptz not null default now(),
  enviado_en          timestamptz,
  ultimo_error        text check (ultimo_error is null or char_length(ultimo_error) <= 500),
  creado_en           timestamptz not null default now(),
  constraint outbox_enviado_coherente check ((estado = 'enviado') = (enviado_en is not null))
);
create unique index outbox_correos_clave_unica on public.outbox_correos (clave_unica) where clave_unica is not null;
create index outbox_correos_pendientes_idx on public.outbox_correos (programado_para) where estado = 'pendiente';
create index outbox_correos_empresa_idx on public.outbox_correos (empresa_id, creado_en desc);

create trigger outbox_correos_empresa_fija before update on public.outbox_correos
  for each row execute function private.empresa_id_inmutable();
create trigger outbox_correos_campos_fijos before update on public.outbox_correos
  for each row execute function private.campos_inmutables('id', 'tipo', 'destinatario_user_id', 'destinatario_correo', 'datos', 'clave_unica', 'creado_en');

insert into public.outbox_correos (empresa_id, tipo, destinatario_user_id, destinatario_correo, datos, estado, intentos, clave_unica,
                                   programado_para, enviado_en, ultimo_error, creado_en)
select a.empresa_id, a.tipo, a.destinatario_user_id, p.correo, a.datos,
       case a.estado when 'fallido' then 'fallo' when 'cancelado' then 'omitido' when 'enviado' then 'enviado' else 'pendiente' end,
       a.intentos, a.clave_unica, a.programado_para, a.enviado_en, a.ultimo_error, a.creado_en
  from public.avisos_salientes a join public.perfiles p on p.user_id = a.destinatario_user_id
 where a.destino = 'usuario';
alter table public.outbox_correos enable row level security;
revoke all on public.outbox_correos from anon, authenticated, service_role;
grant select on public.outbox_correos to authenticated;
create policy outbox_leer on public.outbox_correos for select to authenticated using ((select private.es_super_admin()));
create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.outbox_correos
  for each statement execute function private.bloquear_escritura_ver_como();
create trigger outbox_sin_borrar_ni_truncar before truncate on public.outbox_correos
  for each statement execute function private.solo_agregar();

create or replace function private.encolar_correo(p_empresa uuid, p_tipo text, p_user uuid, p_datos jsonb, p_clave text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_correo text;
begin
  select p.correo into v_correo from public.perfiles p where p.user_id = p_user and not p.bloqueado;
  if v_correo is null then return; end if;
  if not exists (select 1 from public.super_admins s where s.user_id = p_user)
     and not exists (select 1 from public.miembros m
                      where m.user_id = p_user and m.empresa_id = p_empresa
                        and m.quitado_en is null and not m.bloqueado) then
    return;
  end if;
  insert into public.outbox_correos (empresa_id, tipo, destinatario_user_id, destinatario_correo, datos, clave_unica)
  values (p_empresa, p_tipo, p_user, v_correo, coalesce(p_datos, '{}'::jsonb), p_clave)
  on conflict (clave_unica) where clave_unica is not null do nothing;
end $$;

drop trigger avisos_sin_truncar on public.avisos_salientes;
drop trigger avisos_campos_fijos on public.avisos_salientes;
delete from public.avisos_salientes where destino = 'usuario';
update public.avisos_salientes set estado = 'pendiente' where estado in ('enviando', 'pendiente_sin_proveedor');
drop index public.avisos_por_enviar_idx;
alter table public.avisos_salientes drop constraint avisos_datos_sin_texto_libre;
alter table public.avisos_salientes drop constraint avisos_destino_usuario_coherente;
alter table public.avisos_salientes drop constraint avisos_salientes_estado_check;
alter table public.avisos_salientes add constraint avisos_salientes_estado_check check (estado in ('pendiente', 'enviado', 'fallido', 'cancelado'));
alter table public.avisos_salientes drop constraint avisos_salientes_destino_check;
alter table public.avisos_salientes add constraint avisos_salientes_destino_check check (destino in ('super_admin', 'cliente_dinero', 'cliente_admin'));
alter table public.avisos_salientes drop constraint avisos_salientes_tipo_check;
alter table public.avisos_salientes add constraint avisos_salientes_tipo_check check (tipo ~ '^[a-z][a-z_]{2,59}$');
alter table public.avisos_salientes drop column reclamado_hasta, drop column destinatario_user_id;
create trigger avisos_campos_fijos before update on public.avisos_salientes
  for each row execute function private.campos_inmutables('id', 'modulo', 'tipo', 'destino', 'referencia_id', 'clave_unica', 'datos', 'creado_en');

create or replace function private.trg_avisos_comprobantes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_concepto text; v_empresa text; v_moneda text;
begin
  select p.concepto, e.nombre, c.moneda into v_concepto, v_empresa, v_moneda
    from public.pagos_programados p join public.contratos c on c.id = p.contrato_id
    join public.empresas e on e.id = p.empresa_id
   where p.id = new.pago_programado_id;
  if tg_op = 'INSERT' then
    insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
    values (new.empresa_id, 'dinero', 'comprobante_recibido', 'super_admin', new.id, 'comprobante_recibido:' || new.id,
            jsonb_build_object('empresa_nombre', v_empresa, 'concepto', v_concepto, 'valor', new.valor_declarado, 'moneda', v_moneda));
  elsif new.estado = 'rechazado' then
    insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
    values (new.empresa_id, 'dinero', 'comprobante_rechazado', 'cliente_dinero', new.id, 'comprobante_rechazado:' || new.id,
            jsonb_build_object('concepto', v_concepto, 'motivo', new.motivo_rechazo));
  elsif new.estado = 'confirmado' then
    insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
    values (new.empresa_id, 'dinero', 'comprobante_confirmado', 'cliente_dinero', new.id, 'comprobante_confirmado:' || new.id,
            jsonb_build_object('concepto', v_concepto, 'moneda', v_moneda,
              'valor', (select a.valor from public.abonos a where a.id = new.abono_id)));
  end if;
  return null;
end $$;

create or replace function public.generar_recordatorios_pago() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_hoy date := private.hoy(); v_n int := 0; v_k int;
begin
  -- Solo tiene permiso de ejecucion service_role (clave de sistema, sin usuario). Defensa extra: si llega un usuario, se rechaza.
  if auth.uid() is not null then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  with cuotas as (
    select p.id, p.empresa_id, p.concepto, p.valor, p.vence_el, c.moneda, e.nombre as empresa_nombre,
           p.valor - coalesce((select sum(a.valor) from public.abonos a where a.pago_programado_id = p.id and a.anulado_en is null), 0) as pendiente
      from public.pagos_programados p
      join public.contratos c on c.id = p.contrato_id
      join public.empresas e on e.id = p.empresa_id
     where e.estado = 'activa'
       and not exists (select 1 from public.comprobantes_pago k where k.pago_programado_id = p.id and k.estado = 'en_revision')
  ), pendientes as (
    select *, case when vence_el < v_hoy then 'pago_vencido' when vence_el = v_hoy then 'pago_vence_hoy'
                   when vence_el <= v_hoy + 3 then 'pago_por_vencer' end as tipo
      from cuotas where pendiente > 0 and vence_el <= v_hoy + 3
  ), avisos as (
    select p.empresa_id, p.tipo, 'cliente_dinero' as destino, p.id as ref, p.tipo || ':cliente:' || p.id || ':' || p.vence_el as clave,
           jsonb_build_object('concepto', p.concepto, 'pendiente', p.pendiente, 'moneda', p.moneda, 'vence_el', p.vence_el) as datos
      from pendientes p
    union all
    select p.empresa_id, p.tipo, 'super_admin', p.id, p.tipo || ':super_admin:' || p.id || ':' || p.vence_el,
           jsonb_build_object('empresa_nombre', p.empresa_nombre, 'concepto', p.concepto, 'pendiente', p.pendiente,
                              'moneda', p.moneda, 'vence_el', p.vence_el)
      from pendientes p where p.tipo = 'pago_vencido'
  )
  insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
  select empresa_id, 'dinero', tipo, destino, ref, clave, datos from avisos
  on conflict (clave_unica) do nothing;
  get diagnostics v_k = row_count;
  v_n := v_k;
  return jsonb_build_object('avisos_nuevos', v_n, 'fecha', v_hoy);
end $$;
