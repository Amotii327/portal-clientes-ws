-- Sprint 5 y 6 · Estructura: RLS activa, sin acceso anonimo ni service_role, funciones seguras, vistas invoker, sin precios en presets.
begin;
select plan(12);
\ir ../local/fixtures.sql

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
              and c.relname in ('tickets','ticket_mensajes','ticket_adjuntos','garantias','planes_base_mantenimiento','planes_mantenimiento',
                                'planes_mantenimiento_historial','bolsa_mensual','bolsa_avisos','horas_registradas','horas_notas_internas','outbox_correos')),
          0, 'las 12 tablas nuevas tienen RLS activa');
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'public' and grantee in ('anon', 'service_role')
              and table_name in ('tickets','ticket_mensajes','ticket_adjuntos','garantias','planes_base_mantenimiento','planes_mantenimiento',
                                 'planes_mantenimiento_historial','bolsa_mensual','bolsa_avisos','horas_registradas','horas_notas_internas','outbox_correos')),
          0, 'anon y service_role no tienen permisos sobre las tablas nuevas');
select is((select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
            where t.tgname = 'ver_como_solo_lectura' and c.relname in ('tickets','ticket_mensajes','ticket_adjuntos','garantias','planes_base_mantenimiento',
              'planes_mantenimiento','planes_mantenimiento_historial','bolsa_mensual','bolsa_avisos','horas_registradas','horas_notas_internas','outbox_correos')),
          12, 'las 12 tablas tienen la cerradura de "ver como"');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and p.proname in ('crear_ticket','responder_ticket','clasificar_ticket','cambiar_estado_ticket','decidir_ticket',
              'activar_mantenimiento','configurar_mantenimiento','anotar_horas_ticket','revisar_horas','decidir_horas_extra','preparar_adjunto_ticket')
              and not (coalesce(p.proconfig, '{}') @> array['search_path=""'])),
          0, 'las funciones publicas SECURITY DEFINER tienen search_path vacio');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.prosecdef and not (coalesce(p.proconfig, '{}') @> array['search_path=""'])
              and p.proname in ('cerrar_mes_bolsas','cerrar_tickets_vencidos','encolar_correo','asegurar_bolsa','aplicar_parametros','ticket_visible')),
          0, 'las funciones privadas SECURITY DEFINER tienen search_path vacio');
select is((select count(*)::int from information_schema.routine_privileges
            where routine_schema = 'public' and grantee in ('anon', 'public', 'PUBLIC')
              and routine_name in ('crear_ticket','responder_ticket','activar_mantenimiento','anotar_horas_ticket','revisar_horas','preparar_adjunto_ticket')),
          0, 'ninguna RPC esta abierta a anonimos');
select is((select count(*)::int from information_schema.routine_privileges
            where routine_schema = 'private' and grantee = 'authenticated' and routine_name in ('cerrar_mes_bolsas', 'cerrar_tickets_vencidos', 'encolar_correo')),
          0, 'los cierres automaticos y la cola no se llaman desde la API');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'v' and c.relname in ('tickets_semaforo', 'bolsa_mensual_resumen')
              and not (coalesce(c.reloptions, '{}') @> array['security_invoker=true'])),
          0, 'las vistas nuevas son security_invoker');
select is((select count(*)::int from pg_constraint where conname in ('tickets_proyecto_misma_empresa', 'garantias_proyecto_misma_empresa') and contype = 'f'),
          2, 'los vinculos a proyectos son compuestos (misma empresa)');
select is((select count(*)::int from public.planes_base_mantenimiento), 3, 'hay tres planes base de partida');
select is((select count(*)::int from public.planes_base_mantenimiento where parametros::text ~* 'precio|cuota|valor'), 0, 'los planes base no traen precios inventados');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'tickets' and column_name = 'empresa_id' and is_nullable = 'YES'), 0, 'empresa_id de tickets es obligatoria');

select * from finish();
rollback;
