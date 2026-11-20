-- Facturas (a nombre de Amotii, PDF en Storage privado) y reglas de los archivos del modulo: quien puede leer y subir
-- cada ruta. Las reglas de storage.objects llaman a estas funciones (en la base local solo se prueban las funciones).
begin;
select plan(65);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_dinero.sql
select tests.preparar_dinero();
create temp table rutas as select tests.ruta('empresa_a', 'facturas') as fa, tests.ruta('empresa_b', 'facturas') as fb,
  tests.ruta('empresa_a', 'facturas') as fa2, tests.ruta('empresa_a', 'comprobantes', 'jpg') as ca, tests.ruta('empresa_b', 'comprobantes', 'pdf') as cb;
grant select on rutas to public;

-- ---------- Subir facturas (solo el super admin) ----------
select tests.como(tests.id('sa'), 'aal2');
select lives_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS-2026-001', 3000000, private.hoy() - 9, (select fa from rutas), 'anticipo-amotii.pdf', 52000, tests.pago('Anticipo'))$$, 'el super admin sube una factura de A');
select lives_ok($$select public.crear_factura(tests.contrato('Portal B'), 'WS-2026-002', 5000, private.hoy() - 1, (select fb from rutas), 'anticipo-b.pdf', 52000)$$, 'y una de B');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS-2026-001', 1, private.hoy(), tests.ruta('empresa_a', 'facturas'), 'x.pdf', 100)$$, 'P0001', 'factura_numero_repetido', 'el numero de factura no se repite');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS-9', 1, private.hoy(), tests.ruta('empresa_a', 'comprobantes'), 'x.pdf', 100)$$, '22023', 'archivo_invalido', 'la factura debe ir en la carpeta de facturas');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS-9', 1, private.hoy(), tests.ruta('empresa_a', 'facturas', 'png'), 'x.png', 100)$$, '22023', 'archivo_invalido', 'la factura es PDF (una imagen no)');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS-9', 1, private.hoy(), tests.ruta('empresa_b', 'facturas'), 'x.pdf', 100)$$, '22023', 'archivo_invalido', 'la ruta de la factura debe ser de la empresa del contrato');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS-9', 1, private.hoy(), 'cualquier-cosa.pdf', 'x.pdf', 100)$$, '22023', 'archivo_invalido', 'ruta que no sigue el formato');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS-9', 1, private.hoy(), tests.ruta('empresa_a', 'facturas'), 'x.pdf', 20971521)$$, '22023', 'datos_invalidos', 'mas de 20 MB: rechazada');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS 9 con espacios', 1, private.hoy(), tests.ruta('empresa_a', 'facturas'), 'x.pdf', 100)$$, '22023', 'datos_invalidos', 'numero de factura con espacios');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS-9', 0, private.hoy(), tests.ruta('empresa_a', 'facturas'), 'x.pdf', 100)$$, '22023', 'datos_invalidos', 'valor cero');
select throws_ok($$select public.crear_factura(tests.contrato('Portal A'), 'WS-9', 1, private.hoy(), tests.ruta('empresa_a', 'facturas'), 'x.pdf', 100, tests.pago('Anticipo B'))$$, 'P0001', 'pago_no_encontrado', 'la cuota de la factura debe ser del mismo contrato');
select is((select count(*)::int from public.facturas), 2, 'los rechazos no dejaron facturas');
select throws_ok($$select public.crear_factura(gen_random_uuid(), 'WS-9', 1, private.hoy(), tests.ruta('empresa_a', 'facturas'), 'x.pdf', 100)$$, 'P0001', 'contrato_no_encontrado', 'contrato inexistente');

