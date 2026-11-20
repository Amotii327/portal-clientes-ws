-- Integracion · avisos de revisiones (sprint 3 no encolaba nada). Equipo Websourcing · Desarrollo
-- Cuando Websourcing publica una revision, quienes pueden aprobar en la empresa reciben aviso; cuando el cliente responde,
-- se entera el super admin; y una tarea diaria recuerda las que llevan mas de 3 dias sin respuesta. Solo ids y estado.

create function private.trg_avisos_revisiones() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'publicada' and old.estado is distinct from 'publicada' then
    insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
    values (new.empresa_id, 'revisiones', 'revision_publicada', 'cliente_aprobador', new.id,
            'revision_publicada:' || new.id || ':' || new.version_actual,
            jsonb_build_object('revision_id', new.id, 'proyecto_id', new.proyecto_id, 'version', new.version_actual, 'tipo_revision', new.tipo))
    on conflict (clave_unica) do nothing;
  elsif new.estado in ('aprobada', 'cambios_pedidos') and old.estado = 'publicada' then
    insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
    values (new.empresa_id, 'revisiones', 'revision_respondida', 'super_admin', new.id,
            'revision_respondida:' || new.id || ':' || new.version_actual,
            jsonb_build_object('revision_id', new.id, 'proyecto_id', new.proyecto_id, 'version', new.version_actual, 'decision', new.estado))
    on conflict (clave_unica) do nothing;
  end if;
  return null;
end $$;
create trigger revisiones_avisos after update of estado on public.revisiones
  for each row execute function private.trg_avisos_revisiones();

-- Recordatorio: las publicadas que llevan mas de 3 dias esperando al cliente (uno por semana por revision).
create function public.generar_recordatorios_revisiones() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  with ins as (
    insert into public.avisos_salientes (empresa_id, modulo, tipo, destino, referencia_id, clave_unica, datos)
    select r.empresa_id, 'revisiones', 'revision_pendiente', 'cliente_aprobador', r.id,
           'revision_pendiente:' || r.id || ':' || to_char(now() at time zone 'America/Bogota', 'IYYY-IW'),
           jsonb_build_object('revision_id', r.id, 'proyecto_id', r.proyecto_id, 'version', r.version_actual, 'tipo_revision', r.tipo)
      from public.revisiones r join public.empresas e on e.id = r.empresa_id
     where r.estado = 'publicada' and r.actualizado_en < now() - interval '3 days' and e.estado = 'activa'
    on conflict (clave_unica) do nothing
    returning 1
  ) select count(*) into v_n from ins;
  return jsonb_build_object('avisos_nuevos', v_n);
end $$;

revoke all on function private.trg_avisos_revisiones(), public.generar_recordatorios_revisiones() from public, anon, authenticated, service_role;
grant execute on function public.generar_recordatorios_revisiones() to service_role;
