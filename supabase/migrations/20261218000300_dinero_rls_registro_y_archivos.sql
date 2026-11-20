-- Sprint 4 · Dinero · RLS, permisos, cerradura del modo "ver como", registro de actividad (por triggers),
-- avisos para la cola y reglas de Storage. Fuente de verdad: docs/matriz-permisos-dinero.md.
-- Equipo Websourcing · Desarrollo

alter table public.contratos         enable row level security;
alter table public.pagos_programados enable row level security;
alter table public.abonos            enable row level security;
alter table public.facturas          enable row level security;
alter table public.comprobantes_pago enable row level security;
alter table public.avisos_salientes  enable row level security;

-- Solo lectura desde la API. TODA escritura pasa por las funciones RPC (migracion 000400).
-- avisos_salientes: ni siquiera sus filas le llegan al cliente (la politica es solo del super admin).
-- service_role no recibe nada: la clave de sistema solo se concedera al modulo de notificaciones (sprint 6).
grant select on public.contratos, public.pagos_programados, public.abonos, public.facturas,
  public.comprobantes_pago, public.avisos_salientes to authenticated;
grant select on public.v_pagos_programados, public.v_contratos_saldo, public.v_ingresos_por_mes,
  public.v_ingresos_por_cliente, public.v_ingresos_por_mes_y_cliente to authenticated;
revoke all on public.v_pagos_programados, public.v_contratos_saldo, public.v_ingresos_por_mes,
  public.v_ingresos_por_cliente, public.v_ingresos_por_mes_y_cliente from anon, service_role;

-- Ver dinero: el super admin, o un miembro ACTIVO de la misma empresa con "ver_dinero" (el admin lo tiene siempre).
-- El equipo sin ese permiso no ve ninguna fila de este modulo.
create policy contratos_leer on public.contratos for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.mi_ver_dinero())));
create policy pagos_leer on public.pagos_programados for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.mi_ver_dinero())));
create policy abonos_leer on public.abonos for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.mi_ver_dinero())));
create policy facturas_leer on public.facturas for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.mi_ver_dinero())));
create policy comprobantes_leer on public.comprobantes_pago for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id()) and (select private.mi_ver_dinero())));
create policy avisos_leer on public.avisos_salientes for select to authenticated
  using ((select private.es_super_admin()));

-- ---------- Cerradura de solo lectura del modo "ver como" (la prueba 01_estructura la exige) ----------
do $$
declare t text;
begin
  foreach t in array array['contratos', 'pagos_programados', 'abonos', 'facturas', 'comprobantes_pago', 'avisos_salientes'] loop
    execute format('create trigger ver_como_solo_lectura before insert or update or delete or truncate on public.%I
                    for each statement execute function private.bloquear_escritura_ver_como()', t);
  end loop;
end $$;

-- ---------- Registro de actividad (lo escriben los triggers, nunca la pantalla) ----------
create function private.trg_registro_dinero() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_proy uuid;
begin
  if tg_table_name = 'contratos' then
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'contrato_creado', 'contratos', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id, 'valor', new.valor, 'moneda', new.moneda, 'anticipo', new.anticipo));
    else
      perform private.registrar(new.empresa_id, 'contrato_editado', 'contratos', new.id::text,
        jsonb_build_object('proyecto_id', new.proyecto_id,
          'valor', jsonb_build_array(old.valor, new.valor), 'anticipo', jsonb_build_array(old.anticipo, new.anticipo),
          'moneda', jsonb_build_array(old.moneda, new.moneda)));
    end if;
    return null;
  end if;

  if tg_table_name = 'pagos_programados' then
    if tg_op = 'DELETE' then
      select c.proyecto_id into v_proy from public.contratos c where c.id = old.contrato_id;
      perform private.registrar(old.empresa_id, 'pago_programado_quitado', 'pagos_programados', old.id::text,
        jsonb_build_object('proyecto_id', v_proy, 'concepto', old.concepto, 'valor', old.valor, 'vence_el', old.vence_el));
      return null;
    end if;
    select c.proyecto_id into v_proy from public.contratos c where c.id = new.contrato_id;
    perform private.registrar(new.empresa_id, case tg_op when 'INSERT' then 'pago_programado_creado' else 'pago_programado_editado' end,
      'pagos_programados', new.id::text,
      jsonb_build_object('proyecto_id', v_proy, 'concepto', new.concepto, 'valor', new.valor, 'vence_el', new.vence_el, 'hito_id', new.hito_id));
    return null;
  end if;

  if tg_table_name = 'abonos' then
    select c.proyecto_id into v_proy from public.contratos c where c.id = new.contrato_id;
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'abono_registrado', 'abonos', new.id::text,
        jsonb_build_object('proyecto_id', v_proy, 'contrato_id', new.contrato_id, 'pago_programado_id', new.pago_programado_id,
                           'valor', new.valor, 'fecha_pago', new.fecha_pago, 'medio', new.medio));
    else
      perform private.registrar(new.empresa_id, 'abono_anulado', 'abonos', new.id::text,
        jsonb_build_object('proyecto_id', v_proy, 'contrato_id', new.contrato_id, 'valor', new.valor, 'motivo', new.anulado_motivo));
    end if;
    return null;
  end if;

  if tg_table_name = 'facturas' then
    select c.proyecto_id into v_proy from public.contratos c where c.id = new.contrato_id;
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'factura_subida', 'facturas', new.id::text,
        jsonb_build_object('proyecto_id', v_proy, 'numero', new.numero, 'valor', new.valor));
    else
      perform private.registrar(new.empresa_id, 'factura_anulada', 'facturas', new.id::text,
        jsonb_build_object('proyecto_id', v_proy, 'numero', new.numero, 'motivo', new.anulada_motivo));
    end if;
    return null;
  end if;

  if tg_table_name = 'comprobantes_pago' then
    select c.proyecto_id into v_proy from public.contratos c where c.id = new.contrato_id;
    if tg_op = 'INSERT' then
      perform private.registrar(new.empresa_id, 'comprobante_subido', 'comprobantes_pago', new.id::text,
        jsonb_build_object('proyecto_id', v_proy, 'pago_programado_id', new.pago_programado_id, 'valor', new.valor_declarado));
    elsif new.estado = 'confirmado' then
      perform private.registrar(new.empresa_id, 'comprobante_confirmado', 'comprobantes_pago', new.id::text,
        jsonb_build_object('proyecto_id', v_proy, 'pago_programado_id', new.pago_programado_id, 'abono_id', new.abono_id));
    else
      perform private.registrar(new.empresa_id, 'comprobante_rechazado', 'comprobantes_pago', new.id::text,
        jsonb_build_object('proyecto_id', v_proy, 'pago_programado_id', new.pago_programado_id, 'motivo', new.motivo_rechazo));
    end if;
    return null;
  end if;
  return null;
