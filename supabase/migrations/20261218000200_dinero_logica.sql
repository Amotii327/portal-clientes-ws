-- Sprint 4 · Dinero · Logica en la base: reglas que no se pueden saltar (triggers) y calculos (vistas).
-- Todas las funciones son SECURITY DEFINER con search_path vacio. Equipo Websourcing · Desarrollo
--
-- Orden de bloqueo: SIEMPRE primero la fila del contrato (for update) y despues sus hijas. Asi dos
-- abonos o dos comprobantes al mismo tiempo no pueden pasarse del saldo ni cruzarse (sin interbloqueos).

-- ---------- Triggers de las reglas de dinero ----------

-- Contrato: la moneda no cambia si ya hay cuotas o abonos; el valor no baja de lo comprometido.
create function private.trg_contrato_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pagos numeric; v_abonos numeric;
begin
  if new.moneda is distinct from old.moneda
     and (exists (select 1 from public.pagos_programados where contrato_id = new.id)
          or exists (select 1 from public.abonos where contrato_id = new.id)) then
    raise exception 'moneda_con_movimientos' using errcode = 'P0001';
  end if;
  if new.valor < old.valor then
    select coalesce(sum(valor), 0) into v_pagos from public.pagos_programados where contrato_id = new.id;
    select coalesce(sum(valor), 0) into v_abonos from public.abonos where contrato_id = new.id and anulado_en is null;
    if new.valor < v_pagos or new.valor < v_abonos then
      raise exception 'contrato_bajo_lo_comprometido' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- Cuota: el hito debe ser del mismo proyecto del contrato; la suma de cuotas no pasa del valor del contrato;
-- una cuota no baja de lo ya abonado.
create function private.trg_pago_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.contratos; v_otras numeric; v_abonado numeric;
begin
  select * into c from public.contratos where id = new.contrato_id for update;
  if not found then raise exception 'contrato_no_encontrado' using errcode = 'P0001'; end if;
  if new.hito_id is not null
     and not exists (select 1 from public.hitos h where h.id = new.hito_id and h.proyecto_id = c.proyecto_id) then
    raise exception 'hito_de_otro_proyecto' using errcode = 'P0001';
  end if;
  select coalesce(sum(valor), 0) into v_otras from public.pagos_programados
   where contrato_id = new.contrato_id and id <> new.id;
  if v_otras + new.valor > c.valor then
    raise exception 'pagos_exceden_contrato' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.valor < old.valor then
    select coalesce(sum(valor), 0) into v_abonado from public.abonos where pago_programado_id = new.id and anulado_en is null;
    if new.valor < v_abonado then
      raise exception 'pago_bajo_lo_abonado' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- Abono: al crearlo no pasa del saldo del contrato ni de lo que falta de su cuota. Despues solo se puede anular.
create function private.trg_abono_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.contratos; v_abonado numeric; v_pago numeric; v_pago_abonado numeric;
begin
  if tg_op = 'INSERT' then
    if new.anulado_en is not null then
      raise exception 'datos_invalidos' using errcode = '22023';
    end if;
    select * into c from public.contratos where id = new.contrato_id for update;
    if not found then raise exception 'contrato_no_encontrado' using errcode = 'P0001'; end if;
    select coalesce(sum(valor), 0) into v_abonado from public.abonos where contrato_id = new.contrato_id and anulado_en is null;
    if v_abonado + new.valor > c.valor then
      raise exception 'abono_excede_saldo' using errcode = 'P0001';
    end if;
    if new.pago_programado_id is not null then
      select valor into v_pago from public.pagos_programados where id = new.pago_programado_id;
      select coalesce(sum(valor), 0) into v_pago_abonado from public.abonos
       where pago_programado_id = new.pago_programado_id and anulado_en is null;
      if v_pago_abonado + new.valor > v_pago then
        raise exception 'abono_excede_pago' using errcode = 'P0001';
      end if;
    end if;
  else
    -- UPDATE: solo se puede anular, una vez.
    if old.anulado_en is not null or new.anulado_en is null then
      raise exception 'abono_no_modificable' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- Factura: solo se puede anular, una vez. Nada mas cambia.
