-- Sprint 5 y 6 · RLS en TODAS las tablas nuevas, permisos minimos por columna, vistas y Storage.
-- La fuente de verdad es docs/matriz-permisos-tickets-mant.md. Equipo Websourcing · Desarrollo.
--
-- Casi todas las escrituras pasan por funciones RPC (000600 y 000700), que validan quien llama y dejan
-- el rastro. Directo por la API solo se escribe: garantias y planes_base_mantenimiento (super admin,
-- con WITH CHECK). Nadie borra filas desde la API.

alter table public.tickets                         enable row level security;
alter table public.ticket_mensajes                 enable row level security;
alter table public.ticket_adjuntos                 enable row level security;
alter table public.garantias                       enable row level security;
alter table public.planes_base_mantenimiento       enable row level security;
alter table public.planes_mantenimiento            enable row level security;
alter table public.planes_mantenimiento_historial  enable row level security;
alter table public.bolsa_mensual                   enable row level security;
alter table public.bolsa_avisos                    enable row level security;
alter table public.horas_registradas               enable row level security;
alter table public.horas_notas_internas            enable row level security;
alter table public.outbox_correos                  enable row level security;

revoke all on public.tickets, public.ticket_mensajes, public.ticket_adjuntos, public.garantias,
  public.planes_base_mantenimiento, public.planes_mantenimiento, public.planes_mantenimiento_historial,
  public.bolsa_mensual, public.bolsa_avisos, public.horas_registradas, public.horas_notas_internas,
  public.outbox_correos from anon, authenticated, service_role;

grant select on public.tickets, public.ticket_mensajes, public.ticket_adjuntos, public.garantias,
  public.planes_base_mantenimiento, public.planes_mantenimiento, public.planes_mantenimiento_historial,
  public.bolsa_mensual, public.bolsa_avisos, public.horas_registradas, public.horas_notas_internas,
  public.outbox_correos to authenticated;
grant insert (empresa_id, proyecto_id, inicia_en, vence_en, nota), update (proyecto_id, inicia_en, vence_en, nota)
  on public.garantias to authenticated;
grant update (parametros, nota) on public.planes_base_mantenimiento to authenticated;

-- Helper: es admin del cliente de esa empresa o tiene el permiso (reusa las funciones del sprint 1).
-- Mantenimiento encendido para la empresa (para que el cliente vea el modulo).
create function private.mantenimiento_encendido(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.planes_mantenimiento p where p.empresa_id = p_empresa and p.activo)
$$;
revoke all on function private.mantenimiento_encendido(uuid) from public, anon, authenticated, service_role;
grant execute on function private.mantenimiento_encendido(uuid) to authenticated;

-- ---- tickets: super admin todos; el equipo solo los suyos salvo permiso ver_todos_tickets (el admin lo tiene) ----
create policy tickets_leer on public.tickets for select to authenticated
  using ((select private.es_super_admin())
         or (empresa_id = (select private.mi_empresa_id())
             and (creado_por = (select auth.uid()) or private.tiene_permiso(empresa_id, 'ver_todos_tickets'))));

-- ---- mensajes: los del ticket que se ve; las notas internas solo el super admin ----
create policy ticket_mensajes_leer on public.ticket_mensajes for select to authenticated
  using ((select private.es_super_admin())
         or (not interno and exists (select 1 from public.tickets t where t.id = ticket_id and t.empresa_id = ticket_mensajes.empresa_id)));

-- ---- adjuntos: los del ticket visible; si cuelgan de una nota interna, solo el super admin ----
create policy ticket_adjuntos_leer on public.ticket_adjuntos for select to authenticated
  using ((select private.es_super_admin())
         or (exists (select 1 from public.tickets t where t.id = ticket_id and t.empresa_id = ticket_adjuntos.empresa_id)
             and (mensaje_id is null or exists (select 1 from public.ticket_mensajes m where m.id = mensaje_id and m.empresa_id = ticket_adjuntos.empresa_id))));

-- ---- garantias: la empresa la ve; solo el super admin la escribe ----
create policy garantias_leer on public.garantias for select to authenticated
  using ((select private.es_super_admin()) or empresa_id = (select private.mi_empresa_id()));
create policy garantias_crear on public.garantias for insert to authenticated
  with check ((select private.es_super_admin()));
create policy garantias_editar on public.garantias for update to authenticated
  using ((select private.es_super_admin()))
  with check ((select private.es_super_admin()));

-- ---- planes base: solo el super admin ----
create policy planes_base_leer on public.planes_base_mantenimiento for select to authenticated
  using ((select private.es_super_admin()));
create policy planes_base_editar on public.planes_base_mantenimiento for update to authenticated
  using ((select private.es_super_admin()))
  with check ((select private.es_super_admin()));