-- ---------- Cada cual ve las suyas ----------
select tests.como(tests.id('admin_a'));
select is((select numero from public.facturas), 'WS-2026-001', 'admin A: ve su factura');
select is((public.dinero_del_proyecto(tests.proy('Portal A')) #>> '{facturas,0,archivo_nombre}'), 'anticipo-amotii.pdf', 'admin A: dinero_del_proyecto trae la factura');
select is((select count(*)::int from public.facturas where numero = 'WS-2026-002'), 0, 'admin A: no ve la de B');
select throws_ok($$select public.anular_factura((select id from public.facturas), 'Intento anularla')$$, '42501', 'no_autorizado', 'admin A: no anula facturas');
select throws_ok($$update public.facturas set valor = 1$$, '42501', null, 'admin A: no edita facturas');
select tests.como(tests.id('equipo_a'));
select is((select count(*)::int from public.facturas), 0, 'equipo sin ver dinero: no ve facturas');
select tests.como(tests.id('equipo_a2'));
select is((select count(*)::int from public.facturas), 1, 'equipo con ver dinero: ve la factura de su empresa');
select tests.como(tests.id('admin_b'));
select is((select numero from public.facturas), 'WS-2026-002', 'admin B: solo la suya');

-- ---------- Una factura no se edita ni se borra: se anula ----------
select tests.admin();
select throws_ok($$update public.facturas set valor = 1 where numero = 'WS-2026-001'$$, '23514', 'campo_inmutable: valor', 'el valor de una factura no se edita');
select throws_ok($$update public.facturas set numero = 'OTRO-1' where numero = 'WS-2026-001'$$, '23514', 'campo_inmutable: numero', 'el numero de una factura no se edita');
select throws_ok($$update public.facturas set archivo_path = (select fa2 from rutas) where numero = 'WS-2026-001'$$, '23514', 'campo_inmutable: archivo_path', 'el archivo de una factura no se reemplaza en silencio');
select throws_ok($$delete from public.facturas$$, '42501', 'tabla_solo_agregar: facturas', 'una factura no se borra');
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.anular_factura((select id from public.facturas where numero = 'WS-2026-001'), 'no')$$, '22023', 'datos_invalidos', 'anular exige motivo');
select lives_ok($$select public.anular_factura((select id from public.facturas where numero = 'WS-2026-001'), 'Se emitio con el NIT equivocado')$$, 'anular una factura con motivo');
select throws_ok($$select public.anular_factura((select id from public.facturas where numero = 'WS-2026-001'), 'Otra vez la misma')$$, 'P0001', 'factura_ya_anulada', 'no se anula dos veces');
select throws_ok($$select public.anular_factura(gen_random_uuid(), 'Motivo valido')$$, 'P0001', 'factura_no_encontrada', 'factura inexistente');
select tests.como(tests.id('admin_a'));
select is((select anulada_motivo from public.facturas), 'Se emitio con el NIT equivocado', 'el cliente ve que se anulo y por que');
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion in ('factura_subida', 'factura_anulada')), 3, 'subidas y anulacion quedan en el registro');

-- ---------- Descargas al registro ----------
select tests.como(tests.id('admin_a'));
select public.anotar_descarga_factura((select id from public.facturas));
select public.anotar_descarga_factura((select id from public.facturas));
select tests.como(tests.id('admin_b'));
select public.anotar_descarga_factura(tests.factura('WS-2026-001'));
select tests.como(tests.id('equipo_a'));
select public.anotar_descarga_factura(tests.factura('WS-2026-001'));
select tests.admin();
select is((select count(*)::int from public.registro_actividad where accion = 'factura_descargada'), 1, 'solo queda 1 descarga: la del admin A (2 llamadas en un minuto = 1 anotacion; el admin de B y el equipo sin ver dinero no anotan)');
select is((select actor_id from public.registro_actividad where accion = 'factura_descargada'), tests.id('admin_a'), 'queda quien descargo');

