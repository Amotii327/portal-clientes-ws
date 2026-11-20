-- Correcciones de Calidad: B-1 (aviso con el valor confirmado), B-3 (hito_id oculto), B-4 (abono del mismo contrato),
-- M-2 (comprobante validado contra el archivo real en Storage; aqui con un Storage de mentira dentro de la transaccion).
begin;
select plan(16);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_dinero.sql
select tests.preparar_dinero();

-- ---------- B-4 ----------
select is((select pg_get_constraintdef(oid) from pg_constraint where conname = 'comprobantes_abono_fk'),
  'FOREIGN KEY (empresa_id, contrato_id, abono_id) REFERENCES abonos(empresa_id, contrato_id, id)', 'el abono de un comprobante debe ser del mismo contrato (llave compuesta)');
select tests.como(tests.id('admin_a'));
select public.subir_comprobante(tests.pago('Segundo pago'), tests.ruta('empresa_a', 'comprobantes'), 'c.pdf', 'application/pdf', 100, 4000000, private.hoy());
select tests.admin();
-- Un abono del contrato de B no puede colgarse de un comprobante de A (ni de otra empresa ni de otro contrato).
insert into public.abonos (empresa_id, contrato_id, valor, fecha_pago, medio) values (tests.id('empresa_b'), tests.contrato('Portal B'), 10, private.hoy(), 'otro');
select throws_ok($$update public.comprobantes_pago set estado = 'confirmado', abono_id = (select id from public.abonos where empresa_id = tests.id('empresa_b')), revisado_en = now()$$,
  '23503', null, 'un comprobante no se enlaza a un abono de otro contrato');

-- ---------- B-1 ----------
select tests.como(tests.id('sa'), 'aal2');
select public.confirmar_comprobante(tests.comprobante_de('Segundo pago'), 'transferencia', 3500000);
select tests.admin();
select is((select (datos ->> 'valor')::numeric from public.avisos_salientes where tipo = 'comprobante_confirmado'), 3500000.00, 'el aviso de confirmado trae el valor del abono (3.500.000), no el declarado (4.000.000)');
select is((select valor_declarado from public.comprobantes_pago where estado = 'confirmado'), 4000000.00, 'control: el cliente habia declarado 4.000.000');

-- ---------- B-3 ----------
-- Una cuota atada al hito 13 (oculto) y otra al hito 11 (visible).
select tests.como(tests.id('sa'), 'aal2');
select public.crear_proyecto(tests.id('empresa_a'), 'Portal A3');
select public.crear_contrato(tests.proy('Portal A3'), 1000, 'COP');
select public.agregar_pago(tests.contrato('Portal A3'), 'Cuota mantenimiento', 100, private.hoy() + 30, tests.hito('Portal A3', 13));
select public.agregar_pago(tests.contrato('Portal A3'), 'Cuota hito 11', 100, private.hoy() + 31, tests.hito('Portal A3', 11));
select is((select hito_id from public.v_pagos_programados where concepto = 'Cuota mantenimiento'), tests.hito('Portal A3', 13), 'super admin: ve el hito oculto');
select tests.como(tests.id('admin_a'));
select is((select hito_id from public.v_pagos_programados where concepto = 'Cuota mantenimiento'), null, 'admin A: hito_id viene null si el hito esta oculto');
select is((select hito_numero from public.v_pagos_programados where concepto = 'Cuota mantenimiento'), null, 'admin A: tampoco numero ni nombre');
select is((select hito_id from public.v_pagos_programados where concepto = 'Cuota hito 11'), tests.hito('Portal A3', 11), 'admin A: un hito visible si llega');
select is((select (x ->> 'hito_id') from jsonb_array_elements(public.dinero_del_proyecto(tests.proy('Portal A3')) -> 'pagos') x where x ->> 'concepto' = 'Cuota mantenimiento'), null, 'dinero_del_proyecto: hito_id null para el hito oculto');
select throws_ok($$select hito_id from public.pagos_programados$$, '42501', null, 'la columna cruda hito_id de la tabla ya no se puede leer');
select is((select count(*)::int from public.pagos_programados where concepto = 'Cuota mantenimiento'), 1, 'el resto de la tabla se sigue leyendo');

-- ---------- M-2: Storage de mentira ----------
select tests.admin();
create schema storage;
create table storage.objects (bucket_id text, name text, metadata jsonb);
create temp table rr as select tests.ruta('empresa_a', 'comprobantes', 'pdf') as buena, tests.ruta('empresa_a', 'comprobantes', 'pdf') as ausente,
  tests.ruta('empresa_a', 'comprobantes', 'pdf') as falsa, tests.ruta('empresa_a', 'comprobantes', 'pdf') as grande;
grant select on rr to public;
insert into storage.objects select 'dinero', buena, '{"mimetype": "application/pdf", "size": 2048}' from rr;
insert into storage.objects select 'dinero', falsa, '{"mimetype": "text/html", "size": 100}' from rr;
insert into storage.objects select 'dinero', grande, '{"mimetype": "application/pdf", "size": 99999999}' from rr;
grant usage on schema storage to public; grant select on storage.objects to public;
select tests.como(tests.id('admin_a'));
select throws_ok($$select public.subir_comprobante(tests.pago('Saldo final'), (select ausente from rr), 'a.pdf', 'application/pdf', 100, 100, private.hoy())$$, '22023', 'archivo_invalido', 'el archivo debe existir de verdad en Storage');
select throws_ok($$select public.subir_comprobante(tests.pago('Saldo final'), (select falsa from rr), 'a.pdf', 'application/pdf', 100, 100, private.hoy())$$, '22023', 'archivo_invalido', 'el tipo REAL del archivo debe ser el declarado (era html)');
select throws_ok($$select public.subir_comprobante(tests.pago('Saldo final'), (select grande from rr), 'a.pdf', 'application/pdf', 100, 100, private.hoy())$$, '22023', 'archivo_invalido', 'el tamano REAL manda sobre el declarado (era de 99 MB)');
select lives_ok($$select public.subir_comprobante(tests.pago('Saldo final'), (select buena from rr), 'a.pdf', 'application/pdf', 100, 100, private.hoy())$$, 'el archivo real y correcto se acepta');
select is((select tamano_bytes from public.comprobantes_pago where archivo_path = (select buena from rr)), 2048, 'se guarda el tamano real (2048), no el declarado (100)');
select * from finish();
rollback;
