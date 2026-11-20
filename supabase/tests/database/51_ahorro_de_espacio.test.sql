-- Solicitud de cambio 5 · Ahorro de espacio: cupo por empresa, videos de tickets, archivos archivados y resumen del registro.
begin;
select plan(91);
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_revdocs.sql
\ir ../local/fixtures_tickets.sql
select tests.preparar_revdocs();
select tests.ticket_directo(tests.id('empresa_a'), tests.id('miembro_equipo_a'), tests.id('equipo_a'), 'error', 'normal') as ta \gset
select tests.ticket_directo(tests.id('empresa_b'), tests.id('miembro_equipo_b'), tests.id('equipo_b'), 'error', 'normal') as tb \gset

-- ---------- 1) Cupo ----------
select tests.como(tests.id('admin_a'), 'aal2');
select is((public.espacio_de_empresa() ->> 'cupo_bytes')::bigint, 1073741824::bigint, 'el cupo por defecto es 1 GB');
select is(public.espacio_de_empresa() ->> 'estado', 'ok', 'con poco uso el estado es ok');
select is((public.espacio_de_empresa(tests.id('empresa_b')) ->> 'empresa_id')::uuid, tests.id('empresa_a'), 'el admin del cliente solo ve SU empresa (el parametro se ignora)');
select throws_ok($$select public.fijar_cupo_espacio(tests.id('empresa_a'), 20971520)$$, '42501', null, 'el admin del cliente no cambia su cupo');
select throws_ok($$select public.espacio_por_empresas()$$, '42501', null, 'el admin del cliente no ve el espacio de las demas empresas');
select tests.como(tests.id('equipo_a'));
select throws_ok($$select public.espacio_de_empresa()$$, '42501', 'no_autorizado', 'el equipo sin ser admin no ve el espacio');
select tests.anonimo();
select throws_ok($$select public.espacio_de_empresa()$$, '42501', null, 'un visitante no ve nada');
select throws_ok($$select public.fijar_cupo_espacio(tests.id('empresa_a'), 20971520)$$, '42501', null, 'un visitante no cambia cupos');

select tests.como(tests.id('sa'), 'aal2');
select is(jsonb_array_length(public.espacio_por_empresas()) >= 2, true, 'el super admin ve el espacio de todas las empresas');
select throws_ok($$select public.fijar_cupo_espacio(tests.id('empresa_a'), 5242880)$$, '22023', 'datos_invalidos', 'un cupo menor a 10 MB no vale');
select throws_ok($$select public.fijar_cupo_espacio(gen_random_uuid(), 20971520)$$, 'P0001', 'empresa_no_encontrada', 'empresa que no existe');
select is((public.fijar_cupo_espacio(tests.id('empresa_a'), 10485760) ->> 'cupo_bytes')::bigint, 10485760::bigint, 'el super admin fija el cupo de A en 10 MB');
select is((select count(*)::int from public.registro_actividad where accion = 'cupo_espacio_cambiado' and empresa_id = tests.id('empresa_a')), 1, 'el cambio de cupo queda en el registro');
select is((public.espacio_de_empresa(tests.id('empresa_b')) ->> 'cupo_bytes')::bigint, 1073741824::bigint, 'B sigue con el cupo por defecto');