create function private.trg_factura_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.anulada_en is not null or new.anulada_en is null then
    raise exception 'factura_no_modificable' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Comprobante: solo se revisa una vez (en_revision -> confirmado | rechazado).
create function private.trg_comprobante_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.estado <> 'en_revision' or new.estado = 'en_revision' then
    raise exception 'comprobante_ya_revisado' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function private.trg_contrato_validar(), private.trg_pago_validar(), private.trg_abono_validar(),
  private.trg_factura_validar(), private.trg_comprobante_validar() from public, anon, authenticated, service_role;

create trigger contratos_validar before update on public.contratos for each row execute function private.trg_contrato_validar();
create trigger pagos_validar before insert or update on public.pagos_programados for each row execute function private.trg_pago_validar();
create trigger abonos_validar before insert or update on public.abonos for each row execute function private.trg_abono_validar();
create trigger facturas_validar before update on public.facturas for each row execute function private.trg_factura_validar();
create trigger comprobantes_validar before update on public.comprobantes_pago for each row execute function private.trg_comprobante_validar();

-- Hora de actualizacion
create trigger contratos_actualizado before update on public.contratos for each row execute function private.poner_actualizado_en();
create trigger pagos_actualizado before update on public.pagos_programados for each row execute function private.poner_actualizado_en();
create trigger comprobantes_actualizado before update on public.comprobantes_pago for each row execute function private.poner_actualizado_en();
create trigger avisos_actualizado before update on public.avisos_salientes for each row execute function private.poner_actualizado_en();

-- empresa_id inmutable en TODA tabla nueva con empresa_id
create trigger contratos_empresa_fija before update on public.contratos for each row execute function private.empresa_id_inmutable();
create trigger pagos_empresa_fija before update on public.pagos_programados for each row execute function private.empresa_id_inmutable();
create trigger abonos_empresa_fija before update on public.abonos for each row execute function private.empresa_id_inmutable();
create trigger facturas_empresa_fija before update on public.facturas for each row execute function private.empresa_id_inmutable();
create trigger comprobantes_empresa_fija before update on public.comprobantes_pago for each row execute function private.empresa_id_inmutable();
create trigger avisos_empresa_fija before update on public.avisos_salientes for each row execute function private.empresa_id_inmutable();

-- Campos que no cambian nunca
create trigger contratos_campos_fijos before update on public.contratos
  for each row execute function private.campos_inmutables('id', 'proyecto_id', 'creado_en');
create trigger pagos_campos_fijos before update on public.pagos_programados
  for each row execute function private.campos_inmutables('id', 'contrato_id', 'creado_en');
create trigger abonos_campos_fijos before update on public.abonos
  for each row execute function private.campos_inmutables('id', 'contrato_id', 'pago_programado_id', 'valor', 'fecha_pago',
    'medio', 'referencia', 'archivo_path', 'creado_en');
create trigger facturas_campos_fijos before update on public.facturas
  for each row execute function private.campos_inmutables('id', 'contrato_id', 'pago_programado_id', 'numero', 'valor',
    'fecha_emision', 'archivo_path', 'archivo_nombre', 'tamano_bytes', 'creado_en');
create trigger comprobantes_campos_fijos before update on public.comprobantes_pago
  for each row execute function private.campos_inmutables('id', 'contrato_id', 'pago_programado_id', 'valor_declarado',
    'fecha_pago_declarada', 'archivo_path', 'archivo_nombre', 'archivo_tipo', 'tamano_bytes', 'nota', 'subido_por', 'creado_en');
create trigger avisos_campos_fijos before update on public.avisos_salientes
  for each row execute function private.campos_inmutables('id', 'modulo', 'tipo', 'destino', 'referencia_id', 'clave_unica', 'datos', 'creado_en');

