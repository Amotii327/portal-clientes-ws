do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname) from cron.job
      where jobname in ('portal-cerrar-tickets-vencidos', 'portal-corte-mensual-mantenimiento');
  end if;
end $$;
drop function if exists private.cerrar_tickets_vencidos(timestamptz);
drop function if exists private.cerrar_mes_bolsas(date);
drop function if exists private.aplicar_parametros(uuid, jsonb);
drop function if exists private.bolsa_agotada_sin_autorizacion(uuid);
drop function if exists private.asegurar_bolsa(uuid, date, numeric);
drop function if exists private.ticket_autorizado(public.tickets);
drop function if exists private.ticket_visible(uuid, boolean);
drop function if exists private.minutos_restantes_en(uuid, text, timestamptz, timestamptz, timestamptz, timestamptz);
drop function if exists private.semaforo_en(uuid, text, timestamptz, timestamptz, numeric, timestamptz, timestamptz);
drop function if exists private.calcular_plazo(uuid, text, timestamptz);
drop function if exists private.plazo_minutos(uuid, text, date);
drop function if exists private.horario_de(uuid, date);
drop function if exists private.motivo_fuera_de_plan(uuid, text, uuid, date);
drop function if exists private.en_garantia(uuid, uuid, date);
drop function if exists private.mantenimiento_vigente(uuid, date);
