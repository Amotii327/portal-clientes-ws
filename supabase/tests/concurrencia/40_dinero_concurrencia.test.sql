-- Concurrencia REAL con dos sesiones (dblink). Corre en una base desechable (la crea scripts/test-db.sh como copia de "prueba"),
-- SIN transaccion envolvente, porque la otra sesion solo ve lo que ya se confirmo (commit).
-- Prueba: (1) contrato_para_cambio toma de verdad el candado de la fila del contrato (si alguien le quita el
-- "for update", esta prueba falla); (2) dos abonos que juntos pasan el saldo: solo uno gana; (3) el mismo comprobante
-- confirmado desde dos sesiones: solo una crea el abono.
select plan(12);
create extension if not exists dblink with schema extensions;
\ir ../local/fixtures.sql
\ir ../local/ayudas_proyectos.sql
\ir ../local/ayudas_dinero.sql
select tests.preparar_dinero();

create function tests.conectar(p_nombre text) returns void language plpgsql as $$
begin
  perform dblink_connect(p_nombre, format('host=%s port=%s dbname=%s user=postgres',
    split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), current_database()));
end $$;
-- La sesion remota entra como el super admin con 2FA (mismo JWT que usa la API).
create function tests.sesion_super_admin(p_nombre text) returns void language plpgsql as $$
begin
  perform dblink_exec(p_nombre, 'begin');
  perform dblink_exec(p_nombre, 'set role authenticated');
  perform * from dblink(p_nombre, format('select set_config(''request.jwt.claims'', %L, true)',
    jsonb_build_object('sub', tests.id('sa'), 'role', 'authenticated', 'aal', 'aal2')::text)) as t(x text);
end $$;
-- Espera (hasta 10 s) a que la sesion remota este bloqueada esperando un candado.
create function tests.espera_bloqueada(p_pid int) returns boolean language plpgsql as $$
begin
  for i in 1..100 loop
    if exists (select 1 from pg_stat_activity where pid = p_pid and wait_event_type = 'Lock') then return true; end if;
    perform pg_sleep(0.1);
  end loop;
  return false;
end $$;
-- Recoge el resultado de una consulta enviada sin esperar: devuelve 'ok' o el mensaje de error.
create function tests.resultado(p_nombre text) returns text language plpgsql as $$
declare v text := 'ok';
begin
  begin
    perform * from dblink_get_result(p_nombre) as t(x text);
  exception when others then
    v := sqlerrm;
  end;
  -- Hay que vaciar la conexion (el ultimo resultado vacio) para poder seguir usandola.
  begin
    perform * from dblink_get_result(p_nombre) as t(x text);
  exception when others then
    null;
  end;
  return v;
end $$;

-- ---------- 0) El candado esta en el codigo ----------
select ok(pg_get_functiondef('private.contrato_para_cambio(uuid)'::regprocedure) like '%for update%', 'contrato_para_cambio bloquea la fila del contrato (for update)');

select tests.conectar('a');
select tests.conectar('b');
select tests.conectar('c');   -- c: observador, superusuario
select ok(true, 'tres sesiones abiertas');
create temp table pids as select (select x from dblink('b', 'select pg_backend_pid()') as t(x int)) as b;

-- ---------- 1) La funcion toma el candado de verdad ----------
select dblink_exec('a', 'begin');
select * from dblink('a', format('select private.contrato_para_cambio(%L)::text', tests.contrato('Portal A'))) as t(x text);
select throws_ok(format($$select * from dblink('c', 'select 1 from public.contratos where id = ''%s'' for update nowait') as t(x int)$$, tests.contrato('Portal A')),
  '55P03', null, 'mientras otra sesion esta dentro de contrato_para_cambio, la fila del contrato esta bloqueada (nowait falla)');
select dblink_exec('a', 'rollback');
select lives_ok(format($$select * from dblink('c', 'select 1 from public.contratos where id = ''%s'' for update nowait') as t(x int)$$, tests.contrato('Portal A')),
  'al soltar la sesion, el candado se libera');

-- ---------- 2) Dos abonos que juntos pasan el saldo (6M + 6M > 10M): solo uno gana ----------
select tests.sesion_super_admin('a');
select tests.sesion_super_admin('b');
select * from dblink('a', format('select public.crear_abono(%L, 6000000, private.hoy(), ''otro'')::text', tests.contrato('Portal A'))) as t(x text);
select dblink_send_query('b', format('select public.crear_abono(%L, 6000000, private.hoy(), ''otro'')::text', tests.contrato('Portal A')));
select ok(tests.espera_bloqueada((select b from pids)), 'la segunda sesion queda ESPERANDO el candado del contrato');
select dblink_exec('a', 'commit');
select ok(tests.resultado('b') like '%abono_excede_saldo%', 'al soltarse el candado, la segunda ve el abono de la primera y se rechaza (abono_excede_saldo)');
select dblink_exec('b', 'rollback');
select is(tests.abonos_de('Portal A'), 1::bigint, 'queda un solo abono');
select is(tests.saldo('Portal A'), 4000000.00, 'saldo 4.000.000: nadie se paso del contrato');

-- ---------- 3) El mismo comprobante confirmado desde dos sesiones: un solo abono ----------
insert into public.comprobantes_pago (empresa_id, contrato_id, pago_programado_id, valor_declarado, fecha_pago_declarada,
                                      archivo_path, archivo_nombre, archivo_tipo, tamano_bytes, subido_por)
values (tests.id('empresa_a'), tests.contrato('Portal A'), tests.pago('Segundo pago'), 4000000, private.hoy(),
        tests.ruta('empresa_a', 'comprobantes'), 'c.pdf', 'application/pdf', 1000, tests.id('admin_a'));
select tests.sesion_super_admin('a');
select tests.sesion_super_admin('b');
select * from dblink('a', format('select public.confirmar_comprobante(%L)::text', tests.comprobante_de('Segundo pago'))) as t(x text);
select dblink_send_query('b', format('select public.confirmar_comprobante(%L)::text', tests.comprobante_de('Segundo pago')));
select ok(tests.espera_bloqueada((select b from pids)), 'la segunda confirmacion queda esperando');
select dblink_exec('a', 'commit');
select ok(tests.resultado('b') like '%comprobante_ya_revisado%', 'la segunda confirmacion responde comprobante_ya_revisado');
select dblink_exec('b', 'rollback');
select is(tests.abonos_de('Portal A'), 2::bigint, 'dos abonos en total: el comprobante creo uno solo');
select is(tests.saldo('Portal A'), 0.00, 'saldo 0');

select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('c');
select * from finish();