-- 9 MB de archivos del cliente: pasa el 80 % (aviso) pero no el 100 %.
select tests.como(tests.id('admin_a'), 'aal2');
select is((select (public.confirmar_archivo_cliente(tests.reserva('archivo_cliente', tests.id('empresa_a'), 'base.zip', 'application/zip', 9437184), null, tests.proy('Portal A'))) ? 'archivo_id'), true, 'A sube 9 MB (dentro del cupo)');
select is(public.espacio_de_empresa() ->> 'estado', 'aviso', 'al pasar el 80 % el estado es "aviso"');
select tests.admin();
select is((select count(*)::int from public.avisos_salientes where tipo = 'cupo_espacio_aviso' and empresa_id = tests.id('empresa_a')), 2, 'el 80 % avisa a los admin del cliente y al super admin');
select is((select count(*)::int from public.avisos_salientes where tipo = 'cupo_espacio_aviso' and destino = 'cliente_admin' and referencia_id = tests.id('empresa_a')), 1, 'la referencia es la empresa (solo ids)');
select is((select count(*)::int from public.avisos_salientes where tipo like 'cupo\_%' and datos ?| array['nombre', 'empresa_nombre']), 0, 'el aviso del cupo lleva cifras, no textos');
select is((select count(*)::int from public.avisos_salientes where tipo like 'cupo\_%' and empresa_id = tests.id('empresa_b')), 0, 'B no recibe avisos de A');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'otro.zip', 'application/zip', 2097152)$$, 'P0001', 'cupo_espacio_lleno', 'si el archivo pasa del cupo, la reserva se rechaza');
select lives_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'chico.png', 'image/png', 1000)$$, 'uno pequeno que cabe si pasa');

-- Con el espacio lleno (100 %): no se sube nada mas.
select tests.admin();
insert into public.archivos_cliente (empresa_id, nombre_original, mime_type, tamano_bytes, storage_path, subido_por, subido_por_nombre)
values (tests.id('empresa_a'), 'relleno.bin', 'application/zip', 5000000,
        tests.id('empresa_a')::text || '/archivos/' || gen_random_uuid() || '.zip', tests.id('admin_a'), 'Admin A');
select is((select count(*)::int from public.avisos_salientes where tipo = 'cupo_espacio_lleno' and empresa_id = tests.id('empresa_a')), 2, 'al llegar al 100 % se avisa (cliente y super admin)');
select tests.como(tests.id('admin_a'), 'aal2');
select is(public.espacio_de_empresa() ->> 'estado', 'lleno', 'el estado es "lleno"');
select throws_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'chico2.png', 'image/png', 1000)$$, 'P0001', 'cupo_espacio_lleno', 'lleno: ni un archivo pequeno');
select throws_ok($$select public.reservar_subida('documento', tests.id('empresa_a'), 'x.pdf', 'application/pdf', 1000)$$, '42501', null, 'el cliente nunca sube documentos (control)');
select is(private.cupo_permite_subida('archivos-empresa', tests.id('empresa_a')::text || '/archivos/x.png'), false, 'Storage: lleno, el navegador de A no puede subir directo');
select is(private.cupo_permite_subida('dinero', tests.id('empresa_a')::text || '/comprobantes/x.pdf'), false, 'Storage: tampoco a los comprobantes (el cupo cuenta todos los buckets)');
select is(private.cupo_permite_subida('archivos-empresa', 'ruta-sin-empresa/x.png'), true, 'una ruta sin empresa la deciden las demas reglas');
select tests.como(tests.id('admin_b'), 'aal2');
select is(private.cupo_permite_subida('archivos-empresa', tests.id('empresa_b')::text || '/archivos/x.png'), true, 'Storage: B no esta llena y sube');
select tests.como(tests.id('sa'), 'aal2');
select is(private.cupo_permite_subida('archivos-empresa', tests.id('empresa_a')::text || '/archivos/x.png'), true, 'Storage: Websourcing no se bloquea');
select public.fijar_cupo_espacio(tests.id('empresa_a'), 1073741824);
select tests.como(tests.id('admin_a'), 'aal2');
select is(public.espacio_de_empresa() ->> 'estado', 'ok', 'subir el cupo desbloquea');
select lives_ok($$select public.reservar_subida('archivo_cliente', tests.id('empresa_a'), 'chico3.png', 'image/png', 1000)$$, 'y se puede subir de nuevo');
select tests.como(tests.id('sa'), 'aal2');
select is((public.fijar_cupo_espacio(tests.id('empresa_a'), null) ->> 'cupo_bytes')::bigint, 1073741824::bigint, 'cupo null = vuelve al por defecto');

