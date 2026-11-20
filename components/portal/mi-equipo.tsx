'use client';
import * as React from 'react';
import { Ban, MailPlus, UserMinus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { PageHeader, Seccion } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio, SinPermiso } from '@/components/ds/states';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { bloquearMiembro, quitarMiembro, revocarInvitacion } from '@/lib/portal/acciones';
import { mensajeDeError } from '@/lib/portal/errores';
import { estaVencida, leerEquipo, nombreDe, useCargar, type FilaInvitacion, type FilaMiembro } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import { fecha } from '@/lib/utils';
import { Confirmar, InvitarDialog } from './invitar';
import { usePortal } from './contexto';

type Permiso = 'aprobar' | 'ver_dinero' | 'ver_todos_tickets' | 'subir_archivos';
const PERMISOS: { k: Permiso; titulo: string; texto: string }[] = [
  { k: 'aprobar', titulo: 'Aprobar sprints y diseños', texto: 'Puede decir "apruebo" o "pido cambios".' },
  { k: 'ver_dinero', titulo: 'Ver contrato, pagos y facturas', texto: 'Ve el módulo Dinero y los datos de facturación.' },
  { k: 'ver_todos_tickets', titulo: 'Ver todos los tickets de la empresa', texto: 'Si está apagado, solo ve los suyos.' },
  { k: 'subir_archivos', titulo: 'Subir archivos de la empresa', texto: 'Y comprobantes de pago, si además puede ver dinero.' },
];

