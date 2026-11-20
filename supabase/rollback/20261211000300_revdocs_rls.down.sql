-- Rollback del sprint 3 · RLS de revisiones y documentos.
drop trigger if exists ver_como_solo_lectura on public.revisiones;
drop trigger if exists ver_como_solo_lectura on public.revision_versiones;
drop trigger if exists ver_como_solo_lectura on public.aprobaciones;
drop trigger if exists ver_como_solo_lectura on public.documentos;
drop trigger if exists ver_como_solo_lectura on public.documento_versiones;
drop trigger if exists ver_como_solo_lectura on public.documento_permisos;
drop trigger if exists ver_como_solo_lectura on public.archivos_cliente;
drop trigger if exists ver_como_solo_lectura on public.subidas_reservadas;
drop policy if exists revisiones_leer on public.revisiones;
drop policy if exists revision_versiones_leer on public.revision_versiones;
drop policy if exists aprobaciones_leer on public.aprobaciones;
drop policy if exists documentos_leer on public.documentos;
drop policy if exists documento_versiones_leer on public.documento_versiones;
drop policy if exists documento_permisos_leer on public.documento_permisos;
drop policy if exists archivos_cliente_leer on public.archivos_cliente;
drop policy if exists subidas_reservadas_leer on public.subidas_reservadas;
revoke all on public.revisiones, public.revision_versiones, public.aprobaciones, public.documentos,
  public.documento_versiones, public.documento_permisos, public.archivos_cliente, public.subidas_reservadas
  from authenticated;
alter table public.revisiones disable row level security;
alter table public.revision_versiones disable row level security;
alter table public.aprobaciones disable row level security;
alter table public.documentos disable row level security;
alter table public.documento_versiones disable row level security;
alter table public.documento_permisos disable row level security;
alter table public.archivos_cliente disable row level security;
alter table public.subidas_reservadas disable row level security;