-- ---------- 2) Videos de tickets ----------
select tests.como(tests.id('equipo_a'));
select throws_ok(format($$select public.preparar_adjunto_ticket(%L, 'v.mp4', 'video/mp4', 20971521)$$, :'ta'), 'P0001', 'video_demasiado_grande', 'un video de mas de 20 MB se rechaza');
select lives_ok(format($$select public.preparar_adjunto_ticket(%L, 'v.mp4', 'video/mp4', 20971520)$$, :'ta'), 'un video de 20 MB justos entra');
select lives_ok(format($$select public.preparar_adjunto_ticket(%L, 'foto.png', 'image/png', 30000000)$$, :'ta'), 'una imagen grande sigue entrando (el limite de 20 MB es de videos)');
select tests.admin();
update public.configuracion set valor = '{"activo": true}' where clave = 'videos_a_archivo_externo';
select tests.como(tests.id('equipo_a'));
select throws_ok(format($$select public.preparar_adjunto_ticket(%L, 'v2.mp4', 'video/mp4', 1000)$$, :'ta'), 'P0001', 'video_a_archivo_externo', 'con el interruptor encendido Supabase ya no recibe videos');
select lives_ok(format($$select public.preparar_adjunto_ticket(%L, 'foto2.png', 'image/png', 1000)$$, :'ta'), 'las imagenes siguen en Supabase');
select tests.admin();
update public.configuracion set valor = '{"activo": false}' where clave = 'videos_a_archivo_externo';
select is((select valor ->> 'activo' from public.configuracion where clave = 'videos_a_archivo_externo'), 'false', 'el interruptor viene apagado');
select tests.como(tests.id('equipo_a'));
select lives_ok(format($$select public.agregar_enlace_video_ticket(%L, 'https://www.loom.com/share/abc123')$$, :'ta'), 'se agrega un enlace de video');
select throws_ok(format($$select public.agregar_enlace_video_ticket(%L, 'http://www.loom.com/share/abc123')$$, :'ta'), '22023', 'enlace_invalido', 'solo https');
select throws_ok(format($$select public.agregar_enlace_video_ticket(%L, 'javascript:alert(1)')$$, :'ta'), '22023', 'enlace_invalido', 'nada de javascript:');
select throws_ok(format($$select public.agregar_enlace_video_ticket(%L, 'https://a b.com/x')$$, :'ta'), '22023', 'enlace_invalido', 'sin espacios');
select throws_ok(format($$select public.agregar_enlace_video_ticket(%L, 'https://x.c')$$, :'ta'), '22023', 'enlace_invalido', 'demasiado corto para ser un video');
select throws_ok(format($$select public.agregar_enlace_video_ticket(%L, 'https://www.youtube.com/watch?v=1')$$, :'tb'), 'P0001', 'ticket_no_encontrado', 'no se agrega a un ticket de otra empresa');
select is((select count(*)::int from public.ticket_enlaces_video), 1, 'el equipo A ve su enlace');
select tests.como(tests.id('equipo_b'));
select is((select count(*)::int from public.ticket_enlaces_video), 0, 'otra empresa no ve los enlaces de A');
select throws_ok($$insert into public.ticket_enlaces_video (empresa_id, ticket_id, url) values (gen_random_uuid(), gen_random_uuid(), 'https://youtu.be/abcdef')$$, '42501', null, 'nadie escribe enlaces directo en la tabla');

