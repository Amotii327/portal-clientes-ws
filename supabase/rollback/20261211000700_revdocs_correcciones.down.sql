-- Rollback de las correcciones del sprint 3 (vuelve a las definiciones de las migraciones 000200 y 000500).
update public.configuracion set valor = jsonb_set(valor, '{exigir_2fa_admin_cliente}', 'false'::jsonb) where clave = 'seguridad';
create or replace function private.registrar_descarga(p_tipo text, p_id uuid, p_empresa uuid, p_ref uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.registro_actividad r
       where r.actor_id = auth.uid() and r.accion = 'descarga' and r.creado_en > now() - interval '1 minute') >= 60 then
    return;
  end if;
  perform private.registrar(p_empresa, 'descarga', case p_tipo when 'documento' then 'documentos' else 'archivos_cliente' end,
    p_ref::text, jsonb_build_object('tipo', p_tipo, 'version_id', p_id));
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
  if rv.tipo = 'sprint' then
    update public.sprints set estado = 'en_curso', terminado_en = null where id = rv.sprint_id and estado = 'terminado';
  elsif rv.tipo = 'diseno' then
    update public.hitos set estado = 'en_curso', fecha_real = null where proyecto_id = rv.proyecto_id and numero = 5 and estado = 'terminado';
  end if;
  perform set_config('portal.motivo_reapertura', v_motivo, true);
  update public.revisiones set estado = 'reabierta' where id = rv.id;
  perform set_config('portal.motivo_reapertura', '', true);
end $$;
create or replace function private.trg_terminar_solo_con_aprobacion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bloquea boolean;
begin
  if new.estado is distinct from 'terminado' or old.estado is not distinct from 'terminado' then return new; end if;
  if coalesce(current_setting('portal.aprobacion_cliente', true), '') = 'on' then return new; end if;
  if tg_table_name = 'hitos' then
    if new.numero <> 5 then return new; end if;
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
update public.configuracion set valor = '{"exigir_aprobacion_para_terminar": false}'::jsonb where clave = 'revisiones';
drop view if exists public.v_aprobaciones;
