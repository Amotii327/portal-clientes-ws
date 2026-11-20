do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists portal_tickets_leer on storage.objects;
    drop policy if exists portal_tickets_subir on storage.objects;
    -- El bucket solo se quita si esta vacio (no se borran archivos de nadie).
    delete from storage.buckets b where b.id = 'portal-tickets'
      and not exists (select 1 from storage.objects o where o.bucket_id = 'portal-tickets');
  end if;
end $$;
drop view if exists public.bolsa_mensual_resumen;
drop view if exists public.tickets_semaforo;
drop policy if exists outbox_leer on public.outbox_correos;
drop policy if exists horas_notas_leer on public.horas_notas_internas;
drop policy if exists horas_leer on public.horas_registradas;
drop policy if exists bolsa_avisos_leer on public.bolsa_avisos;
drop policy if exists bolsa_leer on public.bolsa_mensual;
drop policy if exists planes_historial_leer on public.planes_mantenimiento_historial;
drop policy if exists planes_leer on public.planes_mantenimiento;
drop policy if exists planes_base_editar on public.planes_base_mantenimiento;
drop policy if exists planes_base_leer on public.planes_base_mantenimiento;
drop policy if exists garantias_editar on public.garantias;
drop policy if exists garantias_crear on public.garantias;
drop policy if exists garantias_leer on public.garantias;
drop policy if exists ticket_adjuntos_leer on public.ticket_adjuntos;
drop policy if exists ticket_mensajes_leer on public.ticket_mensajes;
drop policy if exists tickets_leer on public.tickets;
drop function if exists private.mantenimiento_encendido(uuid);
