'use client';
import * as React from 'react';
import { Ban, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Seccion } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { useStore } from '@/lib/store';
import { crearClienteNavegador } from '@/lib/supabase/client';
import {
  agregarPago, anularAbono, anularFactura, crearAbono, crearContrato, dineroDelProyecto, editarContrato, editarPago, quitarPago,
} from '@/lib/portal/acciones-dinero';
import { mensajeDeErrorDinero } from '@/lib/portal/errores-dinero';
import { fecha } from '@/lib/utils';
import type {
  AbonoDinero, ArgsEditarContrato, ArgsEditarPago, ContratoConSaldo, DineroDelProyecto, FacturaDinero, MedioPago, Moneda, PagoProgramado,
} from '@/lib/supabase/tipos-dinero';
import { descargarArchivo, enviarArchivo } from './archivos';
import { DialogoFormulario, motivoValido, type Errores } from './dialogo';
import { AYUDA_MONTO, MAX_FACTURA, MEDIOS, hoyColombia, monto, montoParaCampo, normalizarMonto } from './formato';
import { useLectura } from './lectura';
import { ListaAbonos, ListaFacturas, PlanDePagos, TarjetasContrato } from './secciones';

interface Hito { id: string; numero: number; nombre: string }
const MONEDAS: { id: Moneda; label: string }[] = [{ id: 'COP', label: 'COP · Pesos colombianos' }, { id: 'USD', label: 'USD · Dólares' }];

async function leerTodo(proyectoId: string) {
  const c = crearClienteNavegador();
  const [d, h] = await Promise.all([dineroDelProyecto(c, proyectoId), c.from('hitos').select('id, numero, nombre').eq('proyecto_id', proyectoId).order('numero')]);
  const error = d.error ?? h.error;
  return { data: error ? null : { dinero: d.data as DineroDelProyecto, hitos: (h.data ?? []) as Hito[] }, error };
}

type Dialogo =
  | { t: 'contrato' } | { t: 'editar-contrato'; contrato: ContratoConSaldo }
  | { t: 'cuota'; pago?: PagoProgramado } | { t: 'quitar-cuota'; pago: PagoProgramado }
  | { t: 'abono' } | { t: 'anular-abono'; abono: AbonoDinero }
  | { t: 'factura' } | { t: 'anular-factura'; factura: FacturaDinero };