end $$;

-- ---------- Avisos a la cola (outbox): el super admin se entera del comprobante; el cliente, del rechazo ----------
create function private.trg_avisos_comprobantes() returns trigger
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
            jsonb_build_object('concepto', v_concepto, 'valor', new.valor_declarado, 'moneda', v_moneda));
  end if;
  return null;
end $$;

revoke all on function private.trg_registro_dinero(), private.trg_avisos_comprobantes()
  from public, anon, authenticated, service_role;

create trigger contratos_registro after insert or update on public.contratos for each row execute function private.trg_registro_dinero();
create trigger pagos_registro after insert or update or delete on public.pagos_programados for each row execute function private.trg_registro_dinero();
create trigger abonos_registro after insert or update on public.abonos for each row execute function private.trg_registro_dinero();
create trigger facturas_registro after insert or update on public.facturas for each row execute function private.trg_registro_dinero();
create trigger comprobantes_registro after insert or update on public.comprobantes_pago for each row execute function private.trg_registro_dinero();
create trigger comprobantes_avisos after insert or update on public.comprobantes_pago for each row execute function private.trg_avisos_comprobantes();

-- ---------- Archivos: bucket privado "dinero" y reglas de Storage ----------
-- La ruta siempre es <empresa_id>/<facturas|abonos|comprobantes>/<uuid>.<ext>. La regla NO se queda en la carpeta:
-- lee la tabla dueña del archivo (factura, comprobante o abono) y exige ver dinero (o ser super admin).
create function private.puede_leer_archivo_dinero(p_ruta text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m public.miembros;
begin
  if p_ruta is null then return false; end if;
  if private.es_super_admin() then
    return exists (select 1 from public.facturas where archivo_path = p_ruta)
        or exists (select 1 from public.comprobantes_pago where archivo_path = p_ruta)
        or exists (select 1 from public.abonos where archivo_path = p_ruta);
  end if;
  m := private.miembro_activo();
  if m is null or not m.ver_dinero then return false; end if;
  return exists (select 1 from public.facturas f where f.archivo_path = p_ruta and f.empresa_id = m.empresa_id)
      or exists (select 1 from public.comprobantes_pago k where k.archivo_path = p_ruta and k.empresa_id = m.empresa_id)
      or exists (select 1 from public.abonos a where a.archivo_path = p_ruta and a.empresa_id = m.empresa_id);
end $$;

-- Subir: el super admin sube facturas y soportes a la carpeta de cualquier empresa; el cliente SOLO comprobantes en la
-- de su empresa y solo con "ver dinero" Y "subir archivos". Nunca durante "ver como" (solo lectura).
create function private.puede_subir_archivo_dinero(p_ruta text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m public.miembros;
begin
  if p_ruta is null then return false; end if;
  if private.ver_como_activa_de(auth.uid()) then return false; end if;
  if private.es_super_admin() then
    return p_ruta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(facturas|abonos|comprobantes)/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$';
  end if;
  m := private.miembro_activo();
  if m is null or not (m.ver_dinero and m.subir_archivos) then return false; end if;
  return p_ruta ~ ('^' || m.empresa_id::text || '/comprobantes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|webp)$');
end $$;

revoke all on function private.puede_leer_archivo_dinero(text), private.puede_subir_archivo_dinero(text)
  from public, anon, authenticated, service_role;
grant execute on function private.puede_leer_archivo_dinero(text), private.puede_subir_archivo_dinero(text) to authenticated;

-- Las reglas viven en storage.objects, que solo existe en Supabase real (no en la base local de pruebas).
-- En la base local se salta; las funciones de arriba SI se prueban. Sin politicas de UPDATE ni DELETE: un archivo no se reemplaza.
do $$
begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('dinero', 'dinero', false, 20971520) on conflict (id) do nothing;
    execute $p$create policy dinero_leer on storage.objects for select to authenticated
      using (bucket_id = 'dinero' and private.puede_leer_archivo_dinero(name))$p$;
    execute $p$create policy dinero_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'dinero' and private.puede_subir_archivo_dinero(name))$p$;
  end if;
end $$;
