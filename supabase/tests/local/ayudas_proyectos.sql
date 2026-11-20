-- Ayudas para las pruebas del sprint 2 (se incluye despues de fixtures.sql). Buscan ids por nombre,
-- con permisos de superusuario, para poder usarlas dentro de sentencias entre $$ ... $$.
create function tests.proy(p_nombre text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.proyectos where nombre = p_nombre
$$;
create function tests.hito(p_proyecto text, p_numero int) returns uuid language sql security definer set search_path = '' as $$
  select h.id from public.hitos h join public.proyectos p on p.id = h.proyecto_id
   where p.nombre = p_proyecto and h.numero = p_numero
$$;
create function tests.sprint(p_proyecto text, p_numero int) returns uuid language sql security definer set search_path = '' as $$
  select s.id from public.sprints s join public.proyectos p on p.id = s.proyecto_id
   where p.nombre = p_proyecto and s.numero = p_numero
$$;
grant execute on function tests.proy(text), tests.hito(text, int), tests.sprint(text, int) to public;

-- Estado de un hito / sprint (lectura como superusuario).
create function tests.estado_hito(p_proyecto text, p_numero int) returns text language sql security definer set search_path = '' as $$
  select h.estado from public.hitos h where h.id = tests.hito(p_proyecto, p_numero)
$$;
create function tests.avance(p_proyecto text) returns text language sql security definer set search_path = '' as $$
  select avance_partes_hechas || '/' || avance_partes_total || '=' || avance_pct from public.proyectos where nombre = p_proyecto
$$;
grant execute on function tests.estado_hito(text, int), tests.avance(text) to public;

-- Crea "Portal A" (empresa A) y "Portal B" (empresa B) como super admin.
create function tests.crear_proyectos() returns void language plpgsql as $$
begin
  perform tests.como(tests.id('sa'), 'aal2');
  perform public.crear_proyecto(tests.id('empresa_a'), 'Portal A', 'Proyecto de A', '2026-11-30', '2027-02-01');
  perform public.crear_proyecto(tests.id('empresa_b'), 'Portal B', null, null, null);
  perform tests.admin();
end $$;

-- Sprint 3: "terminado" de sprints y del hito 5 solo lo da la aprobacion del cliente. Las pruebas del sprint 2
-- que terminan a mano usan esta ayuda: enciende, dentro de la transaccion de la prueba, la misma marca que
-- enciende responder_revision. (Un usuario de la API no puede poner esa marca.)
create function tests.permitir_terminar() returns void language plpgsql as $$
begin
  perform set_config('portal.aprobacion_cliente', 'on', true);
end $$;