-- Nada se borra: ni abonos, ni facturas, ni comprobantes, ni contratos (ni se vacian las tablas).
-- Las cuotas (pagos_programados) si se pueden quitar por funcion mientras no tengan movimientos.
create trigger contratos_sin_borrar before delete on public.contratos for each row execute function private.solo_agregar();
create trigger contratos_sin_truncate before truncate on public.contratos for each statement execute function private.solo_agregar();
create trigger abonos_sin_borrar before delete on public.abonos for each row execute function private.solo_agregar();
create trigger abonos_sin_truncate before truncate on public.abonos for each statement execute function private.solo_agregar();
create trigger facturas_sin_borrar before delete on public.facturas for each row execute function private.solo_agregar();
create trigger facturas_sin_truncate before truncate on public.facturas for each statement execute function private.solo_agregar();
create trigger comprobantes_sin_borrar before delete on public.comprobantes_pago for each row execute function private.solo_agregar();
create trigger comprobantes_sin_truncate before truncate on public.comprobantes_pago for each statement execute function private.solo_agregar();
create trigger pagos_sin_truncate before truncate on public.pagos_programados for each statement execute function private.solo_agregar();

-- ---------- Vistas de calculo (security_invoker: respetan las mismas cerraduras que las tablas) ----------

-- Cuotas con su estado calculado. Estado: pagado | en_revision | vencido | por_vencer (3 dias o menos) | pendiente.
create view public.v_pagos_programados with (security_invoker = true) as
select p.id as pago_id, p.empresa_id, p.contrato_id, c.proyecto_id, p.concepto, p.valor, c.moneda, p.vence_el,
       p.hito_id, h.numero as hito_numero, h.nombre as hito_nombre,
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
  left join public.hitos h on h.id = p.hito_id
  left join lateral (select sum(x.valor) as abonado from public.abonos x
                      where x.pago_programado_id = p.id and x.anulado_en is null) a on true;

-- Saldo del contrato calculado en la base: valor - abonos vigentes (los anulados no cuentan).
create view public.v_contratos_saldo with (security_invoker = true) as
select c.id as contrato_id, c.empresa_id, c.proyecto_id, c.valor, c.moneda, c.anticipo, c.fecha_firma,
       coalesce(a.abonado, 0) as abonado,
       c.valor - coalesce(a.abonado, 0) as saldo,
       coalesce(pp.programado, 0) as programado,
       c.valor - coalesce(pp.programado, 0) as sin_programar,
       coalesce(pp.pagos_vencidos, 0)::int as pagos_vencidos,
       coalesce(pp.monto_vencido, 0) as monto_vencido,
       pp.proximo_vence
  from public.contratos c
  left join lateral (select sum(x.valor) as abonado from public.abonos x
                      where x.contrato_id = c.id and x.anulado_en is null) a on true
  left join lateral (select sum(v.valor) as programado,
                            count(*) filter (where v.estado = 'vencido') as pagos_vencidos,
                            sum(v.pendiente) filter (where v.estado = 'vencido') as monto_vencido,
                            min(v.vence_el) filter (where v.estado <> 'pagado') as proximo_vence
                       from public.v_pagos_programados v where v.contrato_id = c.id) pp on true;

-- Ingresos (abonos vigentes), SOLO para el super admin: para cualquier otro la vista viene vacia.
-- No se mezclan monedas: cada fila trae su moneda.
create view public.v_ingresos_por_mes with (security_invoker = true) as
select date_trunc('month', a.fecha_pago)::date as mes, c.moneda, count(*)::int as abonos, sum(a.valor) as total
  from public.abonos a join public.contratos c on c.id = a.contrato_id
 where a.anulado_en is null and (select private.es_super_admin())
 group by 1, 2;

create view public.v_ingresos_por_cliente with (security_invoker = true) as
select a.empresa_id, e.nombre as empresa_nombre, c.moneda, count(*)::int as abonos, sum(a.valor) as total,
       max(a.fecha_pago) as ultimo_pago
  from public.abonos a join public.contratos c on c.id = a.contrato_id join public.empresas e on e.id = a.empresa_id
 where a.anulado_en is null and (select private.es_super_admin())
 group by a.empresa_id, e.nombre, c.moneda;

create view public.v_ingresos_por_mes_y_cliente with (security_invoker = true) as
select date_trunc('month', a.fecha_pago)::date as mes, a.empresa_id, e.nombre as empresa_nombre, c.moneda,
       count(*)::int as abonos, sum(a.valor) as total
  from public.abonos a join public.contratos c on c.id = a.contrato_id join public.empresas e on e.id = a.empresa_id
 where a.anulado_en is null and (select private.es_super_admin())
 group by 1, a.empresa_id, e.nombre, c.moneda;
