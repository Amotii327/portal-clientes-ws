-- Sprint 3 · Correcciones del informe de Calidad (A-1, A-2, M-4, M-6).
-- Equipo Websourcing · Desarrollo

-- ---------- A-1: lectura de aprobaciones que no falla ----------
-- SELECT * sobre una tabla con permisos por columna da 42501. Esta vista trae SOLO las columnas permitidas
-- (sin ip, user_id ni user_agent) y respeta las mismas reglas RLS de la tabla (security_invoker).
create view public.v_aprobaciones with (security_invoker = true) as
  select id, empresa_id, revision_id, version, decision, comentario, captura_path, miembro_id, persona, creado_en
    from public.aprobaciones;
revoke all on public.v_aprobaciones from public, anon, authenticated, service_role;
grant select on public.v_aprobaciones to authenticated;

-- ---------- A-2: "terminado" requiere aprobacion, ENCENDIDO por defecto ----------
update public.configuracion set valor = '{"exigir_aprobacion_para_terminar": true}'::jsonb where clave = 'revisiones';
-- Y no se puede deshacer una aprobacion editando el avance: solo reabrir_revision (con motivo, en el historial).
create or replace function private.trg_terminar_solo_con_aprobacion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bloquea boolean;
begin
  if tg_table_name = 'hitos' and new.numero <> 5 then return new; end if;
  -- responder_revision (aprobar) y reabrir_revision encienden esta marca dentro de su transaccion.
  if coalesce(current_setting('portal.aprobacion_cliente', true), '') = 'on' then return new; end if;
  if new.estado is not distinct from old.estado then return new; end if;
  -- Bajar de "terminado" algo que el cliente aprobo: solo reabrir_revision (con motivo y en el historial).
  if old.estado = 'terminado' then
    if tg_table_name = 'hitos' then
      v_bloquea := exists (select 1 from public.revisiones r
                            where r.proyecto_id = new.proyecto_id and r.tipo = 'diseno' and r.estado = 'aprobada');
    else
      v_bloquea := exists (select 1 from public.revisiones r where r.sprint_id = new.id and r.estado = 'aprobada');
    end if;
    if v_bloquea then raise exception 'reabrir_requiere_revision' using errcode = 'P0001'; end if;
    return new;
  end if;
  if new.estado <> 'terminado' then return new; end if;
  -- Subir a "terminado": solo con la aprobacion del cliente.
  if tg_table_name = 'hitos' then
    v_bloquea := private.exigir_aprobacion_para_terminar()
      or exists (select 1 from public.revisiones r
                  where r.proyecto_id = new.proyecto_id and r.tipo = 'diseno' and r.estado <> 'aprobada');
  else
    v_bloquea := private.exigir_aprobacion_para_terminar()
      or exists (select 1 from public.revisiones r where r.sprint_id = new.id and r.estado <> 'aprobada');
  end if;
  if v_bloquea then
    raise exception 'terminado_requiere_aprobacion' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace function public.reabrir_revision(p_revision_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare rv public.revisiones; v_motivo text;
begin
  perform private.exigir_super_admin();
  select * into rv from public.revisiones where id = p_revision_id for update;
  if not found then raise exception 'revision_no_encontrada' using errcode = 'P0001'; end if;
  perform private.proyecto_para_cambio(rv.proyecto_id);
  if rv.estado <> 'aprobada' then raise exception 'revision_no_aprobada' using errcode = 'P0001'; end if;
  v_motivo := private.texto(p_motivo, 5, 1000);
  -- Reabrir es la UNICA via para bajar un sprint o el hito 5 de "terminado" (ver trigger de terminado).
  perform set_config('portal.aprobacion_cliente', 'on', true);
  if rv.tipo = 'sprint' then
    update public.sprints set estado = 'en_curso', terminado_en = null where id = rv.sprint_id and estado = 'terminado';
  elsif rv.tipo = 'diseno' then
    update public.hitos set estado = 'en_curso', fecha_real = null where proyecto_id = rv.proyecto_id and numero = 5 and estado = 'terminado';
  end if;
  perform set_config('portal.aprobacion_cliente', 'off', true);
  perform set_config('portal.motivo_reapertura', v_motivo, true);
  update public.revisiones set estado = 'reabierta' where id = rv.id;
  perform set_config('portal.motivo_reapertura', '', true);
end $$;

-- ---------- M-4: registrar_descarga no escribe en el registro de otra empresa ----------
create or replace function private.registrar_descarga(p_tipo text, p_id uuid, p_empresa uuid, p_ref uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  -- Solo en la empresa de quien descarga (o el super admin), y solo si la fila existe en esa empresa.
  if not (private.es_super_admin() or p_empresa = private.mi_empresa_id()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if not (case p_tipo
       when 'documento' then exists (select 1 from public.documento_versiones dv
                                      where dv.id = p_id and dv.empresa_id = p_empresa and dv.documento_id = p_ref)
       when 'archivo' then exists (select 1 from public.archivos_cliente a
                                    where a.id = p_id and a.empresa_id = p_empresa and a.id = p_ref)
       else false end) then
    raise exception 'archivo_no_encontrado' using errcode = 'P0001';
  end if;
  if (select count(*) from public.registro_actividad r
       where r.actor_id = auth.uid() and r.accion = 'descarga' and r.creado_en > now() - interval '1 minute') >= 60 then
    return;
  end if;
  perform private.registrar(p_empresa, 'descarga', case p_tipo when 'documento' then 'documentos' else 'archivos_cliente' end,
    p_ref::text, jsonb_build_object('tipo', p_tipo, 'version_id', p_id));
end $$;

-- ---------- M-6: D-014, el 2FA del admin del cliente es obligatorio (encendido por defecto) ----------
update public.configuracion set valor = jsonb_set(valor, '{exigir_2fa_admin_cliente}', 'true'::jsonb) where clave = 'seguridad';
