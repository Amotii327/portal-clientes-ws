'use client';
import * as React from 'react';
import { Download, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Stat } from '@/components/ds/page';
import { fecha } from '@/lib/utils';
import type { AbonoDinero, ContratoConSaldo, FacturaDinero, PagoProgramado } from '@/lib/supabase/tipos-dinero';
import { etiquetaMedio, monto } from './formato';
import { EstadoCuotaBadge } from './insignias';

export const nombreHito = (p: PagoProgramado) => (p.hito_numero != null ? `Hito ${p.hito_numero}${p.hito_nombre ? ` · ${p.hito_nombre}` : ''}` : p.hito_nombre ?? '—');

/** Cifras del contrato. Todas vienen calculadas por la base: aquí no se suma nada. */
export function TarjetasContrato({ contrato, pagos, abonos, admin }: { contrato: ContratoConSaldo; pagos: PagoProgramado[]; abonos: AbonoDinero[]; admin?: boolean }) {
  const m = contrato.moneda;
  const vigentes = abonos.filter((a) => !a.anulado_en).length;
  const vencido = contrato.pagos_vencidos > 0;
  const proxima = contrato.proximo_vence ? pagos.find((p) => p.vence_el === contrato.proximo_vence && p.estado !== 'pagado') : undefined;
  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="tarjetas-contrato">
      <Stat etiqueta="Valor del contrato" valor={<span data-testid="valor-contrato">{monto(contrato.valor, m)}</span>} nota={`${m}${contrato.anticipo ? ` · Anticipo acordado ${monto(contrato.anticipo, m)}` : ''}`} />
      <Stat etiqueta="Abonado" tono="success" valor={<span data-testid="valor-abonado">{monto(contrato.abonado, m)}</span>} nota={`${vigentes} ${vigentes === 1 ? 'abono registrado' : 'abonos registrados'}`} />
      <Stat etiqueta="Saldo" valor={<span data-testid="valor-saldo">{monto(contrato.saldo, m)}</span>} nota={admin && contrato.sin_programar ? `Sin repartir en cuotas: ${monto(contrato.sin_programar, m)}` : 'Se recalcula con cada abono confirmado'} />
      {vencido
        ? <Stat etiqueta="Pago vencido" tono="danger" valor={<span data-testid="valor-vencido">{monto(contrato.monto_vencido, m)}</span>} nota={`${contrato.pagos_vencidos} ${contrato.pagos_vencidos === 1 ? 'cuota vencida' : 'cuotas vencidas'}`} />
        : <Stat etiqueta="Próximo pago" valor={contrato.proximo_vence ? fecha(contrato.proximo_vence, true) : '—'} nota={proxima ? `${proxima.concepto} · vence ${fecha(proxima.vence_el)}` : 'Sin pagos próximos'} />}
    </div>
  );
}