-- ---- plan de la empresa: super admin; el admin del cliente solo si esta ACTIVO (apagado = invisible) ----
create policy planes_leer on public.planes_mantenimiento for select to authenticated
  using ((select private.es_super_admin()) or (activo and private.es_admin_cliente(empresa_id)));

-- ---- historial de cambios del plan: solo super admin ----
create policy planes_historial_leer on public.planes_mantenimiento_historial for select to authenticated
  using ((select private.es_super_admin()));

-- ---- bolsa y avisos: super admin; admin del cliente si el mantenimiento esta encendido ----
create policy bolsa_leer on public.bolsa_mensual for select to authenticated
  using ((select private.es_super_admin())
         or (private.es_admin_cliente(empresa_id) and private.mantenimiento_encendido(empresa_id)));
create policy bolsa_avisos_leer on public.bolsa_avisos for select to authenticated
  using ((select private.es_super_admin())
         or (private.es_admin_cliente(empresa_id) and private.mantenimiento_encendido(empresa_id)));

-- ---- horas: super admin todas; admin del cliente solo las ya revisadas por el dueno (no las pendientes ni rechazadas) ----
create policy horas_leer on public.horas_registradas for select to authenticated
  using ((select private.es_super_admin())
         or (estado in ('aprobada', 'extra_pendiente_cliente', 'extra_aprobada', 'extra_rechazada')
             and private.es_admin_cliente(empresa_id) and private.mantenimiento_encendido(empresa_id)));
create policy horas_notas_leer on public.horas_notas_internas for select to authenticated
  using ((select private.es_super_admin()));

-- ---- cola de correos: solo el super admin la ve ----
create policy outbox_leer on public.outbox_correos for select to authenticated
  using ((select private.es_super_admin()));

-- ---------------------------------------------------------------------------------------------
-- Vistas (security_invoker: respetan las mismas cerraduras que las tablas)
-- ---------------------------------------------------------------------------------------------
create view public.tickets_semaforo with (security_invoker = true) as
select t.id as ticket_id, t.empresa_id, t.numero, t.estado, t.prioridad, t.prioridad_propuesta,
       t.vence_primera_respuesta, t.primera_respuesta_en, t.sla_origen,
       private.semaforo_en(t.empresa_id, t.estado, t.creado_en, t.vence_primera_respuesta,
                           t.plazo_habil_minutos, t.primera_respuesta_en, now()) as semaforo,
       private.minutos_restantes_en(t.empresa_id, t.estado, t.creado_en, t.vence_primera_respuesta,
                                    t.primera_respuesta_en, now()) as minutos_habiles_restantes
  from public.tickets t;

create view public.bolsa_mensual_resumen with (security_invoker = true) as
select b.id as bolsa_id, b.empresa_id, b.plan_id, b.mes, b.horas_incluidas, b.horas_arrastradas,
       b.horas_usadas, b.horas_extra,
       greatest(0, b.horas_incluidas + b.horas_arrastradas - b.horas_usadas) as horas_disponibles,
       case when b.horas_incluidas + b.horas_arrastradas > 0
            then round(b.horas_usadas * 100 / (b.horas_incluidas + b.horas_arrastradas), 2) else 100 end as porcentaje_usado,
       b.extra_autorizado, b.aviso_80_en, b.aviso_100_en, b.cerrada_en, b.horas_perdidas, b.horas_acumuladas
  from public.bolsa_mensual b;

grant select on public.tickets_semaforo, public.bolsa_mensual_resumen to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: bucket privado portal-tickets. La regla mira la TABLA dueña del archivo (ticket_adjuntos),
-- no solo la carpeta. Solo se crea si el esquema storage existe (Supabase).
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects no existe: se omiten las reglas de Storage de tickets';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('portal-tickets', 'portal-tickets', false, 52428800,
          array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime',
                'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg', 'audio/webm'])
  on conflict (id) do nothing;

  -- Leer: solo si el adjunto es visible para quien pregunta (hereda las reglas de ticket y de nota interna).
  execute $p$
    create policy portal_tickets_leer on storage.objects for select to authenticated
    using (bucket_id = 'portal-tickets'
           and exists (select 1 from public.ticket_adjuntos a where a.storage_path = storage.objects.name))
  $p$;
  -- Subir: solo a la ruta que la base generó para quien subió, y mientras el ticket siga abierto.
  execute $p$
    create policy portal_tickets_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'portal-tickets'
                and exists (select 1 from public.ticket_adjuntos a
                              join public.tickets t on t.id = a.ticket_id and t.empresa_id = a.empresa_id
                             where a.storage_path = storage.objects.name
                               and a.subido_por = (select auth.uid())
                               and t.estado <> 'cerrado'))
  $p$;
  -- Sin politicas de UPDATE ni DELETE: nadie cambia ni borra archivos desde la API.
end $$;
