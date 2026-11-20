-- Integracion · UNA sola cola de avisos por correo. Equipo Websourcing · Desarrollo
--
-- Antes habia dos: `outbox_correos` (tickets y mantenimiento) y `avisos_salientes` (dinero). Queda UNA:
-- `avisos_salientes`. Regla de Calidad: la cola guarda SOLO identificadores, tipo y referencia (mas cifras y
-- fechas del sistema); nunca texto libre del cliente, ni el correo de nadie (se resuelve al enviar, con datos al dia).
--
-- A quien va un aviso (`destino`):
--   usuario         -> `destinatario_user_id` (una persona concreta)
--   super_admin     -> todos los super admin activos
--   cliente_admin   -> los admin de la empresa
--   cliente_dinero  -> los admin y quienes tienen "ver dinero" en la empresa
--   cliente_aprobador -> los admin y quienes tienen "aprobar" en la empresa (revisiones)
-- Estados: pendiente -> enviando -> enviado | (error) pendiente con reintento | fallido (5 intentos) |
--          pendiente_sin_proveedor (no hay RESEND_API_KEY; sale cuando exista) | cancelado (sin destinatarios).
-- Quien la vacia es el despachador del servidor (lib/servidor/avisos/) con la clave de sistema, SOLO por las
-- funciones de abajo; ademas service_role puede leer la cola y cambiar sus columnas de estado (nada mas).

-- ---------- 1) La tabla unica ----------
alter table public.avisos_salientes
  add column destinatario_user_id uuid references public.perfiles (user_id),
  add column reclamado_hasta timestamptz;

alter table public.avisos_salientes drop constraint avisos_salientes_tipo_check;
alter table public.avisos_salientes add constraint avisos_salientes_tipo_check check (tipo ~ '^[a-z][a-z0-9_]{2,59}$');
alter table public.avisos_salientes drop constraint avisos_salientes_destino_check;
alter table public.avisos_salientes add constraint avisos_salientes_destino_check
  check (destino in ('usuario', 'super_admin', 'cliente_dinero', 'cliente_admin', 'cliente_aprobador'));
alter table public.avisos_salientes add constraint avisos_destino_usuario_coherente
  check ((destino = 'usuario') = (destinatario_user_id is not null));
alter table public.avisos_salientes drop constraint avisos_salientes_estado_check;
alter table public.avisos_salientes add constraint avisos_salientes_estado_check
  check (estado in ('pendiente', 'enviando', 'pendiente_sin_proveedor', 'enviado', 'fallido', 'cancelado'));
-- Sin texto libre: solo ids y cifras. Estas llaves jamas entran a la cola (Calidad lo exigio).
alter table public.avisos_salientes add constraint avisos_datos_sin_texto_libre
  check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 2048
         and not (datos ?| array['titulo', 'texto', 'mensaje', 'nota', 'motivo', 'concepto', 'descripcion', 'nombre',
                                 'empresa_nombre', 'correo', 'token', 'enlace', 'clave']));
create index avisos_por_enviar_idx on public.avisos_salientes (programado_para)
  where estado in ('pendiente', 'pendiente_sin_proveedor', 'enviando');

drop trigger avisos_campos_fijos on public.avisos_salientes;
create trigger avisos_campos_fijos before update on public.avisos_salientes
  for each row execute function private.campos_inmutables('id', 'modulo', 'tipo', 'destino', 'destinatario_user_id',
    'referencia_id', 'clave_unica', 'datos', 'creado_en');
create trigger avisos_sin_truncar before truncate on public.avisos_salientes
  for each statement execute function private.solo_agregar();

-- ---------- 2) Lo que ya habia en outbox_correos pasa a la cola unica (sin el correo ni nada libre) ----------
insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, destinatario_user_id, referencia_id, clave_unica,
                                     datos, programado_para, estado, intentos, enviado_en, ultimo_error, creado_en)
select o.empresa_id,
       case when o.tipo like 'mantenimiento%' or o.tipo like 'horas%' then 'mantenimiento' else 'tickets' end,
       o.tipo, 'usuario', o.destinatario_user_id,
       coalesce(nullif(o.datos ->> 'ticket_id', '')::uuid, nullif(o.datos ->> 'bolsa_id', '')::uuid, nullif(o.datos ->> 'hora_id', '')::uuid),
       coalesce(o.clave_unica, 'migrado:' || o.id::text),
       o.datos - 'titulo' - 'texto' - 'mensaje' - 'nota' - 'motivo' - 'concepto' - 'descripcion' - 'nombre' - 'empresa_nombre' - 'correo' - 'token' - 'enlace' - 'clave',
       o.programado_para,
       case o.estado when 'fallo' then 'fallido' when 'omitido' then 'cancelado' else o.estado end,
       o.intentos, o.enviado_en, left(o.ultimo_error, 300), o.creado_en
  from public.outbox_correos o
 where o.empresa_id is not null and o.destinatario_user_id is not null
on conflict (clave_unica) do nothing;

