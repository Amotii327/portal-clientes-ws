'use client';
import * as React from 'react';
import { Download, FileUp, Receipt, Upload } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PagoBadge } from '@/components/ds/badges';
import { EjemploChip, PageHeader, Seccion, Stat } from '@/components/ds/page';
import { Pantalla, SinPermiso } from '@/components/ds/states';
import { useStore } from '@/lib/store';
import type { Pago } from '@/lib/data';
import { cop, fecha, pesos } from '@/lib/utils';

export function Dinero() {
  const { empresa, can, mutar, avisar, usuario } = useStore();
  const [sube, setSube] = React.useState<Pago | null>(null);
  const [archivo, setArchivo] = React.useState('');
  const [intento, setIntento] = React.useState(false);
  const [fact, setFact] = React.useState({ razon: empresa.razonSocial, nit: empresa.nit, correo: empresa.correoFacturas });
  React.useEffect(() => setFact({ razon: empresa.razonSocial, nit: empresa.nit, correo: empresa.correoFacturas }), [empresa.id, empresa.razonSocial, empresa.nit, empresa.correoFacturas]);
  if (!can.verDinero) return <><PageHeader titulo="Dinero" /><SinPermiso texto="Tu administrador no te dio permiso para ver contratos, pagos y facturas. Si lo necesitas, pídeselo." /></>;

  const total = empresa.contratos.reduce((s, c) => s + c.valor, 0);
  const pagosContrato = empresa.pagos.filter((p) => p.origen === 'contrato');
  const abonosContrato = empresa.abonos.filter((a) => pagosContrato.some((p) => p.id === a.pagoId));
  const pagado = abonosContrato.reduce((s, a) => s + a.valor, 0);
  const vencido = empresa.pagos.filter((p) => p.estado === 'vencido').reduce((s, p) => s + p.valor, 0);
  const proximo = empresa.pagos.filter((p) => p.estado === 'proximo' || p.estado === 'en_revision' || p.estado === 'vencido').sort((a, b) => a.vence.localeCompare(b.vence))[0];
  const puedeSubir = can.subirArchivos && can.verDinero && !can.soloLectura;

  const enviar = () => {
    if (!sube) return;
    if (!archivo) { setIntento(true); return; }
    mutar(empresa.id, (e) => {
      const p = e.pagos.find((x) => x.id === sube.id)!;
      p.estado = 'en_revision'; p.rechazo = undefined;
      e.comprobantes = e.comprobantes.filter((c) => c.pagoId !== p.id || c.estado !== 'rechazado');
      e.comprobantes.push({ id: 'c-' + Date.now(), pagoId: p.id, archivo, subidoPor: usuario?.cargo ?? 'Administrador', fecha: '2026-11-20', estado: 'en_revision' });
    }, `Subió un comprobante de pago (${sube.concepto})`);
    avisar('Comprobante enviado. El pago queda "en revisión" hasta que Websourcing lo confirme.');
    setSube(null); setArchivo(''); setIntento(false);
  };

  return (
    <>
      <PageHeader titulo="Dinero" descripcion="Tu contrato, tu plan de pagos, lo que has abonado y tus facturas." acciones={<EjemploChip />} />
      <Pantalla vacio={{ titulo: 'Aún no hay un contrato cargado', texto: 'Cuando Websourcing registre tu contrato y su plan de pagos, lo verás aquí.' }}>
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat etiqueta="Valor del contrato" valor={cop(total).replace(' COP', '')} nota="COP · IVA según factura" />
          <Stat etiqueta="Abonado" valor={cop(pagado).replace(' COP', '')} tono="success" nota={`${abonosContrato.length} abono(s) registrados`} />
          <Stat etiqueta="Saldo" valor={cop(total - pagado).replace(' COP', '')} nota="Se recalcula con cada abono" />
          <Stat etiqueta={vencido ? 'Pago vencido' : 'Próximo pago'} valor={vencido ? cop(vencido).replace(' COP', '') : proximo ? fecha(proximo.vence, true) : '—'} tono={vencido ? 'danger' : undefined} nota={proximo ? `${proximo.concepto} · vence ${fecha(proximo.vence)}` : 'Sin pagos próximos'} />
        </div>

        {empresa.pagos.some((p) => p.estado === 'vencido') && (
          <Alert variant="danger" className="mb-6" title="Tienes un pago vencido">Paga por transferencia y sube el comprobante aquí. Cuando Websourcing lo confirme, tu saldo baja. El pago en línea llegará en una próxima versión.</Alert>
        )}

        <Seccion titulo="Plan de pagos" descripcion="Cada pago está ligado a un hito de tu proyecto.">
          <ul className="space-y-3 md:hidden">
            {empresa.pagos.map((p) => (
              <li key={p.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3"><p className="font-medium">{p.concepto}</p><PagoBadge estado={p.estado} /></div>
                <p className="mt-1 text-xs text-muted-foreground">{p.hito ?? '—'}</p>
                <div className="mt-3 flex items-end justify-between gap-3"><p className="text-sm text-muted-foreground">Vence {fecha(p.vence)}</p><p className="font-display text-lg font-semibold tabular-nums">{pesos(p.valor)}</p></div>
                {p.rechazo && <p className="mt-2 text-xs text-danger">Comprobante rechazado: {p.rechazo}</p>}
                {(p.estado === 'proximo' || p.estado === 'vencido') && (puedeSubir ? <Button size="sm" className="mt-3 w-full" variant={p.estado === 'vencido' ? 'default' : 'secondary'} onClick={() => setSube(p)}><Upload />Subir comprobante</Button> : <p className="mt-3 text-xs text-muted-foreground">Sin permiso para subir comprobantes</p>)}
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
          <Table>
              <THead><TR><TH>Concepto</TH><TH>Hito</TH><TH>Vence</TH><TH className="text-right">Valor</TH><TH>Estado</TH><TH><span className="sr-only">Acción</span></TH></TR></THead>
              <TBody>
                {empresa.pagos.map((p) => {
                  const comp = empresa.comprobantes.find((c) => c.pagoId === p.id && c.estado === 'en_revision');
                  return (
                    <TR key={p.id}>
                      <TD className="font-medium">{p.concepto}{p.rechazo && <p className="mt-1 text-xs font-normal text-danger">Comprobante rechazado: {p.rechazo}</p>}</TD>
                      <TD className="text-muted-foreground">{p.hito ?? '—'}</TD>
                      <TD>{fecha(p.vence)}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">{cop(p.valor)}</TD>
                      <TD><PagoBadge estado={p.estado} /></TD>
                      <TD className="text-right">
                        {(p.estado === 'proximo' || p.estado === 'vencido') && (puedeSubir
                          ? <Button size="sm" variant={p.estado === 'vencido' ? 'default' : 'secondary'} onClick={() => setSube(p)}><Upload />Subir comprobante</Button>
                          : <span className="text-xs text-muted-foreground">Sin permiso para subir</span>)}
                        {comp && <span className="text-xs text-muted-foreground">{comp.archivo}</span>}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            </div>
        </Seccion>

        <div className="grid gap-8 lg:grid-cols-2">
          <Seccion titulo="Abonos registrados" className="mb-0">
            <Table className="min-w-0">
              <THead><TR><TH>Fecha</TH><TH>Medio</TH><TH className="text-right">Valor</TH></TR></THead>
              <TBody>
                {empresa.abonos.map((a) => <TR key={a.id}><TD>{fecha(a.fecha)}</TD><TD className="text-muted-foreground">{a.medio}</TD><TD className="whitespace-nowrap text-right tabular-nums">{pesos(a.valor)}</TD></TR>)}
                {empresa.abonos.length === 0 && <TR><TD colSpan={3} className="text-center text-muted-foreground">Aún no hay abonos.</TD></TR>}
              </TBody>
            </Table>
          </Seccion>
          <Seccion titulo="Facturas" descripcion="Las facturas salen a nombre de Amotii." className="mb-0">
            <Card><ul className="divide-y divide-border">
              {empresa.facturas.map((f) => (
                <li key={f.id} className="flex items-center gap-3 p-4">
                  <Receipt className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{f.numero}</p><p className="truncate text-xs text-muted-foreground">{f.concepto} · {fecha(f.fecha)} · {cop(f.valor)}</p></div>
                  <Button size="sm" variant="outline"><Download /><span className="hidden sm:inline">PDF</span><span className="sr-only sm:hidden">Descargar PDF</span></Button>
                </li>
              ))}
              {empresa.facturas.length === 0 && <li className="p-4 text-sm text-muted-foreground">Aún no hay facturas.</li>}
            </ul></Card>
          </Seccion>
        </div>

        <Card className="mt-10">
          <CardHeader><CardTitle>Datos de facturación</CardTitle><CardDescription>{can.esAdmin ? 'Puedes editarlos. Los usamos en las próximas facturas.' : 'Solo el administrador los edita.'}</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); mutar(empresa.id, (x) => { x.razonSocial = fact.razon; x.nit = fact.nit; x.correoFacturas = fact.correo; }, 'Editó los datos de facturación'); avisar('Datos de facturación guardados.'); }}>
              <Field label="Razón social" htmlFor="f-razon"><Input id="f-razon" value={fact.razon} disabled={!can.esAdmin || can.soloLectura} onChange={(e) => setFact({ ...fact, razon: e.target.value })} /></Field>
              <Field label="NIT" htmlFor="f-nit"><Input id="f-nit" value={fact.nit} disabled={!can.esAdmin || can.soloLectura} onChange={(e) => setFact({ ...fact, nit: e.target.value })} /></Field>
              <Field label="Correo para facturas" htmlFor="f-correo"><Input id="f-correo" type="email" value={fact.correo} disabled={!can.esAdmin || can.soloLectura} onChange={(e) => setFact({ ...fact, correo: e.target.value })} /></Field>
              {can.esAdmin && !can.soloLectura && <div className="md:col-span-3"><Button type="submit">Guardar datos</Button></div>}
            </form>
          </CardContent>
        </Card>
      </Pantalla>

      <Dialog open={!!sube} onOpenChange={(o) => { if (!o) { setSube(null); setArchivo(''); setIntento(false); } }}>
        {sube && (
          <DialogContent title="Subir comprobante de pago" description={`${sube.concepto} · ${cop(sube.valor)} · vence ${fecha(sube.vence)}`}>
            <div className="space-y-4">
              <Field label="Comprobante (PDF o imagen)" htmlFor="comp" hint="Máximo 50 MB." error={intento && !archivo ? 'Elige el archivo del comprobante.' : undefined}>
                <label className="flex h-12 cursor-pointer items-center gap-2 rounded border border-dashed border-border bg-surface-2 px-3 text-sm text-muted-foreground hover:text-foreground">
                  <FileUp className="size-4" />{archivo || 'Elegir archivo'}
                  <input id="comp" type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => setArchivo(e.target.files?.[0]?.name ?? '')} />
                </label>
              </Field>
              <Alert variant="info">El pago quedará <strong>en revisión</strong>. El abono se registra solo cuando Websourcing confirme el comprobante.</Alert>
              <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={enviar}>Enviar comprobante</Button></div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
