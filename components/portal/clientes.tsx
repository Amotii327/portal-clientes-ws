'use client';
import * as React from 'react';
import { Building2, PauseCircle, PlayCircle, Plus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { pausarEmpresa, reactivarEmpresa } from '@/lib/portal/acciones';
import { mensajeDeError } from '@/lib/portal/errores';
import { crearEmpresaServidor, type ResultadoCrear } from '@/lib/servidor/invitaciones';
import { useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import { fecha } from '@/lib/utils';
import type { Database } from '@/lib/supabase/database.types';
import { Confirmar, ResultadoInvitar } from './invitar';

type Empresa = Database['public']['Tables']['empresas']['Row'];
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function leerEmpresas(): Promise<Empresa[]> {
  const { data, error } = await crearClienteNavegador().from('empresas').select('*').order('creada_en', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function EstadoEmpresaBadge({ estado }: { estado: 'activa' | 'pausada' }) {
  return estado === 'activa' ? <Badge variant="success">Activa</Badge> : <Badge variant="warning"><PauseCircle className="size-3.5" aria-hidden />Pausada</Badge>;
}

/** Pausar (con motivo opcional) o reactivar una empresa. Lo comparten la lista y el detalle. */
export function useCambioDeEstado(alTerminar: () => void) {
  const { avisar } = useStore();
  const [aPausar, setAPausar] = React.useState<Pick<Empresa, 'id' | 'nombre'> | null>(null);
  const [motivo, setMotivo] = React.useState('');
  const pausar = async () => {
    if (!aPausar) return;
    const { error } = await pausarEmpresa(crearClienteNavegador(), aPausar.id, motivo.trim() || undefined);
    if (error) avisar(mensajeDeError(error)); else avisar('Empresa pausada. Sus usuarios ven un mensaje amable. No se borró nada.');
    setAPausar(null); setMotivo(''); alTerminar();
  };
  const reactivar = async (e: Pick<Empresa, 'id'>) => {
    const { error } = await reactivarEmpresa(crearClienteNavegador(), e.id);
    if (error) avisar(mensajeDeError(error)); else avisar('Empresa reactivada.');
    alTerminar();
  };
  const dialogo = (
    <Confirmar abierto={!!aPausar} titulo={`¿Pausar a ${aPausar?.nombre ?? 'esta empresa'}?`} texto="Sus usuarios no podrán entrar y verán un mensaje amable. Cierra sus sesiones. No se borra nada y la puedes reactivar cuando quieras." boton="Sí, pausar" onConfirmar={pausar} onCerrar={() => { setAPausar(null); setMotivo(''); }}>
      <Field label="Motivo (opcional)" htmlFor="pausa-motivo" hint="Queda en el registro de actividad."><Textarea id="pausa-motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} /></Field>
    </Confirmar>
  );
  return { pedirPausa: setAPausar, reactivar, dialogo };
}

function CrearEmpresaDialog({ abierto, onCerrar, onHecho }: { abierto: boolean; onCerrar: () => void; onHecho: () => void }) {
  const vacio = { nombre: '', razonSocial: '', nit: '', correoFacturas: '', correoAdmin: '' };
  const [f, setF] = React.useState(vacio);
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [res, setRes] = React.useState<Extract<ResultadoCrear, { ok: true }> | null>(null);
  React.useEffect(() => { if (abierto) { setF(vacio); setIntento(false); setError(''); setRes(null); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
  const e = {
    nombre: intento && !f.nombre.trim() ? 'Escribe el nombre de la empresa.' : undefined,
    razonSocial: intento && !f.razonSocial.trim() ? 'Escribe la razón social.' : undefined,
    nit: intento && !f.nit.trim() ? 'Escribe el NIT.' : undefined,
    correoFacturas: intento && !CORREO.test(f.correoFacturas.trim()) ? 'Escribe un correo válido.' : undefined,
    correoAdmin: intento && !CORREO.test(f.correoAdmin.trim()) ? 'Escribe un correo válido.' : undefined,
  };
  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setIntento(true); setError('');
    if (!f.nombre.trim() || !f.razonSocial.trim() || !f.nit.trim() || !CORREO.test(f.correoFacturas.trim()) || !CORREO.test(f.correoAdmin.trim())) return;
    setEnviando(true);
    const r = await crearEmpresaServidor(f).catch(() => null);
    setEnviando(false);
    if (!r || !r.ok) { setError(r?.mensaje ?? 'No pudimos completar la acción. Intenta de nuevo y, si sigue, escríbenos.'); return; }
    setRes(r); onHecho();
  };
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent title="Crear empresa cliente" description="Se crea la empresa, sus datos de facturación y la invitación de su primer administrador.">
        {res ? (
          <div className="space-y-4"><ResultadoInvitar r={res} esSuper /><div className="flex justify-end"><DialogClose asChild><Button>Listo</Button></DialogClose></div></div>
        ) : (
          <form className="space-y-4" onSubmit={enviar} noValidate>
            {error && <Alert variant="danger" title="No pudimos crear la empresa">{error}</Alert>}
            <Field label="Nombre de la empresa" htmlFor="ce-nombre" error={e.nombre}><Input id="ce-nombre" value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} maxLength={120} aria-invalid={!!e.nombre} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Razón social" htmlFor="ce-razon" error={e.razonSocial}><Input id="ce-razon" value={f.razonSocial} onChange={(x) => setF({ ...f, razonSocial: x.target.value })} maxLength={200} aria-invalid={!!e.razonSocial} /></Field>
              <Field label="NIT" htmlFor="ce-nit" error={e.nit}><Input id="ce-nit" value={f.nit} onChange={(x) => setF({ ...f, nit: x.target.value })} maxLength={30} aria-invalid={!!e.nit} /></Field>
            </div>
            <Field label="Correo para facturas" htmlFor="ce-cfact" error={e.correoFacturas}><Input id="ce-cfact" type="email" value={f.correoFacturas} onChange={(x) => setF({ ...f, correoFacturas: x.target.value })} aria-invalid={!!e.correoFacturas} /></Field>
            <Field label="Correo del primer administrador" htmlFor="ce-cadmin" hint="Recibirá la invitación para activar su cuenta." error={e.correoAdmin}><Input id="ce-cadmin" type="email" value={f.correoAdmin} onChange={(x) => setF({ ...f, correoAdmin: x.target.value })} aria-invalid={!!e.correoAdmin} /></Field>
            <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="ghost" type="button">Cancelar</Button></DialogClose><Button type="submit" disabled={enviando}>{enviando ? 'Creando…' : 'Crear empresa'}</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Lista de empresas del super admin: crear, ver, pausar y reactivar. */
export function ClientesReal() {
  const { estado, datos, recargar } = useCargar(leerEmpresas, []);
  const [crear, setCrear] = React.useState(false);
  const cambio = useCambioDeEstado(() => recargar(true));
  return (
    <>
      <PageHeader titulo="Clientes" descripcion="Todas las empresas del portal. Pausar corta el acceso de sus usuarios sin borrar nada." acciones={<Button onClick={() => setCrear(true)}><Plus />Crear empresa</Button>} />
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => recargar()} />}
      {estado === 'ok' && datos && datos.length === 0 && <EstadoVacio titulo="Aún no hay empresas" texto="Crea la primera empresa cliente: quedará lista para invitar a su administrador."><Button onClick={() => setCrear(true)}><Plus />Crear empresa</Button></EstadoVacio>}
      {estado === 'ok' && datos && datos.length > 0 && (
        <Table>
          <THead><TR><TH>Empresa</TH><TH>NIT</TH><TH>Estado</TH><TH>Creada</TH><TH><span className="sr-only">Acciones</span></TH></TR></THead>
          <TBody>
            {datos.map((e) => (
              <TR key={e.id} data-testid="fila-empresa">
                <TD className="font-medium"><span className="inline-flex items-center gap-2"><Building2 className="size-4 text-muted-foreground" aria-hidden />{e.nombre}</span></TD>
                <TD className="text-muted-foreground">{e.nit_registro}</TD>
                <TD><EstadoEmpresaBadge estado={e.estado} /></TD>
                <TD className="text-muted-foreground">{fecha(e.creada_en)}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" asChild><Enlace to={`/admin/clientes/${e.id}`}>Ver</Enlace></Button>
                    {e.estado === 'activa'
                      ? <Button size="sm" variant="outline" onClick={() => cambio.pedirPausa(e)}><PauseCircle />Pausar</Button>
                      : <Button size="sm" onClick={() => void cambio.reactivar(e)}><PlayCircle />Reactivar</Button>}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <CrearEmpresaDialog abierto={crear} onCerrar={() => setCrear(false)} onHecho={() => recargar(true)} />
      {cambio.dialogo}
    </>
  );
}