-- ---------- Quien puede LEER un archivo ----------
select tests.como(tests.id('sa'), 'aal2');
create temp table r2 as select tests.ruta('empresa_a', 'abonos', 'png') as ra;
grant select on r2 to public;
select public.crear_abono(tests.contrato('Portal A'), 1000, private.hoy(), 'otro', null, null, (select ra from r2));
select is(private.puede_leer_archivo_dinero((select fa from rutas)), true, 'super admin: lee la factura de A');
select is(private.puede_leer_archivo_dinero((select fb from rutas)), true, 'super admin: lee la factura de B');
select is(private.puede_leer_archivo_dinero(tests.ruta('empresa_a', 'facturas')), false, 'super admin: una ruta sin fila dueña no se lee (la regla mira la tabla, no la carpeta)');
select is(private.puede_leer_archivo_dinero(null), false, 'ruta nula: no');
select tests.como(tests.id('sa'), 'aal1');
select is(private.puede_leer_archivo_dinero((select fa from rutas)), false, 'super admin sin 2FA: no lee');
select tests.como(tests.id('admin_a'));
select is(private.puede_leer_archivo_dinero((select fa from rutas)), true, 'admin A: lee su factura');
select is(private.puede_leer_archivo_dinero((select fb from rutas)), false, 'admin A: NO lee la factura de B');
select is(private.puede_leer_archivo_dinero(tests.ruta('empresa_a', 'facturas')), false, 'admin A: una ruta de su carpeta sin fila dueña no se lee');
select is(private.puede_leer_archivo_dinero((select ra from r2)), true, 'admin A: lee el soporte de su abono');
select tests.como(tests.id('equipo_a'));
select is(private.puede_leer_archivo_dinero((select fa from rutas)), false, 'equipo sin ver dinero: NO lee la factura de su propia empresa');
select is(private.puede_leer_archivo_dinero((select ra from r2)), false, 'equipo sin ver dinero: NO lee el soporte de un abono');
select tests.como(tests.id('equipo_a2'));
select is(private.puede_leer_archivo_dinero((select fa from rutas)), true, 'equipo con ver dinero: lee la factura de su empresa');
select is(private.puede_leer_archivo_dinero((select fb from rutas)), false, 'equipo con ver dinero: no lee la de B');
select tests.como(tests.id('quitado_a'));
select is(private.puede_leer_archivo_dinero((select fa from rutas)), false, 'miembro quitado: no lee');
select tests.como(tests.id('admin_c'));
select is(private.puede_leer_archivo_dinero((select fa from rutas)), false, 'admin de empresa pausada: no lee');
select tests.como(tests.id('admin_b'));
select is(private.puede_leer_archivo_dinero((select ra from r2)), false, 'admin B: no lee el soporte del abono de A');
select is(private.puede_leer_archivo_dinero((select fa from rutas)), false, 'admin B: no lee la factura de A');
select is(private.puede_leer_archivo_dinero((select fb from rutas)), true, 'admin B: lee la suya');
select tests.anonimo();
select throws_ok($$select private.puede_leer_archivo_dinero('x')$$, '42501', null, 'visitante: ni siquiera ejecuta la regla');

-- ---------- Quien puede SUBIR un archivo ----------
select tests.como(tests.id('sa'), 'aal2');
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'facturas')), true, 'super admin: sube facturas a la carpeta de A');
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_b', 'facturas')), true, 'super admin: sube facturas a la carpeta de B');
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'otra')), false, 'super admin: solo las 3 carpetas del modulo');
select is(private.puede_subir_archivo_dinero('x/y.pdf'), false, 'ruta invalida: no');
select tests.como(tests.id('sa'), 'aal1');
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'facturas')), false, 'super admin sin 2FA: no sube');
select tests.como(tests.id('admin_a'));
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'comprobantes', 'png')), true, 'admin A: sube comprobantes a la carpeta de su empresa');
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'facturas')), false, 'admin A: NO sube facturas');
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_b', 'comprobantes')), false, 'admin A: NO sube a la carpeta de B');
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'comprobantes', 'exe')), false, 'admin A: solo pdf, png, jpg o webp');
select tests.como(tests.id('equipo_a2'));
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'comprobantes')), false, 'equipo con ver dinero pero sin subir archivos: no sube');
select tests.como(tests.id('equipo_a'));
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'comprobantes')), false, 'equipo sin permisos: no sube');
select tests.admin();
update public.miembros set subir_archivos = true where id = tests.id('miembro_equipo_a');
select tests.como(tests.id('equipo_a'));
select is(private.puede_subir_archivo_dinero(tests.ruta('empresa_a', 'comprobantes')), false, 'equipo con subir archivos pero SIN ver dinero: no sube comprobantes');
select tests.anonimo();
select throws_ok($$select private.puede_subir_archivo_dinero('x')$$, '42501', null, 'visitante: ni siquiera ejecuta la regla de subida');
select * from finish();
rollback;
