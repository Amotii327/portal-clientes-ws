'use client';
import * as React from 'react';
import { Check, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Seccion } from '@/components/ds/page';
import { useStore } from '@/lib/store';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { confirmarComprobante, rechazarComprobante } from '@/lib/portal/acciones-dinero';
import { mensajeDeErrorDinero } from '@/lib/portal/errores-dinero';
import { fecha } from '@/lib/utils';
import type { ArgsConfirmarComprobante, ComprobantePorRevisar, MedioPago } from '@/lib/supabase/tipos-dinero';
import { descargarArchivo } from './archivos';
import { DialogoFormulario, motivoValido, type Errores } from './dialogo';
import { AYUDA_MONTO, MEDIOS, hoyColombia, monto, montoParaCampo, normalizarMonto } from './formato';

function Confirmar({ c, onCerrar, onHecho }: { c: ComprobantePorRevisar; onCerrar: () => void; onHecho: (texto: string) => void }) {
  const [valor, setValor] = React.useState(montoParaCampo(c.valor_declarado));
  const [fechaPago, setFechaPago] = React.useState(c.fecha_pago_declarada);
  const [medio, setMedio] = React.useState<MedioPago>('transferencia');
  const [referencia, setReferencia] = React.useState('');
  const enviar = async (): Promise<string | Errores | null> => {
    const e: Errores = {};
    const v = normalizarMonto(valor, c.moneda);
    if (!v) e.valor = 'Escribe un valor válido. ' + AYUDA_MONTO[c.moneda];
    if (!fechaPago) e.fecha = 'Elige la fecha del pago.'; else if (fechaPago > hoyColombia()) e.fecha = 'La fecha no puede ser futura.';
    if (Object.keys(e).length) return e;
    const a: ArgsConfirmarComprobante = { p_comprobante_id: c.id, p_medio: medio };
    if (v !== montoParaCampo(c.valor_declarado)) a.p_valor = v!; // solo se corrige si cambió lo que declaró el cliente
    if (fechaPago !== c.fecha_pago_declarada) a.p_fecha_pago = fechaPago;
    if (referencia.trim()) a.p_referencia = referencia.trim();
    const { data, error } = await confirmarComprobante(crearClienteNavegador(), a);
    if (error) return mensajeDeErrorDinero(error);
    onHecho(`Comprobante confirmado. Se registró el abono y el saldo ahora es ${monto(data?.saldo, c.moneda)}.`);
    return null;
  };
  return (
    <DialogoFormulario titulo="Confirmar comprobante" descripcion={`${c.empresa_nombre} · ${c.concepto}. Aquí nace el abono: revisa el valor y la fecha contra el banco.`} boton="Confirmar y registrar abono" onCerrar={onCerrar} onEnviar={enviar}>
      {(e) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor recibido" htmlFor="conf-valor" hint={`Declaró ${monto(c.valor_declarado, c.moneda)}. ${AYUDA_MONTO[c.moneda]}`} error={e.valor}><Input id="conf-valor" inputMode="decimal" value={valor} aria-invalid={!!e.valor} onChange={(ev) => setValor(ev.target.value)} /></Field>
            <Field label="Fecha del pago" htmlFor="conf-fecha" error={e.fecha}><Input id="conf-fecha" type="date" max={hoyColombia()} value={fechaPago} aria-invalid={!!e.fecha} onChange={(ev) => setFechaPago(ev.target.value)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Medio" htmlFor="conf-medio"><Select id="conf-medio" value={medio} onChange={(ev) => setMedio(ev.target.value as MedioPago)}>{MEDIOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
            <Field label="Referencia (opcional)" htmlFor="conf-ref"><Input id="conf-ref" value={referencia} maxLength={80} onChange={(ev) => setReferencia(ev.target.value)} /></Field>
          </div>
        </>
      )}
    </DialogoFormulario>
  );
}

function Rechazar({ c, onCerrar, onHecho }: { c: ComprobantePorRevisar; onCerrar: () => void; onHecho: (texto: string) => void }) {
  const [motivo, setMotivo] = React.useState('');
  const enviar = async (): Promise<string | Errores | null> => {
    const m = motivoValido(motivo);
    if (!m) return { motivo: 'Escribe el motivo (entre 5 y 500 letras). El cliente lo va a leer.' };
    const { error } = await rechazarComprobante(crearClienteNavegador(), c.id, m);
    if (error) return mensajeDeErrorDinero(error);
    onHecho('Comprobante rechazado. El cliente verá el motivo y el saldo no cambió.');
    return null;
  };
  return (
    <DialogoFormulario titulo="Rechazar comprobante" descripcion={`${c.empresa_nombre} · ${c.concepto}. El cliente verá este motivo y podrá subir otro.`} boton="Rechazar" destructivo onCerrar={onCerrar} onEnviar={enviar}>
      {(e) => (
        <Field label="Motivo" htmlFor="rech-motivo" hint="Escríbelo pensando en el cliente." error={e.motivo}>
          <Textarea id="rech-motivo" value={motivo} maxLength={500} aria-invalid={!!e.motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ejemplo: el valor del comprobante no coincide con el pago." />
        </Field>
      )}
    </DialogoFormulario>
  );
}

/** Bandeja de comprobantes por confirmar (de todas las empresas). El abono solo nace al confirmar. */
export function BandejaComprobantes({ lista, onCambio }: { lista: ComprobantePorRevisar[]; onCambio: () => void }) {
  const { avisar } = useStore();
  const [accion, setAccion] = React.useState<{ tipo: 'confirmar' | 'rechazar'; c: ComprobantePorRevisar } | null>(null);
  const [bajando, setBajando] = React.useState<string | null>(null);
  const ver = async (c: ComprobantePorRevisar) => { setBajando(c.id); const m = await descargarArchivo(c.archivo_path); setBajando(null); if (m) avisar(m); };
  const hecho = (t: string) => { avisar(t); onCambio(); };
  return (
    <Seccion titulo="Comprobantes por confirmar" descripcion="El abono solo se registra cuando confirmas. Si rechazas, el cliente ve el motivo y el saldo no cambia.">
      {lista.length === 0 ? <Card className="p-6 text-sm text-muted-foreground" data-testid="bandeja-vacia">No hay comprobantes pendientes.</Card> : (
        <Card><ul className="divide-y divide-border">
          {lista.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-4" data-testid="comprobante-pendiente">
              <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1 basis-60">
                <p className="font-medium">{c.empresa_nombre} · {c.concepto}</p>
                <p className="text-sm text-muted-foreground">Declara {monto(c.valor_declarado, c.moneda)} el {fecha(c.fecha_pago_declarada)} · subido el {fecha(c.creado_en)}</p>
                {c.nota && <p className="mt-1 text-xs text-muted-foreground">Nota: {c.nota}</p>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => void ver(c)} disabled={bajando === c.id}>Ver archivo</Button>
              <Button size="sm" onClick={() => setAccion({ tipo: 'confirmar', c })}><Check />Confirmar</Button>
              <Button size="sm" variant="destructive" onClick={() => setAccion({ tipo: 'rechazar', c })}><X />Rechazar</Button>
            </li>
          ))}
        </ul></Card>
      )}
      {accion?.tipo === 'confirmar' && <Confirmar c={accion.c} onCerrar={() => setAccion(null)} onHecho={hecho} />}
      {accion?.tipo === 'rechazar' && <Rechazar c={accion.c} onCerrar={() => setAccion(null)} onHecho={hecho} />}
    </Seccion>
  );
}