-- ---------- 3) Tickets y mantenimiento encolan en la cola unica (los triggers no cambian: usan estas tres funciones) ----------
create or replace function private.encolar_correo(p_empresa uuid, p_tipo text, p_user uuid, p_datos jsonb, p_clave text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.perfiles p where p.user_id = p_user and not p.bloqueado) then return; end if;
  if not exists (select 1 from public.super_admins s where s.user_id = p_user)
     and not exists (select 1 from public.miembros m
                      where m.user_id = p_user and m.empresa_id = p_empresa
                        and m.quitado_en is null and not m.bloqueado) then
    return;
  end if;
  insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, destinatario_user_id, referencia_id, clave_unica, datos)
  values (p_empresa,
          case when p_tipo like 'mantenimiento%' or p_tipo like 'horas%' then 'mantenimiento' else 'tickets' end,
          p_tipo, 'usuario', p_user,
          coalesce(nullif(p_datos ->> 'ticket_id', '')::uuid, nullif(p_datos ->> 'bolsa_id', '')::uuid, nullif(p_datos ->> 'hora_id', '')::uuid),
          p_clave, coalesce(p_datos, '{}'::jsonb))
  on conflict (clave_unica) do nothing;
end $$;

-- ---------- 4) Dinero: la cola ya no lleva textos (concepto, motivo, nombre de la empresa) ----------
-- El despachador arma el correo con el nombre de la empresa que lee de la base y con la referencia (ids).
create or replace function private.trg_avisos_comprobantes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_moneda text;
begin
  select c.moneda into v_moneda
    from public.pagos_programados p join public.contratos c on c.id = p.contrato_id
   where p.id = new.pago_programado_id;
  if tg_op = 'INSERT' then
    insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
    values (new.empresa_id, 'dinero', 'comprobante_recibido', 'super_admin', new.id, 'comprobante_recibido:' || new.id,
            jsonb_build_object('pago_id', new.pago_programado_id, 'valor', new.valor_declarado, 'moneda', v_moneda));
  elsif new.estado = 'rechazado' then
    insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
    values (new.empresa_id, 'dinero', 'comprobante_rechazado', 'cliente_dinero', new.id, 'comprobante_rechazado:' || new.id,
            jsonb_build_object('pago_id', new.pago_programado_id));
  elsif new.estado = 'confirmado' then
    insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
    values (new.empresa_id, 'dinero', 'comprobante_confirmado', 'cliente_dinero', new.id, 'comprobante_confirmado:' || new.id,
            jsonb_build_object('pago_id', new.pago_programado_id, 'moneda', v_moneda,
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
    select p.id, p.empresa_id, p.valor, p.vence_el, c.moneda,
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
           jsonb_build_object('pago_id', p.id, 'pendiente', p.pendiente, 'moneda', p.moneda, 'vence_el', p.vence_el) as datos
      from pendientes p
    union all
    select p.empresa_id, p.tipo, 'super_admin', p.id, p.tipo || ':super_admin:' || p.id || ':' || p.vence_el,
           jsonb_build_object('pago_id', p.id, 'pendiente', p.pendiente, 'moneda', p.moneda, 'vence_el', p.vence_el)
      from pendientes p where p.tipo = 'pago_vencido'
  )
  insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
  select empresa_id, 'dinero', tipo, destino, ref, clave, datos from avisos
  on conflict (clave_unica) do nothing;
  get diagnostics v_k = row_count;
  v_n := v_k;
  return jsonb_build_object('avisos_nuevos', v_n, 'fecha', v_hoy);
end $$;

-- ---------- 5) Adios a outbox_correos ----------
drop table public.outbox_correos;

-- ---------- 6) Quien recibe cada aviso (se resuelve AL ENVIAR, con los datos al dia) ----------
create function private.destinatarios_aviso(p_destino text, p_empresa uuid, p_usuario uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'nombre', x.nombre, 'correo', x.correo) order by x.correo), '[]'::jsonb)
    from (
      select p.user_id, p.nombre, p.correo
        from public.perfiles p
       where not p.bloqueado
         and case p_destino
               when 'super_admin' then exists (select 1 from public.super_admins s where s.user_id = p.user_id)
               when 'usuario' then p.user_id = p_usuario
                  and (exists (select 1 from public.super_admins s where s.user_id = p.user_id)
                       or exists (select 1 from public.miembros m join public.empresas e on e.id = m.empresa_id
                                   where m.user_id = p.user_id and m.empresa_id = p_empresa and e.estado = 'activa'
                                     and m.quitado_en is null and not m.bloqueado))
               when 'cliente_admin' then exists (select 1 from public.miembros m join public.empresas e on e.id = m.empresa_id
                                                  where m.user_id = p.user_id and m.empresa_id = p_empresa and e.estado = 'activa'
                                                    and m.quitado_en is null and not m.bloqueado and m.rol = 'admin_cliente')
               when 'cliente_dinero' then exists (select 1 from public.miembros m join public.empresas e on e.id = m.empresa_id
                                                   where m.user_id = p.user_id and m.empresa_id = p_empresa and e.estado = 'activa'
                                                     and m.quitado_en is null and not m.bloqueado and (m.rol = 'admin_cliente' or m.ver_dinero))
               when 'cliente_aprobador' then exists (select 1 from public.miembros m join public.empresas e on e.id = m.empresa_id
                                                      where m.user_id = p.user_id and m.empresa_id = p_empresa and e.estado = 'activa'
                                                        and m.quitado_en is null and not m.bloqueado and (m.rol = 'admin_cliente' or m.aprobar))
               else false end
    ) x
