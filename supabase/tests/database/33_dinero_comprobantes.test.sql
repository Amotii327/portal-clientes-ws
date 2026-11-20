-- Comprobantes de pago: el cliente sube (con permiso), el super admin acepta o rechaza con motivo.
-- Solo un comprobante ACEPTADO crea el abono. Uno rechazado no crea abono ni mueve el saldo.
begin;
select plan(79);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_dinero.sql
select tests.preparar_dinero();
-- Una ruta fija para seguir el archivo del primer comprobante.
create temp table rutas as select tests.ruta('empresa_a', 'comprobantes', 'pdf') as r1, tests.ruta('empresa_a', 'comprobantes', 'png') as r2, tests.ruta('empresa_a', 'comprobantes', 'pdf') as r3;
grant select on rutas to public;

-- ---------- Subir ----------
select tests.como(tests.id('admin_a'));
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), (select r1 from rutas), 'a.html', 'text/html', 100, 1000, private.hoy())$$, '22023', 'archivo_invalido', 'tipo de archivo no permitido (html)');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), (select r2 from rutas), 'a.pdf', 'application/pdf', 100, 1000, private.hoy())$$, '22023', 'archivo_invalido', 'la extension de la ruta debe coincidir con el tipo');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), 'otra-carpeta/x.pdf', 'a.pdf', 'application/pdf', 100, 1000, private.hoy())$$, '22023', 'archivo_invalido', 'la ruta debe ser <empresa>/comprobantes/<uuid>.<ext>');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), tests.ruta('empresa_a', 'comprobantes', 'pdf', 11534336), 'a.pdf', 'application/pdf', 100, 1000, private.hoy())$$, '22023', 'archivo_invalido', 'mas de 10 MB (tamano REAL en Storage): rechazado');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), tests.ruta('empresa_a', 'comprobantes', 'pdf', 0), 'a.pdf', 'application/pdf', 100, 1000, private.hoy())$$, '22023', 'archivo_invalido', 'archivo vacio (tamano REAL en Storage): rechazado');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), (select r1 from rutas), 'a.pdf', 'application/pdf', 100, 4000000.01, private.hoy())$$, 'P0001', 'valor_excede_pendiente', 'el valor no pasa de lo que falta por pagar');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), (select r1 from rutas), 'a.pdf', 'application/pdf', 100, 0, private.hoy())$$, '22023', 'datos_invalidos', 'valor cero');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), (select r1 from rutas), 'a.pdf', 'application/pdf', 100, 1000, private.hoy() + 1)$$, '22023', 'fechas_invalidas', 'fecha de pago futura');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), (select r1 from rutas), 'a.pdf', 'application/pdf', 100, 1000, private.hoy(), repeat('x', 501))$$, '22023', 'datos_invalidos', 'nota de mas de 500 letras');
select throws_ok($$select public.subir_comprobante(gen_random_uuid(), (select r1 from rutas), 'a.pdf', 'application/pdf', 100, 1000, private.hoy())$$, 'P0001', 'pago_no_encontrado', 'cuota inexistente');
select is((select count(*)::int from public.comprobantes_pago), 0, 'los rechazos no dejaron comprobantes');
select lives_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), (select r1 from rutas), 'pago-segundo.pdf', 'application/pdf', 123456, 4000000, private.hoy() - 1, 'Pago por PSE')$$, 'admin A: sube el comprobante de la cuota "Segundo pago"');
select is((select estado from public.comprobantes_pago), 'en_revision', 'el comprobante queda "en revision"');
select is((select estado from public.v_pagos_programados where concepto = 'Segundo pago'), 'en_revision', 'la cuota queda "en revision"');
select is(tests.abonos_de('Portal A'), 0::bigint, 'subir un comprobante NO crea abono');
select is((select saldo from public.v_contratos_saldo), 10000000.00, 'el saldo no cambia al subir');
select is((select subido_por from public.comprobantes_pago), tests.id('admin_a'), 'queda quien lo subio');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), tests.ruta('empresa_a', 'comprobantes'), 'otro.pdf', 'application/pdf', 100, 1000, private.hoy())$$, 'P0001', 'comprobante_en_revision', 'un segundo comprobante mientras hay uno en revision: rechazado');
select tests.admin();
select is((select count(*)::int from public.avisos_salientes where tipo = 'comprobante_recibido' and destino = 'super_admin' and empresa_id = tests.id('empresa_a')), 1, 'el super admin recibe un aviso en la cola');
select is((select datos ->> 'pago_id' from public.avisos_salientes where tipo = 'comprobante_recibido'), tests.pago('Segundo pago')::text, 'el aviso dice de que cuota es (por id, sin textos)');
select is((select count(*)::int from public.registro_actividad where accion = 'comprobante_subido' and actor_id = tests.id('admin_a')), 1, 'el registro anota quien subio el comprobante');
select is((select count(*)::int from information_schema.columns where table_name = 'comprobantes_pago' and column_name like 'revisado_por%'), 0, 'el comprobante no expone el nombre de quien lo reviso');

