'use client';
import * as React from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PagoBadge } from '@/components/ds/badges';
import { EjemploChip, PageHeader, Seccion, Stat } from '@/components/ds/page';
import { Pantalla } from '@/components/ds/states';
import { useStore } from '@/lib/store';
import { cop, fecha } from '@/lib/utils';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function Finanzas() {
  const s = useStore();
  const [rech, setRech] = React.useState<{ eid: string; cid: string } | null>(null);
  const [motivo, setMotivo] = React.useState('');
  const [fac, setFac] = React.useState(false);
  const abonos = s.empresas.flatMap((e) => e.abonos.map((a) => ({ e, a })));
  const mesActual = abonos.filter(({ a }) => a.fecha.startsWith('2026-11')).reduce((t, { a }) => t + a.valor, 0);
  const porCobrar = s.empresas.flatMap((e) => e.pagos.filter((p) => p.estado !== 'pagado')).reduce((t, p) => t + p.valor, 0);
  const vencido = s.empresas.flatMap((e) => e.pagos.filter((p) => p.estado === 'vencido')).reduce((t, p) => t + p.valor, 0);
  const meses = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((m) => ({ m, v: abonos.filter(({ a }) => a.fecha.startsWith(m)).reduce((t, { a }) => t + a.valor, 0) }));
  const max = Math.max(1, ...meses.map((x) => x.v));
  const revisar = s.empresas.flatMap((e) => e.comprobantes.filter((c) => c.estado === 'en_revision').map((c) => ({ e, c, p: e.pagos.find((p) => p.id === c.pagoId)! })));

  const confirmar = (eid: string, cid: string) => {
    s.mutar(eid, (e) => {
      const c = e.comprobantes.find((x) => x.id === cid)!; const p = e.pagos.find((x) => x.id === c.pagoId)!;
      c.estado = 'confirmado'; p.estado = 'pagado';
      e.abonos.push({ id: 'a-' + Date.now(), pagoId: p.id, valor: p.valor, fecha: '2026-11-20', medio: 'Transferencia' });
    }, 'Confirmó un comprobante y registró el abono');
    s.avisar('Comprobante confirmado. Se registró el abono y el saldo se recalculó.');
  };
  const rechazar = () => {
    if (!rech || motivo.trim().length < 5) return;
    s.mutar(rech.eid, (e) => {
      const c = e.comprobantes.find((x) => x.id === rech.cid)!; const p = e.pagos.find((x) => x.id === c.pagoId)!;
      c.estado = 'rechazado'; c.motivo = motivo; p.rechazo = motivo; p.estado = p.vence < '2026-11-20' ? 'vencido' : 'proximo';
    }, `Rechazó un comprobante (motivo: ${motivo})`);
    s.avisar('Comprobante rechazado. El cliente verá el motivo.');
    setRech(null); setMotivo('');
  };
  return (
    <>
      <PageHeader titulo="Finanzas" descripcion="Contratos, pagos, abonos, facturas e ingresos. Las facturas salen a nombre de Amotii." acciones={<><EjemploChip /><Button variant="secondary" onClick={() => setFac(true)}><Plus />Subir factura</Button></>} />
      <Pantalla vacio={{ titulo: 'Aún no hay movimientos', texto: 'Cuando registres contratos y abonos, verás aquí los ingresos.' }}>
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat etiqueta="Ingresos de noviembre" valor={cop(mesActual).replace(' COP', '')} tono="success" nota="COP · abonos confirmados" />
          <Stat etiqueta="Por cobrar" valor={cop(porCobrar).replace(' COP', '')} nota="Todos los clientes" />
          <Stat etiqueta="Vencido" valor={cop(vencido).replace(' COP', '')} tono={vencido ? 'danger' : undefined} nota="Pagos pasados de fecha" />
          <Stat etiqueta="Comprobantes por revisar" valor={revisar.length} tono={revisar.length ? 'warning' : undefined} nota="Esperan tu confirmación" />
        </div>
        <Seccion titulo="Comprobantes por confirmar" descripcion="El abono solo se registra cuando tú confirmas. Si rechazas, el cliente ve el motivo.">
          {revisar.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">No hay comprobantes pendientes.</Card> : (
            <Card><ul className="divide-y divide-border">{revisar.map(({ e, c, p }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="font-medium">{e.nombre} · {p.concepto}</p><p className="text-sm text-muted-foreground">{c.archivo} · {c.subidoPor} · {fecha(c.fecha)} · {cop(p.valor)}</p></div>
                <Button size="sm" onClick={() => confirmar(e.id, c.id)}><Check />Confirmar</Button>
                <Button size="sm" variant="destructive" onClick={() => setRech({ eid: e.id, cid: c.id })}><X />Rechazar</Button>
              </li>))}</ul></Card>
          )}
        </Seccion>
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Ingresos por mes</CardTitle></CardHeader>
            <CardContent>
              <div className="flex h-48 items-end gap-3" role="img" aria-label="Ingresos por mes, de junio a noviembre de 2026">
                {meses.map((x) => (
                  <div key={x.m} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <span className="text-[11px] tabular-nums text-muted-foreground">{x.v ? (x.v / 1e6).toFixed(1).replace('.', ',') + ' M' : '—'}</span>
                    <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(2, (x.v / max) * 100)}%`, opacity: x.v ? 1 : 0.25 }} />
                    <span className="text-xs text-muted-foreground">{MES[+x.m.slice(5) - 1]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Ingresos por cliente</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">{s.empresas.map((e) => { const t = e.abonos.reduce((x, a) => x + a.valor, 0); const c = e.contratos.reduce((x, k) => x + k.valor, 0); return <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="font-medium">{e.nombre}</span><span className="tabular-nums text-muted-foreground">{cop(t)} <span className="text-xs">de {cop(c)}</span></span></li>; })}</ul>
            </CardContent>
          </Card>
        </div>
        <Seccion titulo="Contratos y plan de pagos">
          <Table className="min-w-[48rem]">
            <THead><TR><TH>Cliente</TH><TH>Concepto</TH><TH>Vence</TH><TH className="text-right">Valor</TH><TH>Estado</TH><TH><span className="sr-only">Acción</span></TH></TR></THead>
            <TBody>
              {s.empresas.flatMap((e) => e.pagos.map((p) => ({ e, p }))).map(({ e, p }) => (
                <TR key={p.id}>
                  <TD className="font-medium">{e.nombre}</TD><TD>{p.concepto}</TD><TD>{fecha(p.vence)}</TD><TD className="whitespace-nowrap text-right tabular-nums">{cop(p.valor)}</TD><TD><PagoBadge estado={p.estado} /></TD>
                  <TD className="text-right">{p.estado !== 'pagado' && p.estado !== 'en_revision' && p.estado !== 'pendiente' && <Button size="sm" variant="outline" onClick={() => { s.mutar(e.id, (x) => { const y = x.pagos.find((z) => z.id === p.id)!; y.estado = 'pagado'; x.abonos.push({ id: 'a-' + Date.now(), pagoId: p.id, valor: p.valor, fecha: '2026-11-20', medio: 'Registro manual' }); }, `Registró un abono (${p.concepto})`); s.avisar('Abono registrado. El saldo se recalculó.'); }}>Registrar abono</Button>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Seccion>
      </Pantalla>
      <Dialog open={!!rech} onOpenChange={(o) => !o && setRech(null)}>
        <DialogContent title="Rechazar comprobante" description="El cliente verá este motivo.">
          <div className="space-y-4">
            <Field label="Motivo" htmlFor="rc-motivo"><Textarea id="rc-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ejemplo: el valor del comprobante no coincide con el pago." /></Field>
            <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button variant="destructive" disabled={motivo.trim().length < 5} onClick={rechazar}>Rechazar</Button></div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={fac} onOpenChange={setFac}>
        <DialogContent title="Subir factura" description="PDF ya hecho, a nombre de Amotii. El cliente podrá descargarla.">
          <div className="space-y-4">
            <Field label="Cliente" htmlFor="fa-c"><Select id="fa-c">{s.empresas.map((e) => <option key={e.id}>{e.nombre}</option>)}</Select></Field>
            <Field label="Número y concepto" htmlFor="fa-n"><Input id="fa-n" placeholder="Factura 0160 · Pago por sprints" /></Field>
            <Field label="Archivo PDF" htmlFor="fa-f"><Input id="fa-f" type="file" accept="application/pdf" /></Field>
            <Alert variant="info">Antes de subirla, se limpian los datos ocultos del archivo.</Alert>
            <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={() => { s.registrar('Subió una factura', 'Varios'); s.avisar('Factura subida.'); setFac(false); }}>Subir</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