$$;

-- ---------- 7) Funciones del despachador: SOLO service_role (clave de sistema, sin usuario) ----------
-- Toma los avisos que ya tocan, de a pocos y sin pisarse con otra corrida (skip locked), los pasa a "enviando" por 10
-- minutos (si el servidor se cae a medio camino, vuelven a salir) y devuelve cada uno con sus destinatarios.
create function public.reclamar_avisos(p_limite integer default 25) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  p_limite := least(greatest(coalesce(p_limite, 25), 1), 100);
  -- Un aviso que se quedo "enviando" y ya gasto sus 5 intentos no vuelve a salir.
  update public.avisos_salientes set estado = 'fallido', reclamado_hasta = null, ultimo_error = 'intentos_agotados'
   where estado = 'enviando' and reclamado_hasta < now() and intentos >= 5;
  with tomados as (
    select id from public.avisos_salientes
     where programado_para <= now()
       and (estado in ('pendiente', 'pendiente_sin_proveedor') or (estado = 'enviando' and reclamado_hasta < now()))
     order by programado_para, creado_en
     limit p_limite
       for update skip locked
  ), marcados as (
    update public.avisos_salientes a
       set estado = 'enviando', intentos = a.intentos + 1, reclamado_hasta = now() + interval '10 minutes'
      from tomados t where a.id = t.id
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'modulo', m.modulo, 'tipo', m.tipo, 'destino', m.destino, 'referencia_id', m.referencia_id,
           'empresa_id', m.empresa_id, 'empresa_nombre', (select e.nombre from public.empresas e where e.id = m.empresa_id),
           'datos', m.datos, 'intentos', m.intentos,
           'destinatarios', private.destinatarios_aviso(m.destino, m.empresa_id, m.destinatario_user_id)) order by m.programado_para), '[]'::jsonb)
    into v from marcados m;
  return v;
end $$;

-- Resultado de cada envio. 'enviado' | 'error' (reintenta con espera creciente; al 5.o intento queda fallido) |
-- 'sin_proveedor' (no se cuenta el intento) | 'omitido' (nadie a quien avisarle).
create function public.marcar_aviso(p_id uuid, p_resultado text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.avisos_salientes;
        v_err text := left(regexp_replace(coalesce(p_error, ''), '[^A-Za-z0-9_ .:-]', '', 'g'), 300);
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into a from public.avisos_salientes where id = p_id and estado = 'enviando' for update;
  if not found then return; end if;
  if p_resultado = 'enviado' then
    update public.avisos_salientes set estado = 'enviado', enviado_en = now(), reclamado_hasta = null, ultimo_error = null where id = a.id;
  elsif p_resultado = 'error' then
    if a.intentos >= 5 then
      update public.avisos_salientes set estado = 'fallido', reclamado_hasta = null, ultimo_error = nullif(v_err, '') where id = a.id;
    else
      update public.avisos_salientes set estado = 'pendiente', reclamado_hasta = null, ultimo_error = nullif(v_err, ''),
             programado_para = now() + (interval '5 minutes' * power(3, a.intentos - 1)) where id = a.id;
    end if;
  elsif p_resultado = 'sin_proveedor' then
    update public.avisos_salientes set estado = 'pendiente_sin_proveedor', intentos = greatest(a.intentos - 1, 0), reclamado_hasta = null where id = a.id;
  elsif p_resultado = 'omitido' then
    update public.avisos_salientes set estado = 'cancelado', reclamado_hasta = null, ultimo_error = nullif(v_err, '') where id = a.id;
  else
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
end $$;

-- Sin proveedor de correo (no hay RESEND_API_KEY): solo anota que los avisos que ya tocan esperan al proveedor.
create function public.marcar_avisos_sin_proveedor() returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  update public.avisos_salientes set estado = 'pendiente_sin_proveedor'
   where estado = 'pendiente' and programado_para <= now();
  get diagnostics v = row_count;
  return v;
end $$;

revoke all on function private.destinatarios_aviso(text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.reclamar_avisos(integer), public.marcar_aviso(uuid, text, text), public.marcar_avisos_sin_proveedor()
  from public, anon, authenticated, service_role;
grant execute on function public.reclamar_avisos(integer), public.marcar_aviso(uuid, text, text), public.marcar_avisos_sin_proveedor()
  to service_role;

-- La clave de sistema lee la cola y cambia SOLO sus columnas de estado. No inserta, no borra, no toca ids ni datos.
grant select on public.avisos_salientes to service_role;
grant update (estado, intentos, enviado_en, ultimo_error, programado_para, reclamado_hasta) on public.avisos_salientes to service_role;