-- ---------- 3) Archivados ----------
select tests.admin();
select is((select cerrado_en is null from public.proyectos where id = tests.proy('Portal A')), true, 'un proyecto activo no tiene fecha de cierre');
update public.proyectos set estado = 'terminado' where id = tests.proy('Portal A');
select is((select cerrado_en is not null from public.proyectos where id = tests.proy('Portal A')), true, 'al terminar se anota cuando se cerro');
update public.proyectos set estado = 'activo' where id = tests.proy('Portal A');
select is((select cerrado_en is null from public.proyectos where id = tests.proy('Portal A')), true, 'si se reabre, se borra la fecha de cierre');
update public.proyectos set estado = 'terminado' where id = tests.proy('Portal A');
set local role service_role;
select is((public.marcar_para_archivar(30) ->> 'marcados')::int, 0, 'cerrado hace menos de 30 dias: no se marca nada');
reset role;
update public.proyectos set cerrado_en = now() - interval '31 days' where id = tests.proy('Portal A');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.marcar_para_archivar(30)$$, '42501', null, 'el cliente no marca archivos');
select throws_ok($$select public.archivos_por_trasladar()$$, '42501', null, 'el cliente no usa las funciones del script de traslado');
select tests.admin();
set local role service_role;
select cmp_ok((public.marcar_para_archivar(30) ->> 'marcados')::int, '>=', 1, 'cerrado hace 31 dias: se marcan sus archivos');
select is((public.marcar_para_archivar(30) ->> 'marcados')::int, 0, 'marcar dos veces no duplica');
reset role;
select is((select count(*)::int from public.archivos_archivados where proyecto_id = tests.proy('Portal B') or empresa_id = tests.id('empresa_b')), 0, 'no se marca nada de otro proyecto ni de otra empresa');
select is((select count(*)::int from public.archivos_archivados where estado = 'marcado'), (select count(*)::int from public.archivos_archivados), 'todo queda "marcado": solo se anota, nada se mueve');
select tests.id('admin_a') as _x \gset
select id as arch from public.archivos_archivados where origen_tabla = 'archivos_cliente' and nombre_original = 'base.zip' \gset
select tamano_bytes as arch_bytes from public.archivos_archivados where id = :'arch' \gset
select is((select count(*)::int from public.archivos_archivados where proyecto_id = tests.proy('Portal A') and origen_tabla = 'archivos_cliente'), 1, 'el archivo de 9 MB esta marcado');
select tests.como(tests.id('admin_a'), 'aal2');
select is(((public.espacio_de_empresa() ->> 'usado_bytes')::bigint) >= :'arch_bytes'::bigint, true, 'mientras no se borra de Supabase, sigue contando');
select tests.admin();
select private.espacio_usado(tests.id('empresa_a')) as antes \gset
set local role service_role;
select is(jsonb_array_length(public.archivos_por_trasladar(50)) >= 1, true, 'el script ve los marcados');
select throws_ok(format($$select public.archivo_borrado_de_supabase(%L)$$, :'arch'), 'P0001', 'archivo_no_encontrado', 'no se borra de Supabase algo que aun no se traslado');
select lives_ok(format($$select public.archivo_trasladado(%L, 'archivo/emp/archivos-empresa/base.zip', %L)$$, :'arch', repeat('a', 64)), 'el script anota el traslado con su huella');
select is(jsonb_array_length(public.archivos_por_borrar(50)), 1, 'el trasladado verificado es candidato a borrar');
select lives_ok(format($$select public.archivo_borrado_de_supabase(%L)$$, :'arch'), 'el script anota que ya lo quito de Supabase');
reset role;
select tests.como(tests.id('admin_a'), 'aal2');
select is((public.espacio_de_empresa() ->> 'usado_bytes')::bigint, :'antes'::bigint - :'arch_bytes'::bigint, 'borrado de Supabase: deja de contar en el cupo (justo lo que pesaba)');
select is((select count(*)::int from public.archivos_archivados), (select count(*)::int from public.archivos_archivados where empresa_id = tests.id('empresa_a')), 'el cliente ve la lista de lo archivado (solo la suya)');
select tests.como(tests.id('admin_b'), 'aal2');
select is((select count(*)::int from public.archivos_archivados), 0, 'otra empresa no ve nada de lo archivado de A');
select throws_ok(format($$select public.pedir_recuperar_archivo(%L)$$, :'arch'), 'P0001', 'archivo_no_encontrado', 'otra empresa no pide recuperar archivos de A');
select tests.como(tests.id('admin_a'), 'aal2');
select is(public.pedir_recuperar_archivo(:'arch') ->> 'estado', 'recuperacion_pedida', 'el admin del cliente pide recuperar un archivo');
select throws_ok(format($$select public.pedir_recuperar_archivo(%L)$$, :'arch'), 'P0001', 'archivo_no_archivado', 'no se pide dos veces');
select throws_ok(format($$update public.archivos_archivados set estado = 'recuperado' where id = %L$$, :'arch'), '42501', null, 'nadie cambia el registro a mano desde la API');
select tests.admin();
set local role service_role;
select is((select a ->> 'accion' from jsonb_array_elements(public.archivos_por_trasladar(50)) a where a ->> 'id' = :'arch'), 'recuperar', 'el script ve el pedido de recuperacion');
select lives_ok(format($$select public.archivo_recuperado(%L)$$, :'arch'), 'el script anota la recuperacion');
reset role;
select is((select estado from public.archivos_archivados where id = :'arch'), 'recuperado', 'queda "recuperado" y vuelve a contar');
select throws_ok($$delete from public.archivos_archivados$$, '42501', null, 'el registro de archivados no se borra');

