-- Sprint 4 · Dinero · Funciones RPC. Las de escritura son SECURITY DEFINER con search_path vacio y comprueban QUIEN
-- llama (super admin con 2FA y sin "ver como"; el cliente solo sube comprobantes). Las de lectura son SECURITY INVOKER
-- (respetan RLS). Los errores llevan un codigo estable en el mensaje (docs/2026-11-20_nota_backend-para-frontend_dinero_v1.md).
-- Ningun nombre empieza por "registrar" (reservado). Equipo Websourcing · Desarrollo

-- ---------- Utilidades internas ----------
-- Dinero valido: no nulo, mayor que cero, maximo 2 decimales (no se redondea en silencio) y dentro de numeric(14,2).
create function private.dinero(p numeric, p_permitir_cero boolean default false) returns numeric
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or p <> round(p, 2) or p < 0 or (p = 0 and not p_permitir_cero) or p >= 1000000000000 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  return p;
end $$;

-- Bloquea el contrato para cambiarlo (primero SIEMPRE el contrato, despues lo demas).
create function private.contrato_para_cambio(p_id uuid) returns public.contratos
language plpgsql security definer set search_path = '' as $$
declare c public.contratos;
begin
  select * into c from public.contratos where id = p_id for update;
  if not found then raise exception 'contrato_no_encontrado' using errcode = 'P0001'; end if;
  return c;
end $$;

-- Una ruta de Storage del modulo: debe ser de la empresa, de la carpeta esperada y con un uuid como nombre.
create function private.ruta_archivo(p_ruta text, p_empresa uuid, p_carpetas text[], p_exts text[]) returns text
language plpgsql immutable set search_path = '' as $$
declare v_partes text[];
begin
  v_partes := regexp_match(coalesce(p_ruta, ''),
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([a-z]+)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z]+)$');
  if v_partes is null or v_partes[1] <> p_empresa::text or not (v_partes[2] = any (p_carpetas)) or not (v_partes[3] = any (p_exts)) then
    raise exception 'archivo_invalido' using errcode = '22023';
  end if;
  return p_ruta;
end $$;

