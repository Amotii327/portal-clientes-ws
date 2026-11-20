'use client';
import * as React from 'react';
import { FileText, Receipt, Upload } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { PageHeader, Seccion } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio, SinPermiso } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { useStore } from '@/lib/store';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { dineroDelProyecto } from '@/lib/portal/acciones-dinero';
import { fecha } from '@/lib/utils';
import type { ComprobanteDinero, DineroDelProyecto, PagoProgramado } from '@/lib/supabase/tipos-dinero';
import { usePortal } from '../contexto';
import { descargarArchivo, enviarArchivo } from './archivos';
import { DialogoFormulario, type Errores } from './dialogo';
import { AYUDA_MONTO, MAX_COMPROBANTE, TIPOS_COMPROBANTE, hoyColombia, monto, montoParaCampo, normalizarMonto } from './formato';
import { EstadoComprobanteBadge } from './insignias';
import { useLectura } from './lectura';
import { ListaAbonos, ListaFacturas, PlanDePagos, TarjetasContrato } from './secciones';

async function leerProyectos() {
  const { data, error } = await crearClienteNavegador().from('v_proyectos_resumen').select('proyecto_id, empresa_id, empresa_nombre, nombre').order('nombre');
  return { data, error };
}

/** Último comprobante de cada cuota (el más reciente por fecha de subida). */
function ultimoPorCuota(lista: ComprobanteDinero[]) {
  const m = new Map<string, ComprobanteDinero>();
  for (const c of lista) { const a = m.get(c.pago_programado_id); if (!a || c.creado_en > a.creado_en) m.set(c.pago_programado_id, c); }
  return m;
}

function SubirComprobante({ pago, moneda, onCerrar, onHecho }: { pago: PagoProgramado; moneda: PagoProgramado['moneda']; onCerrar: () => void; onHecho: () => void }) {
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [valor, setValor] = React.useState(montoParaCampo(pago.pendiente));
  const [fechaPago, setFechaPago] = React.useState(hoyColombia());
  const [nota, setNota] = React.useState('');
  const enviar = async (): Promise<string | Errores | null> => {
    const e: Errores = {};
    if (!archivo) e.archivo = 'Elige el archivo del comprobante.';
    else if (!(TIPOS_COMPROBANTE as readonly string[]).includes(archivo.type)) e.archivo = 'El archivo debe ser PDF o imagen (PNG, JPG o WEBP).';
    else if (archivo.size > MAX_COMPROBANTE) e.archivo = 'El archivo pesa más de 10 MB.';
    else if (archivo.size === 0) e.archivo = 'El archivo está vacío.';
    const v = normalizarMonto(valor, moneda);
    if (!v) e.valor = 'Escribe el valor que pagaste. ' + AYUDA_MONTO[moneda];
    if (!fechaPago) e.fecha = 'Elige la fecha en que hiciste el pago.';
    else if (fechaPago > hoyColombia()) e.fecha = 'La fecha del pago no puede ser futura.';
    if (Object.keys(e).length) return e;
    const fd = new FormData();
    fd.set('tipo', 'comprobante'); fd.set('pagoId', pago.pago_id); fd.set('valor', v!); fd.set('fechaPago', fechaPago); fd.set('nota', nota.trim()); fd.set('archivo', archivo!);
    const r = await enviarArchivo(fd);
    if (!r.ok) return r.mensaje;
    onHecho();
    return null;
  };
  return (
    <DialogoFormulario titulo="Subir comprobante de pago" descripcion={`${pago.concepto} · ${monto(pago.valor, moneda)} · vence ${fecha(pago.vence_el)}`} boton="Enviar comprobante" onCerrar={onCerrar} onEnviar={enviar}>
      {(e) => (
        <>
          <Field label="Comprobante (PDF o imagen)" htmlFor="comp-archivo" hint="PDF, PNG, JPG o WEBP. Máximo 10 MB." error={e.archivo}>
            <Input id="comp-archivo" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" className="h-auto py-2" aria-invalid={!!e.archivo} onChange={(ev) => setArchivo(ev.target.files?.[0] ?? null)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor pagado" htmlFor="comp-valor" hint={AYUDA_MONTO[moneda]} error={e.valor}>
              <Input id="comp-valor" inputMode="decimal" value={valor} aria-invalid={!!e.valor} onChange={(ev) => setValor(ev.target.value)} />
            </Field>
            <Field label="Fecha del pago" htmlFor="comp-fecha" error={e.fecha}>
              <Input id="comp-fecha" type="date" max={hoyColombia()} value={fechaPago} aria-invalid={!!e.fecha} onChange={(ev) => setFechaPago(ev.target.value)} />
            </Field>
          </div>
          <Field label="Nota (opcional)" htmlFor="comp-nota"><Textarea id="comp-nota" value={nota} maxLength={300} onChange={(ev) => setNota(ev.target.value)} className="min-h-16" /></Field>
          <Alert variant="info">El pago queda <strong>en revisión</strong>. El abono se registra y el saldo baja solo cuando el Equipo Websourcing confirme el comprobante.</Alert>
        </>
      )}
    </DialogoFormulario>
  );
}

