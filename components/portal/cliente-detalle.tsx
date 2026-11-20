'use client';
import * as React from 'react';
import { ArrowLeft, Ban, MailPlus, PauseCircle, PlayCircle, ShieldOff, UserMinus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader, Seccion } from '@/components/ds/page';
import { EstadoCargando, EstadoError, SinPermiso } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { bloquearMiembro, bloquearUsuario, quitarMiembro, revocarInvitacion } from '@/lib/portal/acciones';
import { mensajeDeError } from '@/lib/portal/errores';
import { esUuid, estaVencida, leerEquipo, nombreDe, useCargar, type FilaInvitacion, type FilaMiembro } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import { fecha } from '@/lib/utils';
import { EstadoEmpresaBadge, useCambioDeEstado } from './clientes';
import { Confirmar, InvitarDialog } from './invitar';

async function leerDetalle(id: string) {
  const c = crearClienteNavegador();
  const [e, f, eq] = await Promise.all([
    c.from('empresas').select('*').eq('id', id).maybeSingle(),
    c.from('datos_facturacion').select('razon_social, nit, correo_facturas').eq('empresa_id', id).maybeSingle(),
    leerEquipo(id),
  ]);
  if (e.error || f.error) throw new Error('lectura_fallida');
  return { empresa: e.data, facturacion: f.data, ...eq };
}

type Accion = { tipo: 'quitar' | 'bloquear' | 'bloqueo_global'; m: FilaMiembro };