-- ---------- 1) Contrato ----------
create function public.crear_contrato(
  p_proyecto_id uuid, p_valor numeric, p_moneda text, p_anticipo numeric default 0, p_fecha_firma date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.proyectos; v_id uuid;
begin
  perform private.exigir_super_admin();
  -- El dinero se puede cobrar aunque el proyecto ya haya terminado: se permite proyecto cerrado.
  p := private.proyecto_para_cambio(p_proyecto_id, true);
  if p_moneda is null or p_moneda not in ('COP', 'USD') then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  if private.dinero(p_anticipo, true) > private.dinero(p_valor) then
    raise exception 'anticipo_excede_valor' using errcode = '22023';
  end if;
  begin
    insert into public.contratos (empresa_id, proyecto_id, valor, moneda, anticipo, fecha_firma)
    values (p.empresa_id, p.id, p_valor, p_moneda, p_anticipo, p_fecha_firma) returning id into v_id;
  exception when unique_violation then
    raise exception 'contrato_ya_existe' using errcode = 'P0001';
  when check_violation then
    raise exception 'datos_invalidos' using errcode = '22023';
  end;
  return jsonb_build_object('contrato_id', v_id);
end $$;

-- Lo nulo no cambia. La moneda solo cambia si el contrato aun no tiene cuotas ni abonos (lo vigila un trigger).
create function public.editar_contrato(
  p_contrato_id uuid, p_valor numeric default null, p_anticipo numeric default null,
  p_fecha_firma date default null, p_moneda text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare c public.contratos;
begin
  perform private.exigir_super_admin();
  c := private.contrato_para_cambio(p_contrato_id);
  if p_valor is not null then perform private.dinero(p_valor); end if;
  if p_anticipo is not null then perform private.dinero(p_anticipo, true); end if;
  if p_moneda is not null and p_moneda not in ('COP', 'USD') then raise exception 'datos_invalidos' using errcode = '22023'; end if;
  if coalesce(p_anticipo, c.anticipo) > coalesce(p_valor, c.valor) then
    raise exception 'anticipo_excede_valor' using errcode = '22023';
  end if;
  update public.contratos
     set valor = coalesce(p_valor, valor), anticipo = coalesce(p_anticipo, anticipo),
         fecha_firma = coalesce(p_fecha_firma, fecha_firma), moneda = coalesce(p_moneda, moneda)
   where id = c.id;
exception when check_violation then
  raise exception 'datos_invalidos' using errcode = '22023';
end $$;

-- ---------- 2) Plan de pagos ----------
create function public.agregar_pago(
  p_contrato_id uuid, p_concepto text, p_valor numeric, p_vence_el date, p_hito_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.contratos; v_id uuid;
begin
  perform private.exigir_super_admin();
  c := private.contrato_para_cambio(p_contrato_id);
  begin
    insert into public.pagos_programados (empresa_id, contrato_id, concepto, valor, vence_el, hito_id)
    values (c.empresa_id, c.id, private.texto(p_concepto, 2, 120), private.dinero(p_valor), p_vence_el, p_hito_id)
    returning id into v_id;
  exception when check_violation or not_null_violation then
    raise exception 'datos_invalidos' using errcode = '22023';
  when foreign_key_violation then
    raise exception 'hito_de_otro_proyecto' using errcode = 'P0001';
  end;
  return jsonb_build_object('pago_id', v_id);
end $$;

-- Lo nulo no cambia. p_quitar_hito suelta el hito. Con un comprobante en revision no se cambia valor ni fecha.
create function public.editar_pago(
  p_pago_id uuid, p_concepto text default null, p_valor numeric default null, p_vence_el date default null,
  p_hito_id uuid default null, p_quitar_hito boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare v_contrato uuid; p public.pagos_programados;
begin
  perform private.exigir_super_admin();
  select contrato_id into v_contrato from public.pagos_programados where id = p_pago_id;
  if not found then raise exception 'pago_no_encontrado' using errcode = 'P0001'; end if;
  perform private.contrato_para_cambio(v_contrato);
  select * into p from public.pagos_programados where id = p_pago_id for update;
  if not found then raise exception 'pago_no_encontrado' using errcode = 'P0001'; end if;
  if (p_valor is not null or p_vence_el is not null)
     and exists (select 1 from public.comprobantes_pago where pago_programado_id = p.id and estado = 'en_revision') then
    raise exception 'pago_en_revision' using errcode = 'P0001';
  end if;
  begin
    update public.pagos_programados
       set concepto = case when p_concepto is null then concepto else private.texto(p_concepto, 2, 120) end,
           valor = case when p_valor is null then valor else private.dinero(p_valor) end,
           vence_el = coalesce(p_vence_el, vence_el),
           hito_id = case when p_quitar_hito then null else coalesce(p_hito_id, hito_id) end
     where id = p.id;
  exception when check_violation then
    raise exception 'datos_invalidos' using errcode = '22023';
  when foreign_key_violation then
    raise exception 'hito_de_otro_proyecto' using errcode = 'P0001';
  end;
end $$;

-- Solo se quita una cuota que no tiene abonos, comprobantes ni facturas.
create function public.quitar_pago(p_pago_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_contrato uuid;
begin
  perform private.exigir_super_admin();
  select contrato_id into v_contrato from public.pagos_programados where id = p_pago_id;
  if not found then raise exception 'pago_no_encontrado' using errcode = 'P0001'; end if;
  perform private.contrato_para_cambio(v_contrato);
  if exists (select 1 from public.abonos where pago_programado_id = p_pago_id)
     or exists (select 1 from public.comprobantes_pago where pago_programado_id = p_pago_id)
     or exists (select 1 from public.facturas where pago_programado_id = p_pago_id) then
    raise exception 'pago_con_movimientos' using errcode = 'P0001';
  end if;
  delete from public.pagos_programados where id = p_pago_id;
end $$;

-- ---------- 3) Abonos ----------
create function public.crear_abono(
  p_contrato_id uuid, p_valor numeric, p_fecha_pago date, p_medio text,
  p_pago_id uuid default null, p_referencia text default null, p_archivo_path text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.contratos; v_id uuid; v_saldo numeric;
begin
  perform private.exigir_super_admin();
  c := private.contrato_para_cambio(p_contrato_id);
  if p_fecha_pago is null or p_fecha_pago > private.hoy() then raise exception 'fechas_invalidas' using errcode = '22023'; end if;
  if p_medio is null or p_medio not in ('transferencia', 'consignacion', 'tarjeta', 'efectivo', 'otro') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  begin
    insert into public.abonos (empresa_id, contrato_id, pago_programado_id, valor, fecha_pago, medio, referencia, archivo_path)
    values (c.empresa_id, c.id, p_pago_id, private.dinero(p_valor), p_fecha_pago, p_medio,
            case when p_referencia is null then null else private.texto(p_referencia, 1, 120) end,
            case when p_archivo_path is null then null
                 else private.ruta_archivo(p_archivo_path, c.empresa_id, array['abonos'], array['pdf', 'png', 'jpg', 'webp']) end)
    returning id into v_id;
  exception when foreign_key_violation then
    raise exception 'pago_no_encontrado' using errcode = 'P0001';
  when check_violation then
    raise exception 'datos_invalidos' using errcode = '22023';
  end;
  select c.valor - coalesce(sum(a.valor), 0) into v_saldo from public.abonos a where a.contrato_id = c.id and a.anulado_en is null;
  return jsonb_build_object('abono_id', v_id, 'saldo', coalesce(v_saldo, c.valor));
end $$;

-- Un abono no se edita ni se borra: se anula con motivo (que el cliente tambien lee) y el saldo se recalcula solo.
create function public.anular_abono(p_abono_id uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_contrato uuid; a public.abonos; c public.contratos; v_saldo numeric;
begin
  perform private.exigir_super_admin();
  select contrato_id into v_contrato from public.abonos where id = p_abono_id;
  if not found then raise exception 'abono_no_encontrado' using errcode = 'P0001'; end if;
  c := private.contrato_para_cambio(v_contrato);
  select * into a from public.abonos where id = p_abono_id for update;
  if a.anulado_en is not null then raise exception 'abono_ya_anulado' using errcode = 'P0001'; end if;
  update public.abonos set anulado_en = now(), anulado_motivo = private.texto(p_motivo, 5, 500) where id = a.id;
  select c.valor - coalesce(sum(x.valor), 0) into v_saldo from public.abonos x where x.contrato_id = c.id and x.anulado_en is null;
  return jsonb_build_object('abono_id', a.id, 'saldo', coalesce(v_saldo, c.valor));
end $$;

-- ---------- 4) Facturas (a nombre de Amotii; el PDF ya esta en Storage con la ruta que genero el servidor) ----------
create function public.crear_factura(
  p_contrato_id uuid, p_numero text, p_valor numeric, p_fecha_emision date,
  p_archivo_path text, p_archivo_nombre text, p_tamano_bytes integer, p_pago_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.contratos; v_id uuid;
begin
  perform private.exigir_super_admin();
  c := private.contrato_para_cambio(p_contrato_id);
  begin
    insert into public.facturas (empresa_id, contrato_id, pago_programado_id, numero, valor, fecha_emision,
                                 archivo_path, archivo_nombre, tamano_bytes)
    values (c.empresa_id, c.id, p_pago_id, private.texto(p_numero, 1, 40), private.dinero(p_valor), p_fecha_emision,
            private.ruta_archivo(p_archivo_path, c.empresa_id, array['facturas'], array['pdf']),
            private.texto(p_archivo_nombre, 1, 200), p_tamano_bytes)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'factura_numero_repetido' using errcode = 'P0001';
  when foreign_key_violation then
    raise exception 'pago_no_encontrado' using errcode = 'P0001';
  when check_violation or not_null_violation then
    raise exception 'datos_invalidos' using errcode = '22023';
  end;
  return jsonb_build_object('factura_id', v_id);
end $$;

create function public.anular_factura(p_factura_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_contrato uuid; f public.facturas;
begin
  perform private.exigir_super_admin();
  select contrato_id into v_contrato from public.facturas where id = p_factura_id;
  if not found then raise exception 'factura_no_encontrada' using errcode = 'P0001'; end if;
  perform private.contrato_para_cambio(v_contrato);
  select * into f from public.facturas where id = p_factura_id for update;
  if f.anulada_en is not null then raise exception 'factura_ya_anulada' using errcode = 'P0001'; end if;
  update public.facturas set anulada_en = now(), anulada_motivo = private.texto(p_motivo, 5, 500) where id = f.id;
end $$;

-- Deja en el registro que alguien descargo una factura (el servidor la llama al firmar el enlace). Solo lo ve el super admin.
-- Comprueba por su cuenta que quien llama puede ver esa factura (si no, no anota nada ni dice nada).
create function public.anotar_descarga_factura(p_factura_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.facturas; m public.miembros;
begin
  if private.ver_como_activa_de(auth.uid()) then return; end if;
  select * into f from public.facturas where id = p_factura_id;
  if not found then return; end if;
  if not private.es_super_admin() then
    m := private.miembro_activo();
    if m is null or not m.ver_dinero or m.empresa_id <> f.empresa_id then return; end if;
  end if;
  -- Una anotacion por persona y factura cada minuto: la funcion no sirve para llenar el registro.
  if exists (select 1 from public.registro_actividad r
              where r.actor_id = auth.uid() and r.accion = 'factura_descargada' and r.entidad_id = f.id::text
                and r.creado_en > now() - interval '1 minute') then
    return;
  end if;
  perform private.registrar(f.empresa_id, 'factura_descargada', 'facturas', f.id::text, jsonb_build_object('numero', f.numero));
end $$;

-- ---------- 5) Comprobantes de pago ----------
-- El cliente (admin o equipo con "ver dinero" Y "subir archivos") sube el soporte de una cuota suya. Queda "en revision";
-- NO crea abono. El archivo ya esta en Storage con la ruta <empresa>/comprobantes/<uuid>.<ext> que genero el servidor.
create function public.subir_comprobante(
  p_pago_id uuid, p_archivo_path text, p_archivo_nombre text, p_archivo_tipo text, p_tamano_bytes integer,
  p_valor numeric, p_fecha_pago date, p_nota text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.miembros;
  v_contrato uuid; c public.contratos; p public.pagos_programados;
  v_abonado numeric; v_saldo numeric; v_id uuid; v_ext text; v_restriccion text;
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
  begin
    insert into public.comprobantes_pago (empresa_id, contrato_id, pago_programado_id, valor_declarado, fecha_pago_declarada,
                                          archivo_path, archivo_nombre, archivo_tipo, tamano_bytes, nota, subido_por)
    values (m.empresa_id, c.id, p.id, p_valor, p_fecha_pago, p_archivo_path, private.texto(p_archivo_nombre, 1, 200),
            p_archivo_tipo, p_tamano_bytes,
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

-- El super admin CONFIRMA: aqui, y solo aqui, nace el abono (con el valor y la fecha que declaro el cliente, salvo
-- que el super admin corrija con lo que vio en el banco). Si el abono pasa del saldo, todo se deshace y sigue en revision.
create function public.confirmar_comprobante(
  p_comprobante_id uuid, p_medio text default 'transferencia', p_valor numeric default null,
  p_fecha_pago date default null, p_referencia text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_contrato uuid; c public.contratos; k public.comprobantes_pago; v_abono uuid; v_saldo numeric;
begin
  perform private.exigir_super_admin();
  select contrato_id into v_contrato from public.comprobantes_pago where id = p_comprobante_id;
  if not found then raise exception 'comprobante_no_encontrado' using errcode = 'P0001'; end if;
  c := private.contrato_para_cambio(v_contrato);
  select * into k from public.comprobantes_pago where id = p_comprobante_id for update;
  if k.estado <> 'en_revision' then raise exception 'comprobante_ya_revisado' using errcode = 'P0001'; end if;
  if p_medio is null or p_medio not in ('transferencia', 'consignacion', 'tarjeta', 'efectivo', 'otro') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if coalesce(p_fecha_pago, k.fecha_pago_declarada) > private.hoy() then raise exception 'fechas_invalidas' using errcode = '22023'; end if;
  insert into public.abonos (empresa_id, contrato_id, pago_programado_id, valor, fecha_pago, medio, referencia, archivo_path)
  values (k.empresa_id, k.contrato_id, k.pago_programado_id, private.dinero(coalesce(p_valor, k.valor_declarado)),
          coalesce(p_fecha_pago, k.fecha_pago_declarada), p_medio,
          case when p_referencia is null then null else private.texto(p_referencia, 1, 120) end, k.archivo_path)
  returning id into v_abono;
  update public.comprobantes_pago set estado = 'confirmado', abono_id = v_abono, revisado_en = now() where id = k.id;
  select c.valor - coalesce(sum(a.valor), 0) into v_saldo from public.abonos a where a.contrato_id = c.id and a.anulado_en is null;
  return jsonb_build_object('abono_id', v_abono, 'saldo', coalesce(v_saldo, c.valor));
end $$;

-- El super admin RECHAZA: el motivo es obligatorio y lo ve el cliente. No se crea ningun abono.
create function public.rechazar_comprobante(p_comprobante_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_contrato uuid; k public.comprobantes_pago; v_motivo text;
begin
  perform private.exigir_super_admin();
  v_motivo := private.texto(p_motivo, 5, 500);
  select contrato_id into v_contrato from public.comprobantes_pago where id = p_comprobante_id;
  if not found then raise exception 'comprobante_no_encontrado' using errcode = 'P0001'; end if;
  perform private.contrato_para_cambio(v_contrato);
  select * into k from public.comprobantes_pago where id = p_comprobante_id for update;
  if k.estado <> 'en_revision' then raise exception 'comprobante_ya_revisado' using errcode = 'P0001'; end if;
  update public.comprobantes_pago set estado = 'rechazado', motivo_rechazo = v_motivo, revisado_en = now() where id = k.id;
end $$;

-- ---------- 6) Recordatorios de pago (cola de avisos) ----------
-- Solo la tarea programada (clave de sistema) la llama. Encola, sin repetir (clave_unica), un aviso por cuota:
--   por_vencer (de 3 dias antes hasta el dia anterior), vence_hoy y vencido (una vez; tambien avisa al super admin).
-- Salta empresas pausadas, cuotas pagadas y cuotas con un comprobante en revision. Usa la fecha de Colombia.
create function public.generar_recordatorios_pago() returns jsonb
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

-- ---------- 7) Lecturas (SECURITY INVOKER: la base filtra por empresa y por "ver dinero") ----------
-- Todo el modulo de un proyecto en UNA llamada. Sin permiso de dinero: no_autorizado (no devuelve vacio).
create function public.dinero_del_proyecto(p_proyecto_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_contrato public.v_contratos_saldo; v_super boolean := private.es_super_admin();
begin
  if not (v_super or private.mi_ver_dinero()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.proyectos where id = p_proyecto_id) then
    raise exception 'proyecto_no_encontrado' using errcode = 'P0001';
  end if;
  select * into v_contrato from public.v_contratos_saldo where proyecto_id = p_proyecto_id;
  if not found then
    return jsonb_build_object('contrato', null, 'pagos', '[]'::jsonb, 'abonos', '[]'::jsonb, 'facturas', '[]'::jsonb, 'comprobantes', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'contrato', to_jsonb(v_contrato),
    'pagos', (select coalesce(jsonb_agg(to_jsonb(v) order by v.vence_el, v.concepto), '[]'::jsonb)
                from public.v_pagos_programados v where v.contrato_id = v_contrato.contrato_id),
    'abonos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'pago_programado_id', a.pago_programado_id, 'valor', a.valor,
                 'moneda', v_contrato.moneda, 'fecha_pago', a.fecha_pago, 'medio', a.medio, 'referencia', a.referencia,
                 'tiene_archivo', a.archivo_path is not null, 'anulado_en', a.anulado_en, 'anulado_motivo', a.anulado_motivo)
                 order by a.fecha_pago, a.creado_en), '[]'::jsonb)
                from public.abonos a where a.contrato_id = v_contrato.contrato_id),
    'facturas', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'numero', f.numero, 'valor', f.valor,
                 'moneda', v_contrato.moneda, 'fecha_emision', f.fecha_emision, 'pago_programado_id', f.pago_programado_id,
                 'archivo_path', f.archivo_path, 'archivo_nombre', f.archivo_nombre, 'anulada_en', f.anulada_en,
                 'anulada_motivo', f.anulada_motivo) order by f.fecha_emision, f.numero), '[]'::jsonb)
                from public.facturas f where f.contrato_id = v_contrato.contrato_id),
    'comprobantes', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'pago_programado_id', k.pago_programado_id,
                 'valor_declarado', k.valor_declarado, 'fecha_pago_declarada', k.fecha_pago_declarada, 'estado', k.estado,
                 'motivo_rechazo', k.motivo_rechazo, 'archivo_nombre', k.archivo_nombre, 'archivo_path', k.archivo_path,
                 'nota', k.nota, 'creado_en', k.creado_en, 'revisado_en', k.revisado_en) order by k.creado_en), '[]'::jsonb)
                from public.comprobantes_pago k where k.contrato_id = v_contrato.contrato_id));