function DineroDeProyecto({ proyectoId, puedeSubir }: { proyectoId: string; puedeSubir: boolean }) {
  const { avisar } = useStore();
  const { estado, datos, recargar } = useLectura<DineroDelProyecto>(() => dineroDelProyecto(crearClienteNavegador(), proyectoId), [proyectoId]);
  const [subir, setSubir] = React.useState<PagoProgramado | null>(null);
  const [bajando, setBajando] = React.useState<string | null>(null);
  const bajar = async (ruta: string, id: string, facturaId?: string) => {
    setBajando(id);
    const msg = await descargarArchivo(ruta, facturaId);
    setBajando(null);
    if (msg) avisar(msg);
  };

  if (estado === 'cargando') return <EstadoCargando />;
  if (estado === 'sin_permiso') return <SinPermiso texto="El administrador de tu empresa decide quién ve el dinero. Si lo necesitas, pídele que te dé acceso." />;
  if (estado === 'error' || !datos) return <EstadoError onReintentar={() => recargar()} />;
  const { contrato, pagos, abonos, facturas, comprobantes } = datos;
  if (!contrato) return <EstadoVacio titulo="Aún no hay contrato cargado" texto="Cuando el Equipo Websourcing registre tu contrato y su plan de pagos, lo verás aquí." />;
  const m = contrato.moneda;
  const ultimo = ultimoPorCuota(comprobantes);
  const historial = [...comprobantes].sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1));
  const concepto = (id: string) => pagos.find((p) => p.pago_id === id)?.concepto ?? 'Cuota';
  const puedeSubirCuota = (p: PagoProgramado) => p.estado !== 'pagado' && p.estado !== 'en_revision';

  return (
    <>
      <TarjetasContrato contrato={contrato} pagos={pagos} abonos={abonos} />
      {contrato.pagos_vencidos > 0 && (
        <Alert variant="danger" className="mb-6" title="Tienes un pago vencido">
          Paga por transferencia y sube aquí el comprobante. Cuando el Equipo Websourcing lo confirme, tu saldo baja. El pago en línea llegará en una próxima versión.
        </Alert>
      )}

      <Seccion titulo="Plan de pagos" descripcion="Cada cuota está atada a un hito de tu proyecto.">
        <PlanDePagos
          pagos={pagos} moneda={m}
          detalle={(p) => {
            const u = ultimo.get(p.pago_id);
            return u?.estado === 'rechazado' && p.estado !== 'pagado'
              ? <p className="mt-2 text-xs font-normal text-danger" data-testid="motivo-rechazo">Comprobante rechazado: {u.motivo_rechazo}. Puedes subir otro.</p>
              : null;
          }}
          accion={(p) => puedeSubirCuota(p)
            ? (puedeSubir
              ? <Button size="sm" variant={p.estado === 'vencido' ? 'default' : 'secondary'} onClick={() => setSubir(p)}><Upload />Subir comprobante</Button>
              : <span className="text-xs text-muted-foreground">Sin permiso para subir comprobantes</span>)
            : p.estado === 'en_revision' ? <span className="text-xs text-muted-foreground">Comprobante en revisión</span> : null}
        />
      </Seccion>

      <Seccion titulo="Mis comprobantes" descripcion="Lo que has enviado y cómo va su revisión.">
        {historial.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">Aún no has subido comprobantes.</Card> : (
          <Card><ul className="divide-y divide-border">
            {historial.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-4" data-testid="comprobante" data-estado={c.estado}>
                <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 basis-full sm:basis-60 sm:flex-1">
                  <p className="text-sm font-medium">{concepto(c.pago_programado_id)} · {monto(c.valor_declarado, m)}</p>
                  <p className="text-xs text-muted-foreground">Pago del {fecha(c.fecha_pago_declarada)} · enviado el {fecha(c.creado_en)} · {c.archivo_nombre}</p>
                  {c.estado === 'rechazado' && <p className="mt-1 text-xs text-danger">Motivo del rechazo: {c.motivo_rechazo}</p>}
                </div>
                <EstadoComprobanteBadge estado={c.estado} />
                <Button size="sm" variant="ghost" onClick={() => void bajar(c.archivo_path, c.id)} disabled={bajando === c.id} aria-label={`Descargar comprobante de ${concepto(c.pago_programado_id)}`}>Ver archivo</Button>
              </li>
            ))}
          </ul></Card>
        )}
      </Seccion>

      <div className="grid gap-8 lg:grid-cols-2">
        <Seccion titulo="Abonos registrados" className="mb-0"><ListaAbonos abonos={abonos} pagos={pagos} moneda={m} /></Seccion>
        <Seccion titulo="Facturas" descripcion="Las facturas salen a nombre de Amotii." className="mb-0">
          <ListaFacturas facturas={facturas} moneda={m} ocupado={bajando} onDescargar={(f) => void bajar(f.archivo_path, f.id, f.id)} />
        </Seccion>
      </div>

      {subir && <SubirComprobante pago={subir} moneda={m} onCerrar={() => setSubir(null)} onHecho={() => { avisar('Comprobante enviado. El pago queda "en revisión" hasta que lo confirmemos.'); recargar(true); }} />}
    </>
  );
}