-- ---------- Revisar: permisos ----------
select tests.como(tests.id('admin_b'));
select throws_ok($$select public.confirmar_comprobante(tests.comprobante_de('Segundo pago'))$$, '42501', 'no_autorizado', 'admin B: no confirma comprobantes ajenos');
select is((select count(*)::int from public.comprobantes_pago), 0, 'admin B: no ve el comprobante de A');
select tests.como(tests.id('sa'), 'aal1');
select throws_ok($$select public.confirmar_comprobante(tests.comprobante_de('Segundo pago'))$$, '42501', 'no_autorizado', 'super admin sin 2FA: no confirma');
select tests.como(tests.id('sa'), 'aal2');
select is(jsonb_array_length(public.comprobantes_por_revisar()), 1, 'la bandeja del super admin trae 1 comprobante por revisar');
select is((public.comprobantes_por_revisar() -> 0 ->> 'empresa_nombre'), 'Empresa A', 'la bandeja dice de que empresa es');
select is((public.panel_super_admin() -> 'totales' ->> 'comprobantes_en_revision'), '1', 'el panel cuenta 1 comprobante en revision');
select is((select count(*)::int from jsonb_array_elements(public.panel_super_admin() -> 'atencion') x where x ->> 'tipo' = 'comprobante_en_revision'), 1, 'el panel lo trae en "atencion"');

-- ---------- Rechazar ----------
select throws_ok($$select public.rechazar_comprobante(tests.comprobante_de('Segundo pago'), null)$$, '22023', 'datos_invalidos', 'rechazar sin motivo: no se puede');
select throws_ok($$select public.rechazar_comprobante(tests.comprobante_de('Segundo pago'), '   ')$$, '22023', 'datos_invalidos', 'rechazar con motivo en blanco: no se puede');
select throws_ok($$select public.rechazar_comprobante(tests.comprobante_de('Segundo pago'), 'no')$$, '22023', 'datos_invalidos', 'rechazar con motivo de 2 letras: no se puede');
select is((select estado from public.comprobantes_pago), 'en_revision', 'tras los intentos sin motivo sigue en revision');
select throws_ok($$select public.rechazar_comprobante(gen_random_uuid(), 'Motivo valido')$$, 'P0001', 'comprobante_no_encontrado', 'rechazar uno inexistente');
select lives_ok($$select public.rechazar_comprobante(tests.comprobante_de('Segundo pago'), 'La imagen no se alcanza a leer. Sube una mas clara.')$$, 'el super admin rechaza con motivo');
select is((select estado from public.comprobantes_pago), 'rechazado', 'el comprobante queda rechazado');
select is(tests.abonos_de('Portal A'), 0::bigint, 'un comprobante RECHAZADO no crea abono');
select is(tests.saldo('Portal A'), 10000000.00, 'un comprobante rechazado no mueve el saldo');
select is((select count(*)::int from public.abonos where archivo_path = (select r1 from rutas)), 0, 'no hay ningun abono con el archivo rechazado');
select is((select abono_id from public.comprobantes_pago), null, 'el rechazado no tiene abono_id');
select is((select estado from public.v_pagos_programados where concepto = 'Segundo pago'), 'por_vencer', 'la cuota vuelve a "por vencer" (el cliente puede subir otro)');
select throws_ok($$select public.confirmar_comprobante(tests.comprobante_de('Segundo pago', 'rechazado'))$$, 'P0001', 'comprobante_ya_revisado', 'un rechazado no se confirma despues');
select throws_ok($$select public.rechazar_comprobante(tests.comprobante_de('Segundo pago', 'rechazado'), 'Otra vez el mismo')$$, 'P0001', 'comprobante_ya_revisado', 'tampoco se rechaza dos veces');
select tests.admin();
select is((select count(*)::int from public.avisos_salientes where tipo = 'comprobante_rechazado' and destino = 'cliente_dinero'), 1, 'el cliente recibe aviso del rechazo (cola)');
select is((select count(*)::int from public.registro_actividad where accion = 'comprobante_rechazado'), 1, 'el rechazo queda en el registro');
-- La base tambien lo impide por debajo de las funciones.
select throws_ok($$update public.comprobantes_pago set estado = 'confirmado', abono_id = null, revisado_en = now()$$, 'P0001', 'comprobante_ya_revisado', 'un rechazado no pasa a confirmado ni por UPDATE directo');
select throws_ok($$update public.comprobantes_pago set estado = 'en_revision', motivo_rechazo = null, revisado_en = null$$, 'P0001', 'comprobante_ya_revisado', 'un comprobante revisado no vuelve a revision');
select throws_ok($$delete from public.comprobantes_pago$$, '42501', 'tabla_solo_agregar: comprobantes_pago', 'los comprobantes no se borran');

