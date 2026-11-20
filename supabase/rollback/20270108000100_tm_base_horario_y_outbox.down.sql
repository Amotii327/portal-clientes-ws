drop table if exists public.outbox_correos;
delete from public.configuracion where clave = 'semaforo_tickets';
drop function if exists private.encolar_a_admins_cliente(uuid, text, jsonb, text);
drop function if exists private.encolar_a_super_admins(uuid, text, jsonb, text);
drop function if exists private.encolar_correo(uuid, text, uuid, jsonb, text);
drop function if exists private.semaforo_umbral_amarillo();
drop function if exists private.minutos_habiles_entre(timestamptz, timestamptz, int[], time, time, text);
drop function if exists private.sumar_minutos_habiles(timestamptz, numeric, int[], time, time, text);
drop function if exists private.proximo_inicio_habil(timestamp, int[], time, time);