/** Pantalla Dinero del cliente: contrato, plan de pagos, abonos, saldo, facturas y comprobantes. La base decide quién la ve. */
export function DineroCliente() {
  const ctx = usePortal();
  const esAdmin = ctx.rol === 'admin_cliente';
  const puede = esAdmin || !!ctx.permisos?.ver_dinero;
  const puedeSubir = ctx.estado !== 'ver_como' && (esAdmin || (!!ctx.permisos?.ver_dinero && !!ctx.permisos?.subir_archivos));
  const { estado, datos } = useLectura(leerProyectos, []);
  const [elegido, setElegido] = React.useState('');
  const proyectoId = elegido || datos?.[0]?.proyecto_id || '';
  const encabezado = (
    <PageHeader titulo="Dinero" descripcion="Tu contrato, tu plan de pagos, lo que has abonado y tus facturas."
      acciones={<Button variant="outline" asChild><Enlace to="/cliente/facturacion"><Receipt />Datos de facturación</Enlace></Button>} />
  );
  if (!puede) return <><PageHeader titulo="Dinero" /><SinPermiso texto="El administrador de tu empresa decide quién ve el dinero. Si lo necesitas, pídele que te dé acceso." /></>;
  return (
    <>
      {encabezado}
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => window.location.reload()} />}
      {estado === 'sin_permiso' && <SinPermiso />}
      {estado === 'ok' && (datos?.length ?? 0) === 0 && <EstadoVacio titulo="Aún no hay proyectos" texto="Cuando el Equipo Websourcing cree tu proyecto y su contrato, verás aquí el dinero." />}
      {estado === 'ok' && (datos?.length ?? 0) > 0 && (
        <>
          {datos!.length > 1 && (
            <Field label="Proyecto" htmlFor="dinero-proyecto" className="mb-6 max-w-sm">
              <Select id="dinero-proyecto" value={proyectoId} onChange={(e) => setElegido(e.target.value)}>
                {datos!.map((p) => <option key={p.proyecto_id} value={p.proyecto_id}>{p.nombre}</option>)}
              </Select>
            </Field>
          )}
          <DineroDeProyecto key={proyectoId} proyectoId={proyectoId} puedeSubir={puedeSubir} />
        </>
      )}
    </>
  );
}