/** Mi equipo (solo admin del cliente): invitar, permisos, bloquear y quitar. La base valida cada cambio. */
export function MiEquipoReal() {
  const ctx = usePortal();
  const { avisar } = useStore();
  const empresaId = ctx.empresa?.id ?? '';
  const esAdmin = ctx.rol === 'admin_cliente';
  const { estado, datos, recargar, setDatos } = useCargar(() => leerEquipo(empresaId), [empresaId]);
  const [invitar, setInvitar] = React.useState(false);
  const [aQuitar, setAQuitar] = React.useState<FilaMiembro | null>(null);
  const [aBloquear, setABloquear] = React.useState<FilaMiembro | null>(null);
  const [aCancelar, setACancelar] = React.useState<FilaInvitacion | null>(null);

  if (!esAdmin) return <><PageHeader titulo="Mi equipo" /><SinPermiso texto="Solo el administrador de la empresa puede invitar personas y decidir qué ve cada una." /></>;

  const cambiarPermiso = async (m: FilaMiembro, k: Permiso, v: boolean) => {
    const previo = datos;
    setDatos(datos && { ...datos, miembros: datos.miembros.map((x) => (x.id === m.id ? { ...x, [k]: v } : x)) });
    const { error } = await crearClienteNavegador().from('miembros').update({ [k]: v } as Partial<Record<Permiso, boolean>>).eq('id', m.id);
    if (error) { setDatos(previo); avisar(mensajeDeError(error)); return; }
    avisar(`${nombreDe(m)}: ${PERMISOS.find((p) => p.k === k)!.titulo.toLowerCase()} ${v ? 'activado' : 'desactivado'}.`);
  };
  const quitar = async () => {
    if (!aQuitar) return;
    const { error } = await quitarMiembro(crearClienteNavegador(), aQuitar.id);
    if (error) avisar(mensajeDeError(error));
    else avisar('Quitaste a esta persona. Pierde el acceso de inmediato; su historial se conserva.');
    setAQuitar(null); recargar(true);
  };
  const bloquear = async () => {
    if (!aBloquear) return;
    const nuevo = !aBloquear.bloqueado;
    const { error } = await bloquearMiembro(crearClienteNavegador(), aBloquear.id, nuevo);
    if (error) avisar(mensajeDeError(error));
    else avisar(nuevo ? 'Bloqueaste a esta persona. Pierde el acceso de inmediato.' : 'Desbloqueaste a esta persona.');
    setABloquear(null); recargar(true);
  };

  const cancelar = async () => {
    if (!aCancelar) return;
    const { error } = await revocarInvitacion(crearClienteNavegador(), aCancelar.id);
    if (error) avisar(mensajeDeError(error)); else avisar('Invitación cancelada. El enlace ya no sirve.');
    setACancelar(null); recargar(true);
  };

  const activos = datos?.miembros.filter((m) => !m.quitado_en) ?? [];
  const quitados = datos?.miembros.filter((m) => m.quitado_en) ?? [];
  const pendientes = datos?.invitaciones ?? [];
  return (
    <>
      <PageHeader titulo="Mi equipo" descripcion="Invita a tu gente y decide qué ve y qué puede hacer cada una. Como las llaves de un edificio: tú das copia de cada puerta."
        acciones={<Button onClick={() => setInvitar(true)}><MailPlus />Invitar a alguien</Button>} />
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => recargar()} />}
      {estado === 'ok' && (
        <>
          <Alert variant="info" className="mb-6" title="Los documentos se comparten uno por uno">Además de estos permisos, Websourcing decide qué documentos ve cada persona. Por defecto, el equipo ve los documentos "para todo el equipo".</Alert>
          {activos.length === 0 && <EstadoVacio titulo="Aún no hay nadie en tu equipo" texto="Invita a las personas de tu empresa que necesitan ver el proyecto." />}
          <ul className="space-y-4" aria-label="Personas del equipo">
            {activos.map((m) => {
              const esEquipo = m.rol === 'equipo';
              const bloqueado = m.bloqueado || m.perfiles?.bloqueado;
              return (
                <li key={m.id} data-testid="miembro">
                  <Card className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display font-semibold text-primary-text" aria-hidden>{nombreDe(m).slice(0, 1).toUpperCase()}</span>
                        <div className="min-w-0"><p className="truncate font-medium">{nombreDe(m)}</p><p className="truncate text-sm text-muted-foreground">{m.perfiles?.correo}</p></div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={esEquipo ? 'neutral' : 'primary'}>{esEquipo ? 'Equipo' : 'Administrador'}</Badge>
                        <Badge variant={bloqueado ? 'danger' : 'success'}>{bloqueado ? 'Bloqueado' : 'Activo'}</Badge>
                      </div>
                    </div>
                    {esEquipo ? (
                      <>
                        <div className="mt-4 grid gap-x-8 gap-y-3 border-t border-border pt-4 md:grid-cols-2">
                          {PERMISOS.map((p) => (
                            <div key={p.k} className="flex items-start justify-between gap-4">
                              <div><label htmlFor={`${m.id}-${p.k}`} className="text-sm font-medium">{p.titulo}</label><p className="text-xs text-muted-foreground">{p.texto}</p></div>
                              <Switch id={`${m.id}-${p.k}`} checked={m[p.k]} onCheckedChange={(v) => void cambiarPermiso(m, p.k, v)} />
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                          <Button size="sm" variant="outline" onClick={() => setABloquear(m)}><Ban />{m.bloqueado ? 'Desbloquear' : 'Bloquear'}</Button>
                          <Button size="sm" variant="destructive" onClick={() => setAQuitar(m)}><UserMinus />Quitar del equipo</Button>
                        </div>
                      </>
                    ) : <p className="mt-3 text-sm text-muted-foreground">Ve todo lo de la empresa. Solo Websourcing puede cambiar a un administrador.</p>}
                  </Card>
                </li>
              );
            })}
          </ul>

          {pendientes.length > 0 && (
            <Seccion titulo="Invitaciones pendientes" descripcion="Aún no han activado su cuenta." className="mt-8">
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {pendientes.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" data-testid="invitacion">
                    <span className="min-w-0 truncate font-medium">{i.correo}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">Vence el {fecha(i.vence_en)}<Badge variant={estaVencida(i) ? 'danger' : 'warning'}>{estaVencida(i) ? 'Vencida' : 'Pendiente'}</Badge><Button size="sm" variant="outline" onClick={() => setACancelar(i)}>Cancelar invitación</Button></span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
          {quitados.length > 0 && (
            <Seccion titulo="Personas que ya no están" descripcion="Se conserva su historial." className="mt-8">
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {quitados.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="min-w-0 truncate">{nombreDe(m)} <span className="text-muted-foreground">· {m.perfiles?.correo}</span></span>
                    <span className="text-muted-foreground">Salió el {fecha(m.quitado_en)}</span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
        </>
      )}

      <InvitarDialog abierto={invitar} onCerrar={() => setInvitar(false)} empresaId={empresaId} esSuper={false} onHecho={() => recargar(true)} />
      <Confirmar abierto={!!aCancelar} titulo="¿Cancelar esta invitación?" texto={`El enlace enviado a ${aCancelar?.correo ?? ''} dejará de funcionar. Puedes invitar de nuevo cuando quieras.`} boton="Sí, cancelar invitación" onConfirmar={cancelar} onCerrar={() => setACancelar(null)} />
      <Confirmar abierto={!!aQuitar} titulo="¿Quitar a esta persona?" texto={`${aQuitar ? nombreDe(aQuitar) : ''} pierde el acceso de inmediato. Su historial se conserva.`} boton="Sí, quitar" onConfirmar={quitar} onCerrar={() => setAQuitar(null)} />
      <Confirmar abierto={!!aBloquear} tono={aBloquear?.bloqueado ? 'default' : 'destructive'} titulo={aBloquear?.bloqueado ? '¿Desbloquear a esta persona?' : '¿Bloquear a esta persona?'} texto={aBloquear?.bloqueado ? 'Volverá a entrar con sus permisos de antes.' : `${aBloquear ? nombreDe(aBloquear) : ''} pierde el acceso de inmediato, pero sigue en tu equipo. Puedes desbloquearla cuando quieras.`} boton={aBloquear?.bloqueado ? 'Sí, desbloquear' : 'Sí, bloquear'} onConfirmar={bloquear} onCerrar={() => setABloquear(null)} />
    </>
  );
}
