-- Ayudas para las pruebas de tickets y mantenimiento (sprint 5 y 6). Se incluye DESPUES de fixtures.sql
-- (\ir ../local/fixtures_tickets.sql) dentro de la transaccion de cada prueba.

-- true si la sentencia falla con ese codigo estable de error (o "codigo: detalle").
create function tests.error_es(p_sql text, p_msg text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlerrm = p_msg or sqlerrm like p_msg || ':%';
end $$;

-- Ticket creado directo como superusuario (para fijar la fecha de creacion). Quien llama debe ser superusuario.
create function tests.ticket_directo(
  p_empresa uuid, p_miembro uuid, p_user uuid, p_tipo text, p_prioridad text,
  p_creado timestamptz default now(), p_titulo text default 'Ticket de prueba') returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.tickets (empresa_id, miembro_id, creado_por, tipo, titulo, detalle, prioridad_propuesta, creado_en)
  values (p_empresa, p_miembro, p_user, p_tipo, p_titulo, 'Detalle de prueba', p_prioridad, p_creado)
  returning id into v;
  return v;
end $$;

-- Hoy en Colombia, como texto (para fechas de inicio de planes).
create function tests.hoy_mas(p_dias int) returns text language sql as $$
  select (private.hoy() + p_dias)::text
$$;
