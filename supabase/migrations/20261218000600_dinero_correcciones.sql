-- Sprint 4 · Dinero · correcciones de Calidad (informe 2026-11-20_informe_pruebas_dinero-backend_v1):
--   M-2 bucket con tipos permitidos y comprobante validado contra el archivo REAL en Storage,
--   B-1 el aviso de confirmado dice el valor del abono confirmado,
--   B-3 hito_id no se filtra si el hito esta oculto para el cliente,
--   B-4 el abono de un comprobante debe ser del MISMO contrato (llave compuesta).
-- Equipo Websourcing · Desarrollo

-- B-4
alter table public.abonos add constraint abonos_empresa_contrato_id_unico unique (empresa_id, contrato_id, id);
alter table public.comprobantes_pago drop constraint comprobantes_abono_fk;
alter table public.comprobantes_pago add constraint comprobantes_abono_fk
  foreign key (empresa_id, contrato_id, abono_id) references public.abonos (empresa_id, contrato_id, id);

-- B-3: el hito de una cuota solo se muestra si quien pregunta puede ver ese hito (mismas reglas que la tabla hitos).
create function private.hito_de_pago(p_pago uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.hito_id
    from public.pagos_programados p join public.hitos h on h.id = p.hito_id
   where p.id = p_pago
     and (private.es_super_admin() or (p.empresa_id = private.mi_empresa_id() and h.visible))
$$;
revoke all on function private.hito_de_pago(uuid) from public, anon, authenticated, service_role;
grant execute on function private.hito_de_pago(uuid) to authenticated;
create or replace view public.v_pagos_programados with (security_invoker = true) as
select p.id as pago_id, p.empresa_id, p.contrato_id, c.proyecto_id, p.concepto, p.valor, c.moneda, p.vence_el,
       private.hito_de_pago(p.id) as hito_id, h.numero as hito_numero, h.nombre as hito_nombre,
       coalesce(a.abonado, 0) as abonado,
       greatest(p.valor - coalesce(a.abonado, 0), 0) as pendiente,
       case
         when coalesce(a.abonado, 0) >= p.valor then 'pagado'
         when exists (select 1 from public.comprobantes_pago k where k.pago_programado_id = p.id and k.estado = 'en_revision') then 'en_revision'
         when p.vence_el < private.hoy() then 'vencido'
         when p.vence_el <= private.hoy() + 3 then 'por_vencer'
         else 'pendiente'
       end as estado,
       (p.vence_el - private.hoy()) as dias_para_vencer
  from public.pagos_programados p
  join public.contratos c on c.id = p.contrato_id
  left join public.hitos h on h.id = private.hito_de_pago(p.id)
  left join lateral (select sum(x.valor) as abonado from public.abonos x
                      where x.pago_programado_id = p.id and x.anulado_en is null) a on true;


-- La columna cruda hito_id deja de ser legible en la tabla (se lee por la vista y por dinero_del_proyecto).
revoke select on public.pagos_programados from authenticated;
grant select (id, empresa_id, contrato_id, concepto, valor, vence_el, creado_en, actualizado_en) on public.pagos_programados to authenticated;

-- B-1
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


-- M-2 (bucket): solo pdf, jpg, png y webp.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $q$update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
                      public = false where id = 'dinero'$q$;
  end if;
end $$;

-- M-2 (funcion)
-- El cliente (admin o equipo con "ver dinero" Y "subir archivos") sube el soporte de una cuota suya. Queda "en revision";
-- NO crea abono. El archivo ya esta en Storage con la ruta <empresa>/comprobantes/<uuid>.<ext> que genero el servidor.
create or replace function public.subir_comprobante(
  p_pago_id uuid, p_archivo_path text, p_archivo_nombre text, p_archivo_tipo text, p_tamano_bytes integer,
  p_valor numeric, p_fecha_pago date, p_nota text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.miembros;
  v_contrato uuid; c public.contratos; p public.pagos_programados;
  v_abonado numeric; v_saldo numeric; v_id uuid; v_ext text; v_restriccion text; v_meta jsonb; v_tam integer;
begin
  if private.ver_como_activa_de(auth.uid()) then
    raise exception 'ver_como_solo_lectura' using errcode = '42501';
  end if;
  m := private.miembro_activo();
  if m is null or not (m.ver_dinero and m.subir_archivos) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  -- La cuota debe ser de MI empresa; si no existe o es de otra, el mismo mensaje (no se revela).
  select contrato_id into v_contrato from public.pagos_programados where id = p_pago_id and empresa_id = m.empresa_id;
  if not found then raise exception 'pago_no_encontrado' using errcode = 'P0001'; end if;
  c := private.contrato_para_cambio(v_contrato);
  select * into p from public.pagos_programados where id = p_pago_id;
  select coalesce(sum(valor), 0) into v_abonado from public.abonos where pago_programado_id = p.id and anulado_en is null;
  if v_abonado >= p.valor then raise exception 'pago_ya_pagado' using errcode = 'P0001'; end if;
  if exists (select 1 from public.comprobantes_pago where pago_programado_id = p.id and estado = 'en_revision') then
    raise exception 'comprobante_en_revision' using errcode = 'P0001';
  end if;
  -- No puede declarar mas de lo que falta de la cuota NI mas que el saldo del contrato (si no, el super admin no podria confirmarlo).
  select c.valor - coalesce(sum(a.valor), 0) into v_saldo from public.abonos a where a.contrato_id = c.id and a.anulado_en is null;
  if private.dinero(p_valor) > least(p.valor - v_abonado, coalesce(v_saldo, c.valor)) then
    raise exception 'valor_excede_pendiente' using errcode = 'P0001';
  end if;
  if p_fecha_pago is null or p_fecha_pago > private.hoy() then raise exception 'fechas_invalidas' using errcode = '22023'; end if;
  -- Solo PDF o imagen, de hasta 10 MB; el tipo declarado debe coincidir con la extension de la ruta.
  v_ext := case p_archivo_tipo when 'application/pdf' then 'pdf' when 'image/png' then 'png'
                               when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' else null end;
  if v_ext is null then raise exception 'archivo_invalido' using errcode = '22023'; end if;
  perform private.ruta_archivo(p_archivo_path, m.empresa_id, array['comprobantes'], array[v_ext]);
  -- Con Storage real: el archivo debe EXISTIR ya en el bucket "dinero" y su tipo y tamano REALES (no los declarados)
  -- deben ser los esperados. Asi nadie declara "100 bytes, PDF" y sube otra cosa.
  v_tam := p_tamano_bytes;
  if to_regclass('storage.objects') is not null then
    execute 'select metadata from storage.objects where bucket_id = ''dinero'' and name = $1' into v_meta using p_archivo_path;
    if v_meta is null or v_meta ->> 'mimetype' is distinct from p_archivo_tipo
       or coalesce((v_meta ->> 'size')::bigint, 0) not between 1 and 10485760 then
      raise exception 'archivo_invalido' using errcode = '22023';
    end if;
    v_tam := (v_meta ->> 'size')::integer;
  end if;
  begin
    insert into public.comprobantes_pago (empresa_id, contrato_id, pago_programado_id, valor_declarado, fecha_pago_declarada,
                                          archivo_path, archivo_nombre, archivo_tipo, tamano_bytes, nota, subido_por)
    values (m.empresa_id, c.id, p.id, p_valor, p_fecha_pago, p_archivo_path, private.texto(p_archivo_nombre, 1, 200),
            p_archivo_tipo, v_tam,
            case when p_nota is null or btrim(p_nota) = '' then null else private.texto(p_nota, 1, 500) end, m.user_id)
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'comprobantes_uno_en_revision' then
      raise exception 'comprobante_en_revision' using errcode = 'P0001';
    end if;
    raise exception 'archivo_invalido' using errcode = '22023';
  when check_violation or not_null_violation then
    raise exception 'datos_invalidos' using errcode = '22023';
  end;
  return jsonb_build_object('comprobante_id', v_id);
end $$;

