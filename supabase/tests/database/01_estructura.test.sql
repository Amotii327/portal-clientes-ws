-- Estructura y cerraduras generales. Aqui esta la prueba que FALLA si alguna tabla del esquema
-- public queda sin RLS (arquitectura, seccion 4).
begin;
select plan(24);

-- 1. RLS activa en TODAS las tablas de public (tablas normales y particionadas).
select is_empty(
  $$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'RLS activa en todas las tablas del esquema public');

-- 2. Las 10 tablas del sprint 1 existen.
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'), 21, 'hay 21 tablas en public (sprints 1 y 2)');

-- 3. Toda tabla con RLS tiene politicas, salvo super_admins (cerrada a proposito).
select is_empty(
  $$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('super_admins', 'intentos_acceso')
       and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)$$,
  'toda tabla (salvo super_admins e intentos_acceso) tiene politicas');
select is((select count(*)::int from pg_policies where tablename in ('super_admins', 'intentos_acceso')), 0, 'super_admins e intentos_acceso no tienen politicas: invisibles desde la API');

-- 4. Politicas de escritura siempre con WITH CHECK.
select is_empty(
  $$select tablename || '.' || policyname from pg_policies
     where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'ALL') and with_check is null$$,
  'toda politica de INSERT/UPDATE/ALL tiene WITH CHECK');

-- 5. Ninguna politica abre a anon ni a public; ninguna permite DELETE.
select is_empty(
  $$select tablename || '.' || policyname from pg_policies
     where schemaname = 'public' and (roles && array['anon', 'public']::name[] or cmd in ('DELETE', 'ALL'))$$,
  'ninguna politica es para anon/public y ninguna permite DELETE');

-- 6. anon y service_role no tienen permisos sobre ninguna tabla/columna de public.
select is_empty(
  $$select table_name::text from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'service_role', 'PUBLIC')$$,
  'anon, service_role y PUBLIC sin permisos de tabla');
select is_empty(
  $$select table_name::text from information_schema.role_column_grants
     where table_schema = 'public' and grantee in ('anon', 'service_role', 'PUBLIC')$$,
  'anon, service_role y PUBLIC sin permisos de columna');

-- 7. authenticated: nunca DELETE/TRUNCATE; INSERT y UPDATE solo por columna, nunca de tabla completa.
select is_empty(
  $$select table_name::text || ':' || privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'authenticated'
       and privilege_type in ('DELETE', 'TRUNCATE', 'INSERT', 'UPDATE', 'REFERENCES', 'TRIGGER')$$,
  'authenticated sin DELETE/TRUNCATE ni INSERT/UPDATE de tabla completa');
select ok(not has_column_privilege('authenticated', 'public.invitaciones', 'token_hash', 'select'),
  'el hash del token no se puede leer desde la API');
select ok(not has_table_privilege('authenticated', 'public.super_admins', 'select'),
  'authenticated no lee super_admins');

-- 8. Ninguna columna sensible es actualizable por authenticated.
select is_empty(
  $$select table_name::text || '.' || column_name from information_schema.role_column_grants
     where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'
       and column_name in ('empresa_id', 'user_id', 'rol', 'bloqueado', 'bloqueado_en', 'quitado_en', 'estado', 'token_hash', 'id')$$,
  'nadie puede actualizar empresa_id, rol, bloqueado, estado, etc. directamente');

-- 9. Funciones: SECURITY DEFINER siempre con search_path fijo.
select is_empty(
  $$select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not coalesce(p.proconfig::text ilike '%search_path=%', false)$$,
  'toda funcion SECURITY DEFINER tiene search_path fijo');
select is_empty(
  $$select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[])))$$,
  'el search_path fijo de las funciones SECURITY DEFINER esta vacio (todo calificado)');

-- 10. Funciones ejecutables por anon: solo politica_vigente().
select is_empty(
  $$select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
       and p.proname not in ('politica_vigente', 'mi_contexto')$$,
  'anon solo puede ejecutar politica_vigente() y mi_contexto()');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon no entra al esquema private');
select ok(not has_function_privilege('authenticated', 'private.registrar(uuid,text,text,text,jsonb)', 'execute'),
  'authenticated no puede escribir en el registro por su cuenta');
select ok(not has_function_privilege('authenticated', 'private.crear_invitacion(uuid,text,text,boolean,boolean,boolean,boolean)', 'execute'),
  'authenticated no llama la funcion interna de invitaciones');

-- 11. Las funciones auxiliares estan fuera del esquema expuesto.
select is_empty(
  $$select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like any (array['es\_%', 'tiene\_%', 'mi\_empresa%', 'miembro\_activo%', 'registrar%'])$$,
  'ninguna funcion auxiliar de reglas vive en public');

-- 12. empresa_id inmutable: toda tabla con columna empresa_id tiene el trigger.
select is_empty(
  $$select c.table_name::text from information_schema.columns c
     where c.table_schema = 'public' and c.column_name = 'empresa_id'
       and ('public.' || c.table_name)::regclass in (select oid from pg_class where relkind = 'r')
       and not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                        where t.tgrelid = ('public.' || c.table_name)::regclass and p.proname = 'empresa_id_inmutable')$$,
  'toda tabla con empresa_id tiene el trigger que la hace inmutable');

-- 13. Tablas solo-agregar.
select is_empty(
  $$select x.t from (values ('registro_actividad'), ('aceptaciones_politica')) x(t)
     where (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
             where t.tgrelid = ('public.' || x.t)::regclass and p.proname = 'solo_agregar') < 2$$,
  'registro_actividad y aceptaciones_politica bloquean UPDATE, DELETE y TRUNCATE');

-- 14. Vistas (hoy ninguna): si aparecen, deben ser security_invoker.
select is_empty(
  $$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
       and not coalesce(c.reloptions::text like '%security_invoker=true%', false)$$,
  'toda vista de public es security_invoker');

-- 15. Sprint 2: toda tabla de public (salvo 3 excepciones) lleva la cerradura de solo lectura del modo "ver como".
select is_empty(
  $$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and c.relname not in ('sesiones_ver_como', 'registro_actividad', 'intentos_acceso')
       and not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                        where t.tgrelid = c.oid and p.proname = 'bloquear_escritura_ver_como')$$,
  'toda tabla tiene la cerradura de solo lectura del modo "ver como"');

-- 16. proyectos: llaves compuestas en ambos ordenes para que otros modulos se enlacen con ella.
select is((select count(*)::int from pg_constraint where conrelid = 'public.proyectos'::regclass and contype = 'u'
            and conkey in (array[(select attnum from pg_attribute where attrelid = 'public.proyectos'::regclass and attname = 'empresa_id'),
                                 (select attnum from pg_attribute where attrelid = 'public.proyectos'::regclass and attname = 'id')],
                           array[(select attnum from pg_attribute where attrelid = 'public.proyectos'::regclass and attname = 'id'),
                                 (select attnum from pg_attribute where attrelid = 'public.proyectos'::regclass and attname = 'empresa_id')])),
  2, 'proyectos tiene unique (empresa_id, id) y unique (id, empresa_id)');

select * from finish();
rollback;