-- ---------- 4) Resumen del registro de actividad ----------
insert into public.registro_actividad (empresa_id, accion, entidad, creado_en) values
  (tests.id('empresa_a'), 'prueba_vieja', 'cosa', now() - interval '14 months'),
  (tests.id('empresa_a'), 'prueba_vieja', 'cosa', now() - interval '14 months'),
  (tests.id('empresa_a'), 'prueba_vieja', 'cosa', now() - interval '14 months'),
  (tests.id('empresa_a'), 'prueba_reciente', 'cosa', now() - interval '2 months');
select tests.como(tests.id('admin_a'), 'aal2');
select throws_ok($$select public.resumir_registro_actividad()$$, '42501', null, 'el cliente no resume el registro');
select tests.admin();
set local role service_role;
select is((public.resumir_registro_actividad(12) ->> 'resumenes_nuevos')::int, 1, 'se resume lo de mas de 12 meses (1 grupo)');
select is((public.resumir_registro_actividad(12) ->> 'resumenes_nuevos')::int, 0, 'correrlo otra vez no duplica');
reset role;
select is((select cantidad from public.registro_actividad_resumen where accion = 'prueba_vieja'), 3, 'el resumen cuenta 3');
select is((select count(*)::int from public.registro_actividad where accion = 'prueba_vieja'), 3, 'con "borrar_detalle" apagado (por defecto) el detalle se conserva');
select throws_ok($$delete from public.registro_actividad where accion = 'prueba_vieja'$$, '42501', null, 'el registro sigue siendo de solo agregar');
update public.configuracion set valor = '{"meses": 12, "borrar_detalle": true}' where clave = 'registro_resumen';
set local role service_role;
select is((public.resumir_registro_actividad(12) ->> 'detalle_borrado')::int, 3, 'encendido el borrado, se quita el detalle ya resumido');
reset role;
select is((select count(*)::int from public.registro_actividad where accion = 'prueba_vieja'), 0, 'el detalle viejo ya no esta');
select is((select count(*)::int from public.registro_actividad where accion = 'prueba_reciente'), 1, 'lo reciente no se toca');
select is((select cantidad from public.registro_actividad_resumen where accion = 'prueba_vieja'), 3, 'el resumen se conserva');
select throws_ok($$delete from public.registro_actividad where accion = 'prueba_reciente'$$, '42501', null, 'despues del resumen, borrar a mano sigue prohibido');
select throws_ok($$update public.registro_actividad_resumen set cantidad = 1$$, '42501', null, 'el resumen tampoco se edita');
select tests.como(tests.id('sa'), 'aal2');
select is((select count(*)::int from public.registro_actividad_resumen where accion = 'prueba_vieja'), 1, 'el super admin lee el resumen');
select tests.como(tests.id('admin_a'), 'aal2');
select is((select count(*)::int from public.registro_actividad_resumen), 0, 'el cliente no lo lee');

select * from finish();
rollback;
