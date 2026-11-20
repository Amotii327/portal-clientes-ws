-- Estructura del modulo de dinero: tipos exactos, moneda, llaves compuestas, RLS, triggers y cerraduras.
begin;
select plan(27);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_dinero.sql

-- Tipos: el dinero es numeric (nunca float).
select is_empty(
  $$select table_name || '.' || column_name from information_schema.columns
     where table_schema = 'public' and table_name in ('contratos', 'pagos_programados', 'abonos', 'facturas', 'comprobantes_pago')
       and data_type in ('real', 'double precision', 'money')$$,
  'ninguna columna de dinero es float ni money');
select is((select string_agg(distinct data_type || '(' || numeric_precision || ',' || numeric_scale || ')', ',') from information_schema.columns
            where table_schema = 'public' and column_name in ('valor', 'anticipo', 'valor_declarado')
              and table_name in ('contratos', 'pagos_programados', 'abonos', 'facturas', 'comprobantes_pago')),
  'numeric(14,2)', 'todo el dinero es numeric(14,2)');
select is((select count(*)::int from pg_constraint where conrelid = 'public.contratos'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) like '%COP%USD%'), 1, 'contratos: la moneda solo admite COP o USD');

-- Llaves compuestas: contratos se enlaza a proyectos(id, empresa_id); los hijos llevan empresa_id en la llave.
select is((select pg_get_constraintdef(oid) from pg_constraint where conname = 'contratos_proyecto_fk'),
  'FOREIGN KEY (proyecto_id, empresa_id) REFERENCES proyectos(id, empresa_id)', 'contratos -> proyectos(id, empresa_id)');
select is((select count(*)::int from pg_constraint where contype = 'f'
            and conrelid in ('public.pagos_programados'::regclass, 'public.abonos'::regclass, 'public.facturas'::regclass, 'public.comprobantes_pago'::regclass)
            and array_length(conkey, 1) >= 2), 8, 'cuotas, abonos, facturas y comprobantes se enlazan con llaves compuestas (empresa_id, ...)');
select is_empty(
  $$select conrelid::regclass::text || '.' || conname from pg_constraint
     where contype = 'f' and conrelid in ('public.pagos_programados'::regclass, 'public.abonos'::regclass, 'public.facturas'::regclass,
                                           'public.comprobantes_pago'::regclass, 'public.contratos'::regclass)
       and array_length(conkey, 1) = 1 and confrelid <> 'public.perfiles'::regclass$$,
  'ninguna llave simple hacia contratos, cuotas, abonos o proyectos (solo perfiles)');

-- RLS y permisos
select is_empty($$select relname::text from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
                    and relname in ('contratos', 'pagos_programados', 'abonos', 'facturas', 'comprobantes_pago', 'avisos_salientes')
                    and not relrowsecurity$$, 'RLS activa en las 6 tablas nuevas');
select is((select count(*)::int from pg_policies where tablename in ('contratos', 'pagos_programados', 'abonos', 'facturas', 'comprobantes_pago', 'avisos_salientes')),
  6, 'una politica de lectura por tabla y ninguna de escritura (todo por funciones)');
select is_empty($$select tablename::text from pg_policies where tablename in ('contratos', 'pagos_programados', 'abonos', 'facturas', 'comprobantes_pago', 'avisos_salientes') and cmd <> 'SELECT'$$,
  'ninguna politica de escritura en dinero');
select ok(not has_table_privilege('authenticated', 'public.abonos', 'insert') and not has_table_privilege('authenticated', 'public.abonos', 'update')
          and not has_table_privilege('authenticated', 'public.abonos', 'delete'), 'authenticated no escribe abonos directo');
select ok(not has_table_privilege('authenticated', 'public.comprobantes_pago', 'insert') and not has_table_privilege('authenticated', 'public.comprobantes_pago', 'update'),
  'authenticated no escribe comprobantes directo');
select ok(has_table_privilege('service_role', 'public.avisos_salientes', 'select') and not has_table_privilege('service_role', 'public.avisos_salientes', 'insert')
          and not has_table_privilege('service_role', 'public.avisos_salientes', 'delete'), 'service_role LEE la cola (la vacia el despachador), pero no inserta ni borra; ver prueba 50');
select ok(not has_table_privilege('anon', 'public.contratos', 'select') and not has_table_privilege('anon', 'public.v_ingresos_por_mes', 'select'),
  'anon no lee contratos ni ingresos');
select is_empty($$select c.relname::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
                    and c.relname like 'v\_%' and (c.relname like 'v\_contratos%' or c.relname like 'v\_pagos%' or c.relname like 'v\_ingresos%')
                    and not coalesce(c.reloptions::text like '%security_invoker=true%', false)$$, 'las vistas de dinero son security_invoker');