end $$;

-- Bandeja del super admin: comprobantes por revisar (de todas las empresas), del mas viejo al mas nuevo.
create function public.comprobantes_por_revisar() returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  if not private.es_super_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'empresa_id', k.empresa_id, 'empresa_nombre', e.nombre,
            'pago_programado_id', k.pago_programado_id, 'concepto', p.concepto, 'valor_declarado', k.valor_declarado,
            'moneda', c.moneda, 'fecha_pago_declarada', k.fecha_pago_declarada, 'archivo_path', k.archivo_path,
            'archivo_nombre', k.archivo_nombre, 'nota', k.nota, 'creado_en', k.creado_en) order by k.creado_en), '[]'::jsonb)
            from public.comprobantes_pago k
            join public.empresas e on e.id = k.empresa_id
            join public.pagos_programados p on p.id = k.pago_programado_id
            join public.contratos c on c.id = k.contrato_id
           where k.estado = 'en_revision');
end $$;

-- ---------- Permisos de ejecucion ----------
revoke all on function
  private.dinero(numeric, boolean), private.contrato_para_cambio(uuid), private.ruta_archivo(text, uuid, text[], text[]),
  public.crear_contrato(uuid, numeric, text, numeric, date), public.editar_contrato(uuid, numeric, numeric, date, text),
  public.agregar_pago(uuid, text, numeric, date, uuid), public.editar_pago(uuid, text, numeric, date, uuid, boolean),
  public.quitar_pago(uuid), public.crear_abono(uuid, numeric, date, text, uuid, text, text), public.anular_abono(uuid, text),
  public.crear_factura(uuid, text, numeric, date, text, text, integer, uuid), public.anular_factura(uuid, text),
  public.anotar_descarga_factura(uuid),
  public.subir_comprobante(uuid, text, text, text, integer, numeric, date, text),
  public.confirmar_comprobante(uuid, text, numeric, date, text), public.rechazar_comprobante(uuid, text),
  public.generar_recordatorios_pago(), public.dinero_del_proyecto(uuid), public.comprobantes_por_revisar()
  from public, anon, authenticated, service_role;
grant execute on function
  public.crear_contrato(uuid, numeric, text, numeric, date), public.editar_contrato(uuid, numeric, numeric, date, text),
  public.agregar_pago(uuid, text, numeric, date, uuid), public.editar_pago(uuid, text, numeric, date, uuid, boolean),
  public.quitar_pago(uuid), public.crear_abono(uuid, numeric, date, text, uuid, text, text), public.anular_abono(uuid, text),
  public.crear_factura(uuid, text, numeric, date, text, text, integer, uuid), public.anular_factura(uuid, text),
  public.anotar_descarga_factura(uuid),
  public.subir_comprobante(uuid, text, text, text, integer, numeric, date, text),
  public.confirmar_comprobante(uuid, text, numeric, date, text), public.rechazar_comprobante(uuid, text),
  public.dinero_del_proyecto(uuid), public.comprobantes_por_revisar()
  to authenticated;
-- La tarea de recordatorios corre con la clave de sistema (unico uso permitido: modulo de notificaciones).
grant execute on function public.generar_recordatorios_pago() to service_role;