/** Detalle de una empresa para el super admin: personas, invitaciones, pausa. */
export function ClienteDetalleReal({ id }: { id: string }) {
  const { avisar } = useStore();
  const { estado, datos, recargar } = useCargar(() => (esUuid(id) ? leerDetalle(id) : Promise.resolve(null)), [id]);
  const [invitar, setInvitar] = React.useState(false);
  const [accion, setAccion] = React.useState<Accion | null>(null);
  const [aCancelar, setACancelar] = React.useState<FilaInvitacion | null>(null);
  const cambio = useCambioDeEstado(() => recargar(true));

  const volver = <Button variant="ghost" asChild><Enlace to="/admin/clientes"><ArrowLeft />Clientes</Enlace></Button>;
  if (estado === 'cargando') return <><PageHeader titulo="Cliente" acciones={volver} /><EstadoCargando /></>;
  if (estado === 'error') return <><PageHeader titulo="Cliente" acciones={volver} /><EstadoError onReintentar={() => recargar()} /></>;
  if (!datos || !datos.empresa) return <><PageHeader titulo="Cliente" acciones={volver} /><SinPermiso texto="No encontramos esa empresa." inicio="/admin/clientes" /></>;
  const { empresa, facturacion, miembros, invitaciones } = datos;

  const ejecutar = async () => {
    if (!accion) return;
    const c = crearClienteNavegador();
    const { m, tipo } = accion;
    let r;
    if (tipo === 'quitar') r = await quitarMiembro(c, m.id);
    else if (tipo === 'bloquear') r = await bloquearMiembro(c, m.id, !m.bloqueado);
    else r = await bloquearUsuario(c, m.user_id, !m.perfiles?.bloqueado);
    if (r.error) avisar(mensajeDeError(r.error));
    else avisar(tipo === 'quitar' ? 'Persona quitada. Pierde el acceso de inmediato; su historial se conserva.' : 'Listo. El cambio ya está aplicado.');
    setAccion(null); recargar(true);
  };
  const textos: Record<Accion['tipo'], (m: FilaMiembro) => { titulo: string; texto: string; boton: string }> = {
    quitar: (m) => ({ titulo: '¿Quitar a esta persona?', texto: `${nombreDe(m)} pierde el acceso de inmediato. Su historial se conserva.`, boton: 'Sí, quitar' }),
    bloquear: (m) => (m.bloqueado
      ? { titulo: '¿Desbloquear a esta persona en la empresa?', texto: 'Volverá a entrar con sus permisos de antes.', boton: 'Sí, desbloquear' }
      : { titulo: '¿Bloquear a esta persona en la empresa?', texto: `${nombreDe(m)} pierde el acceso a esta empresa de inmediato; sigue en la lista.`, boton: 'Sí, bloquear' }),
    bloqueo_global: (m) => (m.perfiles?.bloqueado
      ? { titulo: '¿Quitar el bloqueo global?', texto: `${nombreDe(m)} podrá volver a entrar al portal.`, boton: 'Sí, quitar el bloqueo' }
      : { titulo: '¿Bloquear en todo el portal?', texto: `${nombreDe(m)} no podrá entrar a ninguna empresa y sus sesiones se cierran.`, boton: 'Sí, bloquear en todo el portal' }),
  };
  const cancelar = async () => {
    if (!aCancelar) return;
    const { error } = await revocarInvitacion(crearClienteNavegador(), aCancelar.id);
    if (error) avisar(mensajeDeError(error)); else avisar('Invitación cancelada. El enlace ya no sirve.');
    setACancelar(null); recargar(true);
  };
  const t = accion ? textos[accion.tipo](accion.m) : null;

  return (
    <>
      <PageHeader eyebrow="Cliente" titulo={empresa.nombre} descripcion={`NIT ${empresa.nit_registro} · creada el ${fecha(empresa.creada_en)}`}
        acciones={<>
          {volver}
          <Button variant="secondary" onClick={() => setInvitar(true)}><MailPlus />Invitar</Button>
          {empresa.estado === 'activa'
            ? <Button variant="destructive" onClick={() => cambio.pedirPausa(empresa)}><PauseCircle />Pausar empresa</Button>
            : <Button onClick={() => void cambio.reactivar(empresa)}><PlayCircle />Reactivar</Button>}
        </>} />
      {empresa.estado === 'pausada' && <Alert variant="warning" className="mb-6" title="Empresa pausada">Sus usuarios no pueden entrar y ven un mensaje amable.{empresa.motivo_pausa ? ` Motivo: ${empresa.motivo_pausa}` : ''}</Alert>}

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card className="p-5"><p className="text-sm text-muted-foreground">Estado</p><div className="mt-2"><EstadoEmpresaBadge estado={empresa.estado} /></div></Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Facturación</p>
          {facturacion ? <><p className="mt-1 font-medium">{facturacion.razon_social}</p><p className="text-sm text-muted-foreground">NIT {facturacion.nit} · {facturacion.correo_facturas}</p></> : <p className="mt-1 text-sm text-muted-foreground">Sin datos de facturación.</p>}
        </Card>
      </div>

      <Seccion titulo="Personas de la empresa" descripcion="Bloquear o quitar corta el acceso en la siguiente acción. El historial se conserva.">
        <Table>
          <THead><TR><TH>Persona</TH><TH>Rol</TH><TH>Estado</TH><TH><span className="sr-only">Acciones</span></TH></TR></THead>
          <TBody>
            {miembros.length === 0 && <TR><TD colSpan={4} className="text-muted-foreground">Todavía no hay personas. Cuando alguien active su invitación, aparece aquí.</TD></TR>}
            {miembros.map((m) => {
              const quitado = !!m.quitado_en;
              return (
                <TR key={m.id} data-testid="fila-miembro" className={quitado ? 'opacity-60' : undefined}>
                  <TD><p className="font-medium">{nombreDe(m)}</p><p className="text-xs text-muted-foreground">{m.perfiles?.correo}</p></TD>
                  <TD>{m.rol === 'admin_cliente' ? 'Administrador' : 'Equipo'}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      {quitado ? <Badge variant="neutral">Quitada</Badge> : <Badge variant={m.bloqueado ? 'danger' : 'success'}>{m.bloqueado ? 'Bloqueada' : 'Activa'}</Badge>}
                      {m.perfiles?.bloqueado && <Badge variant="danger">Bloqueo global</Badge>}
                    </div>
                  </TD>
                  <TD className="text-right">
                    {!quitado && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setAccion({ tipo: 'bloquear', m })}><Ban />{m.bloqueado ? 'Desbloquear' : 'Bloquear'}</Button>
                        <Button size="sm" variant="outline" onClick={() => setAccion({ tipo: 'bloqueo_global', m })}><ShieldOff />{m.perfiles?.bloqueado ? 'Quitar bloqueo global' : 'Bloqueo global'}</Button>
                        <Button size="sm" variant="destructive" onClick={() => setAccion({ tipo: 'quitar', m })}><UserMinus />Quitar</Button>
                      </div>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Seccion>

      <Seccion titulo="Invitaciones pendientes" descripcion="Aún no han activado su cuenta. Para renovar una, invita de nuevo al mismo correo.">
        <Table>
          <THead><TR><TH>Correo</TH><TH>Rol</TH><TH>Vence</TH><TH>Estado</TH><TH><span className="sr-only">Acciones</span></TH></TR></THead>
          <TBody>
            {invitaciones.length === 0 && <TR><TD colSpan={5} className="text-muted-foreground">No hay invitaciones pendientes.</TD></TR>}
            {invitaciones.map((i) => (
              <TR key={i.id} data-testid="fila-invitacion"><TD className="font-medium">{i.correo}</TD><TD>{i.rol === 'admin_cliente' ? 'Administrador' : 'Equipo'}</TD><TD className="text-muted-foreground">{fecha(i.vence_en)}</TD><TD><Badge variant={estaVencida(i) ? 'danger' : 'warning'}>{estaVencida(i) ? 'Vencida' : 'Pendiente'}</Badge></TD><TD className="text-right"><Button size="sm" variant="outline" onClick={() => setACancelar(i)}>Cancelar invitación</Button></TD></TR>
            ))}
          </TBody>
        </Table>
      </Seccion>

      <InvitarDialog abierto={invitar} onCerrar={() => setInvitar(false)} empresaId={empresa.id} esSuper onHecho={() => recargar(true)} />
      <Confirmar abierto={!!accion} titulo={t?.titulo ?? ''} texto={t?.texto ?? ''} boton={t?.boton ?? ''} tono={accion?.tipo === 'bloquear' && accion.m.bloqueado ? 'default' : 'destructive'} onConfirmar={ejecutar} onCerrar={() => setAccion(null)} />
      <Confirmar abierto={!!aCancelar} titulo="¿Cancelar esta invitación?" texto={`El enlace enviado a ${aCancelar?.correo ?? ''} dejará de funcionar. Puedes invitar de nuevo cuando quieras.`} boton="Sí, cancelar invitación" onConfirmar={cancelar} onCerrar={() => setACancelar(null)} />
      {cambio.dialogo}
    </>
  );
}
