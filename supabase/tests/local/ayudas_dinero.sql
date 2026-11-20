-- Ayudas para las pruebas del sprint 4 (dinero). Se incluye despues de fixtures.sql y ayudas_proyectos.sql.
-- Buscan ids por nombre con permisos de superusuario, para poder usarlas dentro de sentencias entre $$ ... $$.
create function tests.contrato(p_proyecto text) returns uuid language sql security definer set search_path = '' as $$
  select c.id from public.contratos c join public.proyectos p on p.id = c.proyecto_id where p.nombre = p_proyecto
$$;
create function tests.pago(p_concepto text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.pagos_programados where concepto = p_concepto
$$;
create function tests.comprobante_de(p_concepto text, p_estado text default 'en_revision') returns uuid language sql security definer set search_path = '' as $$
  select k.id from public.comprobantes_pago k join public.pagos_programados p on p.id = k.pago_programado_id
   where p.concepto = p_concepto and k.estado = p_estado limit 1
$$;
create function tests.abonos_de(p_proyecto text) returns bigint language sql security definer set search_path = '' as $$
  select count(*) from public.abonos a join public.contratos c on c.id = a.contrato_id join public.proyectos p on p.id = c.proyecto_id
   where p.nombre = p_proyecto and a.anulado_en is null
$$;
create function tests.saldo(p_proyecto text) returns numeric language sql security definer set search_path = '' as $$
  select saldo from public.v_contratos_saldo where proyecto_id = tests.proy(p_proyecto)
$$;
create function tests.factura(p_numero text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.facturas where numero = p_numero
$$;
-- Ruta de archivo valida y nueva: <empresa>/<carpeta>/<uuid>.<ext>
-- Para "comprobantes" tambien deja el objeto en el Storage simulado (con Storage real, subir_comprobante exige que el
-- archivo exista y usa su tipo y tamano REALES). Tipo segun la extension y 2000 bytes, salvo que se pida otro tamano.
create function tests.ruta(p_empresa text, p_carpeta text, p_ext text default 'pdf', p_tam bigint default 2000) returns text
language plpgsql security definer set search_path = '' as $$
declare v_ruta text := tests.id(p_empresa)::text || '/' || p_carpeta || '/' || gen_random_uuid() || '.' || p_ext;
begin
  if p_carpeta = 'comprobantes' and to_regclass('storage.objects') is not null then
    insert into storage.objects (bucket_id, name, metadata)
    values ('dinero', v_ruta, jsonb_build_object('size', p_tam, 'mimetype',
      case p_ext when 'pdf' then 'application/pdf' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' else 'x/x' end));
  end if;
  return v_ruta;
end $$;
grant execute on function tests.contrato(text), tests.pago(text), tests.comprobante_de(text, text), tests.abonos_de(text),
  tests.saldo(text), tests.factura(text), tests.ruta(text, text, text, bigint) to public;

-- Prepara dinero para las empresas A y B (como super admin con 2FA):
--   Portal A: contrato 10.000.000 COP, anticipo 3.000.000; cuotas
--     "Anticipo" 3.000.000 (vencida hace 10 dias, atada al hito 1),
--     "Segundo pago" 4.000.000 (vence en 2 dias: por vencer),
--     "Saldo final" 3.000.000 (vence en 60 dias, atada al hito 11).
--   Portal B: contrato 5.000 USD; cuota "Anticipo B" 5.000 (vence en 10 dias).
-- Deja la sesion como superusuario.
create function tests.preparar_dinero() returns void language plpgsql as $$
declare c_a uuid; c_b uuid;
begin
  perform tests.crear_proyectos();
  perform tests.como(tests.id('sa'), 'aal2');
  c_a := (public.crear_contrato(tests.proy('Portal A'), 10000000, 'COP', 3000000, private.hoy() - 30) ->> 'contrato_id')::uuid;
  c_b := (public.crear_contrato(tests.proy('Portal B'), 5000, 'USD', 5000, private.hoy() - 5) ->> 'contrato_id')::uuid;
  perform public.agregar_pago(c_a, 'Anticipo', 3000000, private.hoy() - 10, tests.hito('Portal A', 1));
  perform public.agregar_pago(c_a, 'Segundo pago', 4000000, private.hoy() + 2);
  perform public.agregar_pago(c_a, 'Saldo final', 3000000, private.hoy() + 60, tests.hito('Portal A', 11));
  perform public.agregar_pago(c_b, 'Anticipo B', 5000, private.hoy() + 10);
  perform tests.admin();
end $$;