-- El cliente ve el motivo
select tests.como(tests.id('admin_a'));
select is((select motivo_rechazo from public.comprobantes_pago), 'La imagen no se alcanza a leer. Sube una mas clara.', 'el cliente ve el motivo del rechazo');
select is((public.dinero_del_proyecto(tests.proy('Portal A')) #>> '{comprobantes,0,estado}'), 'rechazado', 'el cliente ve el estado rechazado en dinero_del_proyecto');
select is((public.dinero_del_proyecto(tests.proy('Portal A')) #>> '{comprobantes,0,motivo_rechazo}'), 'La imagen no se alcanza a leer. Sube una mas clara.', '... con su motivo');

-- Reusar el mismo archivo no se puede; con uno nuevo si.
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), (select r1 from rutas), 'x.pdf', 'application/pdf', 100, 4000000, private.hoy())$$, '22023', 'archivo_invalido', 'no se reusa el mismo archivo');
select lives_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), (select r3 from rutas), 'pago-segundo-bis.pdf', 'application/pdf', 99000, 4000000, private.hoy())$$, 'el cliente sube un comprobante nuevo despues del rechazo');
select is((select count(*)::int from public.comprobantes_pago where estado = 'en_revision'), 1, 'hay 1 en revision y 1 rechazado en el historial');
select is((select count(*)::int from public.comprobantes_pago), 2, 'el rechazado se conserva (no se borra)');
select tests.admin();
select throws_ok($$update public.comprobantes_pago set estado = 'confirmado', abono_id = null, revisado_en = now() where estado = 'en_revision'$$, '23514', null, 'confirmado sin abono: la base lo rechaza aunque se salten las funciones');
select tests.como(tests.id('sa'), 'aal2');