-- Triggers: empresa_id inmutable, cerradura de "ver como", registro
select is_empty($$select t from unnest(array['contratos', 'pagos_programados', 'abonos', 'facturas', 'comprobantes_pago', 'avisos_salientes']) t
                   where not exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
                                      where g.tgrelid = ('public.' || t)::regclass and p.proname = 'empresa_id_inmutable')$$,
  'empresa_id inmutable en las 6 tablas');
select is_empty($$select t from unnest(array['contratos', 'pagos_programados', 'abonos', 'facturas', 'comprobantes_pago', 'avisos_salientes']) t
                   where not exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
                                      where g.tgrelid = ('public.' || t)::regclass and p.proname = 'bloquear_escritura_ver_como')$$,
  'las 6 tablas llevan el trigger ver_como_solo_lectura');
select is_empty($$select t from unnest(array['contratos', 'pagos_programados', 'abonos', 'facturas', 'comprobantes_pago']) t
                   where not exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
                                      where g.tgrelid = ('public.' || t)::regclass and p.proname = 'trg_registro_dinero')$$,
  'el registro de actividad lo escriben triggers en las 5 tablas de dinero');

-- Funciones: ninguna se llama registrar*; nada ejecutable por anon; las SECURITY DEFINER con search_path vacio
select is_empty($$select proname::text from pg_proc where pronamespace = 'public'::regnamespace and proname like 'registrar%'$$,
  'ningun nombre de funcion empieza por "registrar" (reservado)');
select is_empty($$select p.proname::text from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
                    and has_function_privilege('anon', p.oid, 'execute') and p.proname in
                    ('crear_contrato', 'editar_contrato', 'agregar_pago', 'editar_pago', 'quitar_pago', 'crear_abono', 'anular_abono', 'crear_factura',
                     'anular_factura', 'anotar_descarga_factura', 'subir_comprobante', 'confirmar_comprobante', 'rechazar_comprobante',
                     'generar_recordatorios_pago', 'dinero_del_proyecto', 'comprobantes_por_revisar')$$, 'anon no ejecuta ninguna funcion de dinero');
select is_empty($$select p.proname::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'generar_recordatorios_pago'
                    and has_function_privilege('authenticated', p.oid, 'execute')$$, 'generar_recordatorios_pago: authenticated no la ejecuta');
select ok(has_function_privilege('service_role', 'public.generar_recordatorios_pago()', 'execute'), 'generar_recordatorios_pago: solo la clave de sistema');
select ok(not has_function_privilege('authenticated', 'private.contrato_para_cambio(uuid)', 'execute'), 'las funciones internas no son ejecutables por authenticated');

-- Restricciones de datos (como superusuario, directo)
select tests.preparar_dinero();
-- Un proyecto de la empresa C con su contrato (para probar cruces de empresa sin que salte antes otra regla).
insert into public.proyectos (empresa_id, nombre) values (tests.id('empresa_c'), 'Portal C');
insert into public.contratos (empresa_id, proyecto_id, valor, moneda) values (tests.id('empresa_c'), tests.proy('Portal C'), 100, 'COP');
insert into public.proyectos (empresa_id, nombre) values (tests.id('empresa_c'), 'Portal C2');
select throws_ok($$insert into public.contratos (empresa_id, proyecto_id, valor, moneda) values (tests.id('empresa_a'), tests.proy('Portal A'), 1, 'COP')$$,
  '23505', null, 'un solo contrato por proyecto');
select throws_ok($$update public.contratos set empresa_id = tests.id('empresa_b') where proyecto_id = tests.proy('Portal A')$$, '23514', 'empresa_id_inmutable', 'empresa_id del contrato no se muda');
select throws_ok($$insert into public.contratos (empresa_id, proyecto_id, valor, moneda) values (tests.id('empresa_a'), tests.proy('Portal C2'), 1, 'COP')$$,
  '23503', null, 'un contrato no puede declarar otra empresa que la de su proyecto (llave compuesta)');
select throws_ok($$insert into public.contratos (empresa_id, proyecto_id, valor, moneda) values (tests.id('empresa_c'), gen_random_uuid(), 1, 'EUR')$$,
  '23514', null, 'moneda fuera de COP/USD: rechazada');
select throws_ok($$insert into public.pagos_programados (empresa_id, contrato_id, concepto, valor, vence_el) values (tests.id('empresa_a'), tests.contrato('Portal C'), 'Cruzado', 1, current_date)$$,
  '23503', null, 'una cuota no puede declarar otra empresa que la de su contrato (llave compuesta)');