/** Plan de pagos: tabla en pantalla grande y tarjetas en celular. `detalle` y `accion` pintan lo propio de cada rol. */
export function PlanDePagos({ pagos, moneda, accion, detalle, vacio }: {
  pagos: PagoProgramado[]; moneda: ContratoConSaldo['moneda'];
  accion?: (p: PagoProgramado) => React.ReactNode; detalle?: (p: PagoProgramado) => React.ReactNode; vacio?: string;
}) {
  if (pagos.length === 0) return <Card className="p-6 text-sm text-muted-foreground" data-testid="plan-vacio">{vacio ?? 'Aún no hay cuotas en el plan de pagos.'}</Card>;
  return (
    <>
      <ul className="space-y-3 md:hidden" data-testid="plan-tarjetas">
        {pagos.map((p) => (
          <li key={p.pago_id} className="rounded-lg border border-border bg-surface p-4" data-testid="cuota">
            <div className="flex items-start justify-between gap-3"><p className="font-medium">{p.concepto}</p><EstadoCuotaBadge estado={p.estado} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{nombreHito(p)}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-sm text-muted-foreground">Vence {fecha(p.vence_el)}</p>
              <p className="font-display text-lg font-semibold tabular-nums">{monto(p.valor, moneda)}</p>
            </div>
            {p.estado !== 'pagado' && p.abonado ? <p className="mt-1 text-xs text-muted-foreground">Abonado {monto(p.abonado, moneda)} · Falta {monto(p.pendiente, moneda)}</p> : null}
            {detalle?.(p)}
            {accion && <div className="mt-3 flex flex-wrap gap-2">{accion(p)}</div>}
          </li>
        ))}
      </ul>
      <div className="hidden md:block" data-testid="plan-tabla">
        <Table>
          <THead><TR><TH>Concepto</TH><TH>Hito</TH><TH>Vence</TH><TH className="text-right">Valor</TH><TH className="text-right">Pendiente</TH><TH>Estado</TH>{accion && <TH><span className="sr-only">Acciones</span></TH>}</TR></THead>
          <TBody>
            {pagos.map((p) => (
              <TR key={p.pago_id} data-testid="cuota">
                <TD className="font-medium">{p.concepto}{detalle?.(p)}</TD>
                <TD className="text-muted-foreground">{nombreHito(p)}</TD>
                <TD className="whitespace-nowrap">{fecha(p.vence_el)}</TD>
                <TD className="whitespace-nowrap text-right tabular-nums">{monto(p.valor, moneda)}</TD>
                <TD className="whitespace-nowrap text-right tabular-nums">{monto(p.pendiente, moneda)}</TD>
                <TD><EstadoCuotaBadge estado={p.estado} /></TD>
                {accion && <TD className="text-right"><div className="flex flex-wrap justify-end gap-2">{accion(p)}</div></TD>}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}

/** Abonos: los anulados se muestran tachados con su motivo (el cliente también lo lee). */
export function ListaAbonos({ abonos, pagos, moneda, accion }: { abonos: AbonoDinero[]; pagos: PagoProgramado[]; moneda: ContratoConSaldo['moneda']; accion?: (a: AbonoDinero) => React.ReactNode }) {
  const concepto = (id: string | null) => (id ? pagos.find((p) => p.pago_id === id)?.concepto ?? 'Cuota' : 'Contrato');
  if (abonos.length === 0) return <Card className="p-6 text-sm text-muted-foreground">Aún no hay abonos.</Card>;
  return (
    <>
    <ul className="space-y-3 md:hidden">
      {abonos.map((a) => (
        <li key={a.id} className="rounded-lg border border-border bg-surface p-4" data-testid="abono-tarjeta">
          <div className="flex items-start justify-between gap-3">
            <p className={`font-medium ${a.anulado_en ? 'text-muted-foreground line-through' : ''}`}>{concepto(a.pago_programado_id)}</p>
            <p className={`whitespace-nowrap font-display font-semibold tabular-nums ${a.anulado_en ? 'text-muted-foreground line-through' : ''}`}>{monto(a.valor, moneda)}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{fecha(a.fecha_pago)} · {etiquetaMedio(a.medio)}{a.referencia ? ` · Ref. ${a.referencia}` : ''}</p>
          {a.anulado_en && <p className="mt-1 text-xs text-danger">Anulado el {fecha(a.anulado_en)}: {a.anulado_motivo}</p>}
          {accion && <div className="mt-2">{accion(a)}</div>}
        </li>
      ))}
    </ul>
    <div className="hidden md:block">
    <Table className="min-w-0">
      <THead><TR><TH>Fecha</TH><TH>Aplicado a</TH><TH>Medio</TH><TH className="text-right">Valor</TH>{accion && <TH><span className="sr-only">Acciones</span></TH>}</TR></THead>
      <TBody>
        {abonos.map((a) => (
          <TR key={a.id} data-testid="abono" data-anulado={a.anulado_en ? 'si' : 'no'}>
            <TD className="whitespace-nowrap">{fecha(a.fecha_pago)}</TD>
            <TD><span className={a.anulado_en ? 'text-muted-foreground line-through' : ''}>{concepto(a.pago_programado_id)}</span>
              {a.referencia && <p className="text-xs text-muted-foreground">Ref. {a.referencia}</p>}
              {a.anulado_en && <p className="mt-1 text-xs text-danger">Anulado el {fecha(a.anulado_en)}: {a.anulado_motivo}</p>}
            </TD>
            <TD className="text-muted-foreground">{etiquetaMedio(a.medio)}</TD>
            <TD className={`whitespace-nowrap text-right tabular-nums ${a.anulado_en ? 'text-muted-foreground line-through' : ''}`}>{monto(a.valor, moneda)}</TD>
            {accion && <TD className="text-right">{accion(a)}</TD>}
          </TR>
        ))}
      </TBody>
    </Table>
    </div>
    </>
  );
}

/** Facturas (a nombre de Amotii). La descarga pide un enlace firmado; las anuladas no se descargan y muestran su motivo. */
export function ListaFacturas({ facturas, moneda, onDescargar, accion, ocupado }: {
  facturas: FacturaDinero[]; moneda: ContratoConSaldo['moneda']; onDescargar: (f: FacturaDinero) => void; accion?: (f: FacturaDinero) => React.ReactNode; ocupado?: string | null;
}) {
  if (facturas.length === 0) return <Card className="p-6 text-sm text-muted-foreground">Aún no hay facturas.</Card>;
  return (
    <Card><ul className="divide-y divide-border">
      {facturas.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-3 p-4" data-testid="factura" data-anulada={f.anulada_en ? 'si' : 'no'}>
          <Receipt className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-medium ${f.anulada_en ? 'text-muted-foreground line-through' : ''}`}>Factura {f.numero}</p>
            <p className="truncate text-xs text-muted-foreground">{fecha(f.fecha_emision)} · {monto(f.valor, moneda)}</p>
            {f.anulada_en && <p className="mt-1 text-xs text-danger">Anulada: {f.anulada_motivo}</p>}
          </div>
          {!f.anulada_en && (
            <Button size="sm" variant="outline" onClick={() => onDescargar(f)} disabled={ocupado === f.id} aria-label={`Descargar factura ${f.numero}`}>
              <Download /><span className="hidden sm:inline">PDF</span>
            </Button>
          )}
          {accion?.(f)}
        </li>
      ))}
    </ul></Card>
  );
}