// ---------------- Diálogos ----------------
function DialogoContrato({ proyectoId, contrato, tieneMovimientos, onCerrar, onHecho }: { proyectoId: string; contrato?: ContratoConSaldo; tieneMovimientos: boolean; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [valor, setValor] = React.useState(contrato ? montoParaCampo(contrato.valor) : '');
  const [moneda, setMoneda] = React.useState<Moneda>(contrato?.moneda ?? 'COP');
  const [anticipo, setAnticipo] = React.useState(contrato && contrato.anticipo ? montoParaCampo(contrato.anticipo) : '');
  const [firma, setFirma] = React.useState(contrato?.fecha_firma ?? '');
  const enviar = async (): Promise<string | Errores | null> => {
    const e: Errores = {};
    const v = normalizarMonto(valor, moneda);
    if (!v) e.valor = 'Escribe el valor del contrato. ' + AYUDA_MONTO[moneda];
    const a = anticipo.trim() ? normalizarMonto(anticipo, moneda) : '0';
    if (!a) e.anticipo = 'Escribe un anticipo válido o déjalo vacío. ' + AYUDA_MONTO[moneda];
    if (Object.keys(e).length) return e;
    const c = crearClienteNavegador();
    if (!contrato) {
      const { error } = await crearContrato(c, { p_proyecto_id: proyectoId, p_valor: v!, p_moneda: moneda, p_anticipo: a!, p_fecha_firma: firma || null });
      if (error) return mensajeDeErrorDinero(error);
      onHecho('Contrato creado.');
    } else {
      const args: ArgsEditarContrato = { p_contrato_id: contrato.contrato_id, p_valor: v!, p_anticipo: a! };
      if (firma && firma !== contrato.fecha_firma) args.p_fecha_firma = firma;
      if (moneda !== contrato.moneda) args.p_moneda = moneda;
      const { error } = await editarContrato(c, args);
      if (error) return mensajeDeErrorDinero(error);
      onHecho('Contrato actualizado.');
    }
    return null;
  };
  return (
    <DialogoFormulario titulo={contrato ? 'Editar contrato' : 'Crear contrato'} descripcion="Un contrato por proyecto. La moneda no se puede cambiar cuando ya hay cuotas o abonos." boton={contrato ? 'Guardar cambios' : 'Crear contrato'} onCerrar={onCerrar} onEnviar={enviar}>
      {(e) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Moneda" htmlFor="ct-moneda"><Select id="ct-moneda" value={moneda} disabled={!!contrato && tieneMovimientos} onChange={(ev) => setMoneda(ev.target.value as Moneda)}>{MONEDAS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
            <Field label="Valor del contrato" htmlFor="ct-valor" hint={AYUDA_MONTO[moneda]} error={e.valor}><Input id="ct-valor" inputMode="decimal" value={valor} aria-invalid={!!e.valor} onChange={(ev) => setValor(ev.target.value)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Anticipo acordado (opcional)" htmlFor="ct-anticipo" hint="Es informativo: no crea cuota ni abono." error={e.anticipo}><Input id="ct-anticipo" inputMode="decimal" value={anticipo} aria-invalid={!!e.anticipo} onChange={(ev) => setAnticipo(ev.target.value)} /></Field>
            <Field label="Fecha de firma (opcional)" htmlFor="ct-firma"><Input id="ct-firma" type="date" value={firma} onChange={(ev) => setFirma(ev.target.value)} /></Field>
          </div>
        </>
      )}
    </DialogoFormulario>
  );
}

function DialogoCuota({ contrato, hitos, pago, onCerrar, onHecho }: { contrato: ContratoConSaldo; hitos: Hito[]; pago?: PagoProgramado; onCerrar: () => void; onHecho: (t: string) => void }) {
  const m = contrato.moneda;
  const [concepto, setConcepto] = React.useState(pago?.concepto ?? '');
  const [valor, setValor] = React.useState(pago ? montoParaCampo(pago.valor) : '');
  const [vence, setVence] = React.useState(pago?.vence_el ?? '');
  const [hito, setHito] = React.useState(pago?.hito_id ?? '');
  const enviar = async (): Promise<string | Errores | null> => {
    const e: Errores = {};
    if (concepto.trim().length < 2) e.concepto = 'Escribe el concepto de la cuota.';
    const v = normalizarMonto(valor, m);
    if (!v) e.valor = 'Escribe el valor de la cuota. ' + AYUDA_MONTO[m];
    if (!vence) e.vence = 'Elige la fecha de vencimiento.';
    if (Object.keys(e).length) return e;
    const c = crearClienteNavegador();
    if (!pago) {
      const { error } = await agregarPago(c, { p_contrato_id: contrato.contrato_id, p_concepto: concepto.trim(), p_valor: v!, p_vence_el: vence, p_hito_id: hito || null });
      if (error) return mensajeDeErrorDinero(error);
      onHecho('Cuota agregada al plan de pagos.');
    } else {
      const a: ArgsEditarPago = { p_pago_id: pago.pago_id, p_concepto: concepto.trim(), p_valor: v!, p_vence_el: vence };
      if (hito !== (pago.hito_id ?? '')) { if (hito) a.p_hito_id = hito; else a.p_quitar_hito = true; }
      const { error } = await editarPago(c, a);
      if (error) return mensajeDeErrorDinero(error);
      onHecho('Cuota actualizada.');
    }
    return null;
  };
  return (
    <DialogoFormulario titulo={pago ? 'Editar cuota' : 'Agregar cuota'} descripcion="Las cuotas del plan suman como máximo el valor del contrato." boton={pago ? 'Guardar cuota' : 'Agregar cuota'} onCerrar={onCerrar} onEnviar={enviar}>
      {(e) => (
        <>
          <Field label="Concepto" htmlFor="cu-concepto" error={e.concepto}><Input id="cu-concepto" value={concepto} maxLength={120} aria-invalid={!!e.concepto} onChange={(ev) => setConcepto(ev.target.value)} placeholder="Ejemplo: Entrega del sprint 2" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor" htmlFor="cu-valor" hint={AYUDA_MONTO[m]} error={e.valor}><Input id="cu-valor" inputMode="decimal" value={valor} aria-invalid={!!e.valor} onChange={(ev) => setValor(ev.target.value)} /></Field>
            <Field label="Vence el" htmlFor="cu-vence" error={e.vence}><Input id="cu-vence" type="date" value={vence} aria-invalid={!!e.vence} onChange={(ev) => setVence(ev.target.value)} /></Field>
          </div>
          <Field label="Hito asociado" htmlFor="cu-hito" hint="Opcional. El cliente ve a qué hito del proyecto corresponde el pago.">
            <Select id="cu-hito" value={hito} onChange={(ev) => setHito(ev.target.value)}>
              <option value="">Sin hito</option>
              {hitos.map((h) => <option key={h.id} value={h.id}>Hito {h.numero} · {h.nombre}</option>)}
            </Select>
          </Field>
        </>
      )}
    </DialogoFormulario>
  );
}

function DialogoQuitarCuota({ pago, onCerrar, onHecho }: { pago: PagoProgramado; onCerrar: () => void; onHecho: (t: string) => void }) {
  return (
    <DialogoFormulario titulo="Quitar cuota" descripcion={`${pago.concepto} · vence ${fecha(pago.vence_el)}. Solo se puede quitar si no tiene abonos, comprobantes ni facturas.`} boton="Quitar cuota" destructivo onCerrar={onCerrar}
      onEnviar={async () => { const { error } = await quitarPago(crearClienteNavegador(), pago.pago_id); if (error) return mensajeDeErrorDinero(error); onHecho('Cuota quitada del plan.'); return null; }}>
      {() => <p className="text-sm text-muted-foreground">¿Seguro que quieres quitar esta cuota del plan de pagos?</p>}
    </DialogoFormulario>
  );
}

function DialogoAbono({ contrato, pagos, onCerrar, onHecho }: { contrato: ContratoConSaldo; pagos: PagoProgramado[]; onCerrar: () => void; onHecho: (t: string) => void }) {
  const m = contrato.moneda;
  const abiertas = pagos.filter((p) => p.estado !== 'pagado');
  const [pago, setPago] = React.useState('');
  const [valor, setValor] = React.useState('');
  const [fechaPago, setFechaPago] = React.useState(hoyColombia());
  const [medio, setMedio] = React.useState<MedioPago>('transferencia');
  const [ref, setRef] = React.useState('');
  const enviar = async (): Promise<string | Errores | null> => {
    const e: Errores = {};
    const v = normalizarMonto(valor, m);
    if (!v) e.valor = 'Escribe el valor del abono. ' + AYUDA_MONTO[m];
    if (!fechaPago) e.fecha = 'Elige la fecha del pago.'; else if (fechaPago > hoyColombia()) e.fecha = 'La fecha del pago no puede ser futura.';
    if (Object.keys(e).length) return e;
    const { data, error } = await crearAbono(crearClienteNavegador(), { p_contrato_id: contrato.contrato_id, p_valor: v!, p_fecha_pago: fechaPago, p_medio: medio, p_pago_id: pago || null, p_referencia: ref.trim() || null });
    if (error) return mensajeDeErrorDinero(error);
    onHecho(`Abono registrado. El saldo ahora es ${monto(data?.saldo, m)}.`);
    return null;
  };
  return (
    <DialogoFormulario titulo="Registrar abono" descripcion="El saldo se recalcula solo. Un abono no se edita: si te equivocas, anúlalo con motivo." boton="Registrar abono" onCerrar={onCerrar} onEnviar={enviar}>
      {(e) => (
        <>
          <Field label="Aplicar a" htmlFor="ab-pago"><Select id="ab-pago" value={pago} onChange={(ev) => setPago(ev.target.value)}><option value="">Al contrato (sin cuota)</option>{abiertas.map((p) => <option key={p.pago_id} value={p.pago_id}>{p.concepto} · falta {monto(p.pendiente, m)}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor" htmlFor="ab-valor" hint={AYUDA_MONTO[m]} error={e.valor}><Input id="ab-valor" inputMode="decimal" value={valor} aria-invalid={!!e.valor} onChange={(ev) => setValor(ev.target.value)} /></Field>
            <Field label="Fecha del pago" htmlFor="ab-fecha" error={e.fecha}><Input id="ab-fecha" type="date" max={hoyColombia()} value={fechaPago} aria-invalid={!!e.fecha} onChange={(ev) => setFechaPago(ev.target.value)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Medio" htmlFor="ab-medio"><Select id="ab-medio" value={medio} onChange={(ev) => setMedio(ev.target.value as MedioPago)}>{MEDIOS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
            <Field label="Referencia (opcional)" htmlFor="ab-ref"><Input id="ab-ref" value={ref} maxLength={80} onChange={(ev) => setRef(ev.target.value)} /></Field>
          </div>
        </>
      )}
    </DialogoFormulario>
  );
}

/** Anular un abono o una factura: el motivo es obligatorio y lo lee el cliente. */
function DialogoAnular({ titulo, descripcion, boton, aviso, ejecutar, onCerrar, onHecho }: {
  titulo: string; descripcion: string; boton: string; aviso: string;
  ejecutar: (motivo: string) => PromiseLike<{ error: { message?: string } | null }>; onCerrar: () => void; onHecho: (t: string) => void;
}) {
  const [motivo, setMotivo] = React.useState('');
  return (
    <DialogoFormulario titulo={titulo} descripcion={descripcion} boton={boton} destructivo onCerrar={onCerrar}
      onEnviar={async () => {
        const m = motivoValido(motivo);
        if (!m) return { motivo: 'Escribe el motivo (entre 5 y 500 letras). El cliente lo va a leer.' };
        const { error } = await ejecutar(m);
        if (error) return mensajeDeErrorDinero(error);
        onHecho(aviso); return null;
      }}>
      {(e) => <Field label="Motivo" htmlFor="an-motivo" hint="Escríbelo pensando en el cliente." error={e.motivo}><Textarea id="an-motivo" value={motivo} maxLength={500} aria-invalid={!!e.motivo} onChange={(ev) => setMotivo(ev.target.value)} /></Field>}
    </DialogoFormulario>
  );
}

function DialogoFactura({ contrato, pagos, onCerrar, onHecho }: { contrato: ContratoConSaldo; pagos: PagoProgramado[]; onCerrar: () => void; onHecho: (t: string) => void }) {
  const m = contrato.moneda;
  const [numero, setNumero] = React.useState('');
  const [valor, setValor] = React.useState('');
  const [emision, setEmision] = React.useState(hoyColombia());
  const [pago, setPago] = React.useState('');
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const enviar = async (): Promise<string | Errores | null> => {
    const e: Errores = {};
    if (!numero.trim()) e.numero = 'Escribe el número de la factura.';
    const v = normalizarMonto(valor, m);
    if (!v) e.valor = 'Escribe el valor de la factura. ' + AYUDA_MONTO[m];
    if (!emision) e.emision = 'Elige la fecha de emisión.';
    if (!archivo) e.archivo = 'Elige el PDF de la factura.';
    else if (archivo.type !== 'application/pdf') e.archivo = 'El archivo debe ser un PDF.';
    else if (archivo.size > MAX_FACTURA) e.archivo = 'El PDF pesa más de 20 MB.';
    if (Object.keys(e).length) return e;
    const fd = new FormData();
    fd.set('tipo', 'factura'); fd.set('contratoId', contrato.contrato_id); fd.set('numero', numero.trim()); fd.set('valor', v!); fd.set('fechaEmision', emision); fd.set('pagoId', pago); fd.set('archivo', archivo!);
    const r = await enviarArchivo(fd);
    if (!r.ok) return r.mensaje;
    onHecho('Factura subida. El cliente ya puede descargarla.');
    return null;
  };
  return (
    <DialogoFormulario titulo="Subir factura" descripcion="PDF ya hecho, a nombre de Amotii. El cliente podrá descargarla." boton="Subir factura" onCerrar={onCerrar} onEnviar={enviar}>
      {(e) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número de factura" htmlFor="fa-numero" error={e.numero}><Input id="fa-numero" value={numero} maxLength={60} aria-invalid={!!e.numero} onChange={(ev) => setNumero(ev.target.value)} placeholder="FV-0001" /></Field>
            <Field label="Fecha de emisión" htmlFor="fa-emision" error={e.emision}><Input id="fa-emision" type="date" value={emision} aria-invalid={!!e.emision} onChange={(ev) => setEmision(ev.target.value)} /></Field>
          </div>
          <Field label="Valor" htmlFor="fa-valor" hint={AYUDA_MONTO[m]} error={e.valor}><Input id="fa-valor" inputMode="decimal" value={valor} aria-invalid={!!e.valor} onChange={(ev) => setValor(ev.target.value)} /></Field>
          <Field label="Cuota (opcional)" htmlFor="fa-pago"><Select id="fa-pago" value={pago} onChange={(ev) => setPago(ev.target.value)}><option value="">Del contrato (sin cuota)</option>{pagos.map((p) => <option key={p.pago_id} value={p.pago_id}>{p.concepto}</option>)}</Select></Field>
          <Field label="Archivo PDF" htmlFor="fa-archivo" hint="Máximo 20 MB." error={e.archivo}><Input id="fa-archivo" type="file" accept="application/pdf,.pdf" className="h-auto py-2" aria-invalid={!!e.archivo} onChange={(ev) => setArchivo(ev.target.files?.[0] ?? null)} /></Field>
        </>
      )}
    </DialogoFormulario>
  );
}

// ---------------- Panel del proyecto ----------------
/** Contrato, plan de pagos, abonos y facturas de un proyecto, con todo lo que puede hacer el super admin. */
export function PanelDineroProyecto({ proyectoId }: { proyectoId: string }) {
  const { avisar } = useStore();
  const { estado, datos, recargar } = useLectura(() => leerTodo(proyectoId), [proyectoId]);
  const [dlg, setDlg] = React.useState<Dialogo | null>(null);
  const [bajando, setBajando] = React.useState<string | null>(null);
  if (estado === 'cargando') return <EstadoCargando />;
  if (estado !== 'ok' || !datos) return <EstadoError onReintentar={() => recargar()} />;
  const { dinero, hitos } = datos;
  const { contrato, pagos, abonos, facturas } = dinero;
  const cerrar = () => setDlg(null);
  const hecho = (t: string) => { avisar(t); recargar(true); };
  const bajar = async (f: FacturaDinero) => { setBajando(f.id); const msg = await descargarArchivo(f.archivo_path, f.id); setBajando(null); if (msg) avisar(msg); };

  if (!contrato) {
    return (
      <>
        <EstadoVacio titulo="Este proyecto aún no tiene contrato" texto="Crea el contrato para poder armar el plan de pagos, registrar abonos y subir facturas.">
          <Button onClick={() => setDlg({ t: 'contrato' })}><Plus />Crear contrato</Button>
        </EstadoVacio>
        {dlg?.t === 'contrato' && <DialogoContrato proyectoId={proyectoId} tieneMovimientos={false} onCerrar={cerrar} onHecho={hecho} />}
      </>
    );
  }
  const m = contrato.moneda;
  const movimientos = pagos.length > 0 || abonos.length > 0;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Contrato en {m}{contrato.fecha_firma ? ` · firmado el ${fecha(contrato.fecha_firma)}` : ''}</p>
        <Button variant="outline" size="sm" onClick={() => setDlg({ t: 'editar-contrato', contrato })}><Pencil />Editar contrato</Button>
      </div>
      <TarjetasContrato contrato={contrato} pagos={pagos} abonos={abonos} admin />

      <Seccion titulo="Plan de pagos" descripcion="Cada cuota puede atarse a un hito del proyecto." acciones={<Button size="sm" onClick={() => setDlg({ t: 'cuota' })}><Plus />Agregar cuota</Button>}>
        <PlanDePagos pagos={pagos} moneda={m} vacio="Aún no hay cuotas. Agrega la primera para armar el plan."
          accion={(p) => (
            <>
              <Button size="sm" variant="outline" onClick={() => setDlg({ t: 'cuota', pago: p })} aria-label={`Editar cuota ${p.concepto}`}><Pencil /></Button>
              <Button size="sm" variant="ghost" onClick={() => setDlg({ t: 'quitar-cuota', pago: p })} aria-label={`Quitar cuota ${p.concepto}`}><Trash2 /></Button>
            </>
          )} />
      </Seccion>

      <div className="grid gap-8 lg:grid-cols-2">
        <Seccion titulo="Abonos" className="mb-0" acciones={<Button size="sm" variant="secondary" onClick={() => setDlg({ t: 'abono' })}><Plus />Registrar abono</Button>}>
          <ListaAbonos abonos={abonos} pagos={pagos} moneda={m}
            accion={(a) => (a.anulado_en ? null : <Button size="sm" variant="ghost" onClick={() => setDlg({ t: 'anular-abono', abono: a })}><Ban />Anular</Button>)} />
        </Seccion>
        <Seccion titulo="Facturas" descripcion="A nombre de Amotii." className="mb-0" acciones={<Button size="sm" variant="secondary" onClick={() => setDlg({ t: 'factura' })}><Upload />Subir factura</Button>}>
          <ListaFacturas facturas={facturas} moneda={m} ocupado={bajando} onDescargar={(f) => void bajar(f)}
            accion={(f) => (f.anulada_en ? null : <Button size="sm" variant="ghost" onClick={() => setDlg({ t: 'anular-factura', factura: f })}><Ban />Anular</Button>)} />
        </Seccion>
      </div>
      {contrato.sin_programar !== 0 && pagos.length > 0 && <Alert className="mt-8" variant="info">Falta repartir {monto(contrato.sin_programar, m)} del contrato en cuotas.</Alert>}

      {dlg?.t === 'editar-contrato' && <DialogoContrato proyectoId={proyectoId} contrato={dlg.contrato} tieneMovimientos={movimientos} onCerrar={cerrar} onHecho={hecho} />}
      {dlg?.t === 'cuota' && <DialogoCuota contrato={contrato} hitos={hitos} pago={dlg.pago} onCerrar={cerrar} onHecho={hecho} />}
      {dlg?.t === 'quitar-cuota' && <DialogoQuitarCuota pago={dlg.pago} onCerrar={cerrar} onHecho={hecho} />}
      {dlg?.t === 'abono' && <DialogoAbono contrato={contrato} pagos={pagos} onCerrar={cerrar} onHecho={hecho} />}
      {dlg?.t === 'anular-abono' && (
        <DialogoAnular titulo="Anular abono" descripcion={`${monto(dlg.abono.valor, m)} del ${fecha(dlg.abono.fecha_pago)}. El saldo se recalcula. El abono no se borra: queda tachado con tu motivo.`} boton="Anular abono" aviso="Abono anulado. El saldo se recalculó."
          ejecutar={(motivo) => anularAbono(crearClienteNavegador(), dlg.abono.id, motivo)} onCerrar={cerrar} onHecho={hecho} />
      )}
      {dlg?.t === 'factura' && <DialogoFactura contrato={contrato} pagos={pagos} onCerrar={cerrar} onHecho={hecho} />}
      {dlg?.t === 'anular-factura' && (
        <DialogoAnular titulo="Anular factura" descripcion={`Factura ${dlg.factura.numero}. No se borra: queda anulada con tu motivo y el cliente lo lee.`} boton="Anular factura" aviso="Factura anulada."
          ejecutar={(motivo) => anularFactura(crearClienteNavegador(), dlg.factura.id, motivo)} onCerrar={cerrar} onHecho={hecho} />
      )}
    </>
  );
}
