'use client';
import * as React from 'react';
import { Ban, MailPlus, UserMinus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/ds/page';
import { Pantalla, SinPermiso } from '@/components/ds/states';
import { useStore } from '@/lib/store';
import type { Permisos } from '@/lib/data';
import { fechaHora } from '@/lib/utils';

const PERMISOS: { k: keyof Permisos; titulo: string; texto: string }[] = [
  { k: 'aprobar', titulo: 'Aprobar sprints y diseños', texto: 'Puede decir "apruebo" o "pido cambios".' },
  { k: 'verDinero', titulo: 'Ver contrato, pagos y facturas', texto: 'Ve el módulo Dinero y el pago de cada hito.' },
  { k: 'verTodosTickets', titulo: 'Ver todos los tickets de la empresa', texto: 'Si está apagado, solo ve los suyos.' },
  { k: 'subirArchivos', titulo: 'Subir archivos de la empresa', texto: 'Y comprobantes de pago, si además puede ver dinero.' },
];

export function MiEquipo() {
  const { empresa, can, mutar, avisar } = useStore();
  const [dlg, setDlg] = React.useState(false);
  const [correo, setCorreo] = React.useState('');
  const [cargo, setCargo] = React.useState('');
  const [intento, setIntento] = React.useState(false);
  if (!can.esAdmin) return <><PageHeader titulo="Mi equipo" /><SinPermiso texto="Solo el administrador de la empresa puede invitar personas y decidir qué ve cada una." /></>;
  const lectura = can.soloLectura;
  const invitar = () => {
    setIntento(true);
    if (!/^\S+@\S+\.\S+$/.test(correo) || !cargo.trim()) return;
    mutar(empresa.id, (e) => { e.miembros.push({ id: 'm-' + Date.now(), cargo, correo, rol: 'equipo', estado: 'invitado', permisos: { aprobar: false, verDinero: false, verTodosTickets: false, subirArchivos: false } }); }, `Invitó a ${correo}`);
    avisar(`Invitación enviada a ${correo}. El enlace vence en 7 días.`);
    setDlg(false); setCorreo(''); setCargo(''); setIntento(false);
  };
  return (
    <>
      <PageHeader titulo="Mi equipo" descripcion="Invita a tu gente y decide qué ve y qué puede hacer cada una. Como las llaves de un edificio: tú das copia de cada puerta." acciones={<Button onClick={() => setDlg(true)} disabled={lectura}><MailPlus />Invitar a alguien</Button>} />
      <Pantalla vacio={{ titulo: 'Aún no hay nadie más en tu equipo', texto: 'Invita a las personas de tu empresa que necesitan ver el proyecto.' }}>
        <Alert variant="info" className="mb-6" title="Los documentos se comparten uno por uno">Además de estos permisos, Websourcing decide qué documentos ve cada persona. Por defecto, el equipo ve los documentos "para todo el equipo".</Alert>
        <ul className="space-y-4">
          {empresa.miembros.map((m) => (
            <li key={m.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display font-semibold text-primary-text" aria-hidden>{m.cargo.slice(0, 1)}</span>
                    <div className="min-w-0"><p className="font-medium">{m.cargo}</p><p className="truncate text-sm text-muted-foreground">{m.correo}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={m.rol === 'admin' ? 'primary' : 'neutral'}>{m.rol === 'admin' ? 'Administrador' : 'Equipo'}</Badge>
                    <Badge variant={m.estado === 'activo' ? 'success' : m.estado === 'invitado' ? 'warning' : 'danger'}>{m.estado === 'activo' ? 'Activo' : m.estado === 'invitado' ? 'Invitación pendiente' : 'Bloqueado'}</Badge>
                  </div>
                </div>
                {m.ultimoAcceso && <p className="mt-2 text-xs text-muted-foreground">Último acceso: {fechaHora(m.ultimoAcceso)}</p>}
                {m.rol === 'equipo' ? (
                  <>
                    <div className="mt-4 grid gap-x-8 gap-y-3 border-t border-border pt-4 md:grid-cols-2">
                      {PERMISOS.map((p) => (
                        <div key={p.k} className="flex items-start justify-between gap-4">
                          <div><label htmlFor={`${m.id}-${p.k}`} className="text-sm font-medium">{p.titulo}</label><p className="text-xs text-muted-foreground">{p.texto}</p></div>
                          <Switch id={`${m.id}-${p.k}`} checked={m.permisos[p.k]} disabled={lectura} onCheckedChange={(v) => { mutar(empresa.id, (e) => { e.miembros.find((x) => x.id === m.id)!.permisos[p.k] = v; }, `Cambió el permiso "${p.titulo}" de ${m.cargo}`); avisar(`${m.cargo}: ${p.titulo.toLowerCase()} ${v ? 'activado' : 'desactivado'}.`); }} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                      <Button size="sm" variant="outline" disabled={lectura} onClick={() => { mutar(empresa.id, (e) => { const x = e.miembros.find((y) => y.id === m.id)!; x.estado = x.estado === 'bloqueado' ? 'activo' : 'bloqueado'; }, `Cambió el bloqueo de ${m.cargo}`); }}><Ban />{m.estado === 'bloqueado' ? 'Desbloquear' : 'Bloquear'}</Button>
                      <Button size="sm" variant="destructive" disabled={lectura} onClick={() => { mutar(empresa.id, (e) => { e.miembros = e.miembros.filter((y) => y.id !== m.id); }, `Quitó a ${m.cargo} del equipo`); avisar('Quitaste a esta persona. Pierde el acceso de inmediato; su historial se conserva.'); }}><UserMinus />Quitar del equipo</Button>
                    </div>
                  </>
                ) : <p className="mt-3 text-sm text-muted-foreground">Ve todo lo de la empresa. No se puede quitar a sí mismo.</p>}
              </Card>
            </li>
          ))}
        </ul>
      </Pantalla>
      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent title="Invitar a alguien" description="Le llegará un correo para crear su contraseña. Entra como Equipo del cliente, solo con lo básico: ver avance y revisiones, y crear tickets.">
          <div className="space-y-4">
            <Field label="Correo" htmlFor="inv-c" error={intento && !/^\S+@\S+\.\S+$/.test(correo) ? 'Escribe un correo válido.' : undefined}><Input id="inv-c" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="persona@tuempresa.co" /></Field>
            <Field label="Cargo o área" htmlFor="inv-cargo" error={intento && !cargo.trim() ? 'Escribe el cargo o área.' : undefined}><Input id="inv-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ejemplo: Compras" /></Field>
            <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={invitar}>Enviar invitación</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
