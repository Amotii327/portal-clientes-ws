'use client';
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { crearEmpresaServidor, invitarMiembroServidor, type ResultadoCrear } from '@/lib/servidor/invitaciones';
import { fecha } from '@/lib/utils';
import type { Rol } from '@/lib/supabase/database.types';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Qué pasó con la invitación. El enlace solo aparece en desarrollo y solo para el super admin. */
export function ResultadoInvitar({ r, esSuper }: { r: Extract<ResultadoCrear, { ok: true }>; esSuper: boolean }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <div className="space-y-4" data-testid="resultado-invitacion">
      <Alert variant="success" title="Invitación creada">
        Quedó lista para <strong>{r.correo}</strong>. El enlace vence el {fecha(r.venceEn.slice(0, 10))}.
        {!r.correoEnviado && !r.enlaceDev && (esSuper
          ? ' El envío de correos todavía no está conectado, así que esta invitación no se entregó. Cuando se active, vuelve a invitar a esta persona para que reciba el enlace.'
          : ' El envío de correos se activa pronto y por ahora esta invitación no se entrega. Cuando esté activo, el Equipo Websourcing te avisa y se reenvía la invitación.')}
      </Alert>
      {r.enlaceDev && (
        <Alert variant="warning" title="Solo desarrollo">
          Todavía no se envían correos, así que este enlace se muestra aquí, una sola vez. Cópialo y envíalo a la persona. En producción nunca se muestra.
          <span className="mt-3 block break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-xs text-foreground" data-testid="enlace-dev">{r.enlaceDev}</span>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => { void navigator.clipboard?.writeText(r.enlaceDev!).then(() => setCopiado(true)).catch(() => {}); }}>
            {copiado ? <><Check />Copiado</> : <><Copy />Copiar enlace</>}
          </Button>
        </Alert>
      )}
    </div>
  );
}

/** Invitar a una persona. El admin del cliente solo invita "equipo"; el super admin elige el rol. */
export function InvitarDialog({ abierto, onCerrar, empresaId, esSuper, onHecho }: {
  abierto: boolean; onCerrar: () => void; empresaId: string; esSuper: boolean; onHecho: () => void;
}) {
  const [correo, setCorreo] = React.useState('');
  const [rol, setRol] = React.useState<Rol>('equipo');
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [res, setRes] = React.useState<Extract<ResultadoCrear, { ok: true }> | null>(null);
  React.useEffect(() => { if (abierto) { setCorreo(''); setRol('equipo'); setIntento(false); setError(''); setRes(null); } }, [abierto]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntento(true); setError('');
    if (!CORREO.test(correo.trim())) return;
    setEnviando(true);
    const r = await invitarMiembroServidor({ empresaId, correo: correo.trim(), rol: esSuper ? rol : 'equipo' }).catch(() => null);
    setEnviando(false);
    if (!r || !r.ok) { setError(r?.mensaje ?? 'No pudimos completar la acción. Intenta de nuevo y, si sigue, escríbenos.'); return; }
    setRes(r); onHecho();
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent title="Invitar a alguien" description={esSuper ? 'Le llegará un enlace para crear su contraseña. El enlace vence en 7 días y sirve una sola vez.' : 'Entra como Equipo del cliente, solo con lo básico: ver avance y revisiones. Después decides qué más puede ver.'}>
        {res ? (
          <div className="space-y-4"><ResultadoInvitar r={res} esSuper={esSuper} /><div className="flex justify-end"><DialogClose asChild><Button>Listo</Button></DialogClose></div></div>
        ) : (
          <form className="space-y-4" onSubmit={enviar} noValidate>
            {error && <Alert variant="danger" title="No pudimos invitar">{error}</Alert>}
            <Field label="Correo" htmlFor="inv-c" error={intento && !CORREO.test(correo.trim()) ? 'Escribe un correo válido.' : undefined}><Input id="inv-c" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="persona@tuempresa.co" aria-invalid={intento && !CORREO.test(correo.trim())} /></Field>
            {esSuper && (
              <Field label="Rol" htmlFor="inv-rol"><Select id="inv-rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}><option value="equipo">Equipo del cliente</option><option value="admin_cliente">Administrador del cliente</option></Select></Field>
            )}
            <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="ghost" type="button">Cancelar</Button></DialogClose><Button type="submit" disabled={enviando}>{enviando ? 'Invitando…' : 'Enviar invitación'}</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Ventana de confirmación para acciones que no se deshacen a la ligera (quitar, bloquear, pausar). */
export function Confirmar({ abierto, titulo, texto, boton, tono = 'destructive', onConfirmar, onCerrar, children }: {
  abierto: boolean; titulo: string; texto: string; boton: string; tono?: 'destructive' | 'default';
  onConfirmar: () => Promise<void>; onCerrar: () => void; children?: React.ReactNode;
}) {
  const [trabajando, setTrabajando] = React.useState(false);
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !trabajando && onCerrar()}>
      <DialogContent title={titulo} description={texto}>
        {children}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</Button>
          <Button variant={tono} disabled={trabajando} onClick={async () => { setTrabajando(true); try { await onConfirmar(); } finally { setTrabajando(false); } }}>{trabajando ? 'Un momento…' : boton}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