-- ---------- Confirmar ----------
select tests.como(tests.id('sa'), 'aal2');
select throws_ok($$select public.confirmar_comprobante(tests.comprobante_de('Segundo pago'), 'cheque')$$, '22023', 'datos_invalidos', 'medio de pago desconocido');
select is((public.confirmar_comprobante(tests.comprobante_de('Segundo pago'), 'transferencia', null, null, 'PSE-998877') ->> 'saldo')::numeric, 6000000.00, 'confirmar devuelve el saldo recalculado');
select is(tests.abonos_de('Portal A'), 1::bigint, 'al CONFIRMAR si se crea el abono (uno solo)');
select is(tests.saldo('Portal A'), 6000000.00, 'el saldo baja a 6.000.000');
select is((select valor from public.abonos where referencia = 'PSE-998877'), 4000000.00, 'el abono toma el valor declarado');
select is((select fecha_pago from public.abonos where referencia = 'PSE-998877'), private.hoy(), 'el abono toma la fecha declarada');
select is((select archivo_path from public.abonos where referencia = 'PSE-998877'), (select r3 from rutas), 'el abono apunta al archivo del comprobante');
select is((select abono_id from public.comprobantes_pago where estado = 'confirmado'), (select id from public.abonos where referencia = 'PSE-998877'), 'el comprobante apunta a su abono');
select is((select estado from public.v_pagos_programados where concepto = 'Segundo pago'), 'pagado', 'la cuota queda pagada');
select throws_ok($$select public.confirmar_comprobante(tests.comprobante_de('Segundo pago', 'confirmado'))$$, 'P0001', 'comprobante_ya_revisado', 'no se confirma dos veces (no se duplica el abono)');
select throws_ok($$select public.rechazar_comprobante(tests.comprobante_de('Segundo pago', 'confirmado'), 'Ya estaba confirmado')$$, 'P0001', 'comprobante_ya_revisado', 'un confirmado no se rechaza');
select is(tests.abonos_de('Portal A'), 1::bigint, 'sigue habiendo un solo abono');
select tests.admin();
select is((select count(*)::int from public.avisos_salientes where tipo = 'comprobante_confirmado'), 1, 'el cliente recibe aviso de la confirmacion (cola)');
select is((select count(*)::int from public.registro_actividad where accion in ('comprobante_confirmado', 'abono_registrado') and empresa_id = tests.id('empresa_a')), 2, 'queda en el registro el comprobante y el abono');
select throws_ok($$select public.subir_comprobante(tests.pago('Segundo pago'), tests.ruta('empresa_a', 'comprobantes'), 'x.pdf', 'application/pdf', 100, 1, private.hoy())$$, '42501', 'no_autorizado', 'control: superusuario sin sesion no es un cliente');

-- ---------- Confirmar que se pasaria del saldo: se deshace y sigue en revision ----------
select tests.como(tests.id('admin_a'));
select lives_ok($$select public.subir_comprobante(tests.pago('Anticipo'), tests.ruta('empresa_a', 'comprobantes', 'jpg'), 'anticipo.jpg', 'image/jpeg', 5000, 3000000, private.hoy() - 2)$$, 'el cliente sube el comprobante del anticipo vencido');
select tests.como(tests.id('sa'), 'aal2');
select public.crear_abono(tests.contrato('Portal A'), 5500000, private.hoy(), 'transferencia');
select throws_ok($$select public.confirmar_comprobante(tests.comprobante_de('Anticipo'))$$, 'P0001', 'abono_excede_saldo', 'confirmar un valor que pasa del saldo falla');
select is((select estado from public.comprobantes_pago where id = tests.comprobante_de('Anticipo')), 'en_revision', 'tras el fallo el comprobante sigue en revision (todo se deshizo)');
select is(tests.abonos_de('Portal A'), 2::bigint, 'no quedo ningun abono a medias');
select is((public.confirmar_comprobante(tests.comprobante_de('Anticipo'), 'transferencia', 500000) ->> 'saldo')::numeric, 0.00, 'el super admin corrige el valor (lo que vio en el banco) y confirma: saldo 0');

-- ---------- Equipo con "ver dinero" y "subir archivos" ----------
select tests.admin();
update public.miembros set subir_archivos = true where id = tests.id('miembro_equipo_a2');
select tests.como(tests.id('equipo_a2'));
select throws_ok($$select public.subir_comprobante(tests.pago('Saldo final'), tests.ruta('empresa_a', 'comprobantes'), 'x.pdf', 'application/pdf', 100, 100, private.hoy())$$, 'P0001', 'valor_excede_pendiente', 'con el contrato en saldo 0 no se admiten comprobantes nuevos');
select tests.como(tests.id('sa'), 'aal2');
select public.anular_abono((select id from public.abonos where valor = 5500000), 'El pago de 5.500.000 era de otro cliente');
select tests.como(tests.id('equipo_a2'));
select lives_ok($$select public.subir_comprobante(tests.pago('Saldo final'), tests.ruta('empresa_a', 'comprobantes'), 'saldo.pdf', 'application/pdf', 100, 3000000, private.hoy())$$, 'equipo con ver dinero Y subir archivos: sube el comprobante');
select is((select subido_por from public.comprobantes_pago where estado = 'en_revision'), tests.id('equipo_a2'), 'queda a nombre de quien lo subio');
select * from finish();
rollback;
