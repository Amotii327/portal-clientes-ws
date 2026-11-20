-- Integracion · freno de 5 intentos fallidos, PLAN B. Equipo Websourcing · Desarrollo
-- El gancho `password_verification_attempt` de Auth NO esta en el plan Pro. El freno lo hace el servidor del portal:
-- la accion de servidor `entrar` (lib/servidor/entrar.ts) consulta y anota con la clave de sistema ANTES y DESPUES de
-- llamar a signInWithPassword. La logica es la misma del gancho (private.gancho_intento_de_acceso: 5 fallos seguidos,
-- 15 minutos, parametros en configuracion('intentos_acceso'), todo queda en el registro de actividad). Solo service_role
-- ejecuta estas funciones; el navegador nunca las ve.
-- Limite conocido: quien llame directo a Auth (sin pasar por el portal) se salta este freno; por eso, si algun dia
-- el plan lo permite, se enciende ademas el gancho (config.toml).

-- Ya hay un freno vigente para ese correo? (no revela si el correo existe: un correo desconocido responde "no")
create function public.freno_acceso_consultar(p_correo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_hasta timestamptz;
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select i.bloqueado_hasta into v_hasta
    from public.perfiles p join public.intentos_acceso i on i.user_id = p.user_id
   where p.correo = lower(btrim(coalesce(p_correo, '')));
  return jsonb_build_object('bloqueado', coalesce(v_hasta > now(), false));
end $$;

-- Anota el resultado de un intento (valido o fallido). Devuelve {decision: 'continue' | 'reject', message?}.
-- 'reject' = la cuenta quedo frenada (o ya lo estaba): el servidor responde cuenta_frenada_temporalmente.
create function public.freno_acceso_anotar(p_correo text, p_valido boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if auth.uid() is not null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select p.user_id into v_uid from public.perfiles p where p.correo = lower(btrim(coalesce(p_correo, '')));
  if v_uid is null then return jsonb_build_object('decision', 'continue'); end if;
  return private.gancho_intento_de_acceso(jsonb_build_object('user_id', v_uid, 'valid', coalesce(p_valido, false)));
end $$;

revoke all on function public.freno_acceso_consultar(text), public.freno_acceso_anotar(text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.freno_acceso_consultar(text), public.freno_acceso_anotar(text, boolean) to service_role;
