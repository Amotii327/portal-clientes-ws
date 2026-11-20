'use client';
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Seccion } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { ingresosPorCliente, ingresosPorMes, ingresosPorMesYCliente } from '@/lib/portal/acciones-dinero';
import { fecha } from '@/lib/utils';
import type { IngresoPorCliente, IngresoPorMes, IngresoPorMesYCliente, Moneda } from '@/lib/supabase/tipos-dinero';
import { mesLargo, monto } from './formato';
import { useLectura } from './lectura';

interface Datos { mes: IngresoPorMes[]; cliente: IngresoPorCliente[]; mesCliente: IngresoPorMesYCliente[] }

async function leer() {
  const c = crearClienteNavegador();
  const [a, b, d] = await Promise.all([ingresosPorMes(c), ingresosPorCliente(c), ingresosPorMesYCliente(c)]);
  const error = a.error ?? b.error ?? d.error;
  return { data: error ? null : ({ mes: a.data ?? [], cliente: b.data ?? [], mesCliente: d.data ?? [] } as Datos), error };
}

/** Una barra proporcional dentro de una misma moneda (solo es dibujo: no se suma nada). */
function Barra({ valor, maximo }: { valor: number; maximo: number }) {
  const pct = maximo > 0 ? Math.max(2, Math.round((valor / maximo) * 100)) : 0;
  return <div className="h-2 w-full min-w-16 rounded-full bg-surface-2" aria-hidden><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>;
}

/** Ingresos del super admin. Una sección por moneda: COP y USD nunca se mezclan ni se suman entre sí. */
export function Ingresos() {
  const { estado, datos, recargar } = useLectura<Datos>(leer, []);
  if (estado === 'cargando') return <EstadoCargando />;
  if (estado !== 'ok' || !datos) return <EstadoError onReintentar={() => recargar()} />;
  const monedas = Array.from(new Set<Moneda>([...datos.mes, ...datos.cliente, ...datos.mesCliente].map((r) => r.moneda))).sort();
  if (monedas.length === 0) return <EstadoVacio titulo="Aún no hay ingresos" texto="Cuando confirmes comprobantes o registres abonos, verás aquí los ingresos por mes y por cliente." />;
  return (
    <div className="space-y-10" data-testid="ingresos">
      {monedas.map((m) => {
        const meses = datos.mes.filter((x) => x.moneda === m);
        const clientes = datos.cliente.filter((x) => x.moneda === m);
        const detalle = datos.mesCliente.filter((x) => x.moneda === m);
        const maxMes = Math.max(0, ...meses.map((x) => x.total));
        const maxCli = Math.max(0, ...clientes.map((x) => x.total));
        return (
          <section key={m} aria-label={`Ingresos en ${m}`} data-moneda={m}>
            <h2 className="mb-1 text-display-md">Ingresos en {m === 'COP' ? 'pesos (COP)' : 'dólares (USD)'}</h2>
            <p className="mb-4 text-sm text-muted-foreground">Abonos vigentes según su fecha de pago. Solo abonos confirmados; los anulados no cuentan.</p>
            <div className="mb-6 grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Por mes</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm">
                    {meses.map((x) => (
                      <li key={x.mes} data-testid="ingreso-mes">
                        <div className="mb-1 flex flex-wrap justify-between gap-2"><span className="font-medium capitalize">{mesLargo(x.mes)}</span><span className="tabular-nums">{monto(x.total, m)} <span className="text-xs text-muted-foreground">· {x.abonos} {x.abonos === 1 ? 'abono' : 'abonos'}</span></span></div>
                        <Barra valor={x.total} maximo={maxMes} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Por cliente</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm">
                    {clientes.map((x) => (
                      <li key={x.empresa_id} data-testid="ingreso-cliente">
                        <div className="mb-1 flex flex-wrap justify-between gap-2"><span className="font-medium">{x.empresa_nombre}</span><span className="tabular-nums">{monto(x.total, m)} <span className="text-xs text-muted-foreground">· último pago {fecha(x.ultimo_pago)}</span></span></div>
                        <Barra valor={x.total} maximo={maxCli} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
            <Seccion titulo="Por mes y por cliente" className="mb-0">
              <Table className="min-w-[32rem]">
                <THead><TR><TH>Mes</TH><TH>Cliente</TH><TH className="text-right">Abonos</TH><TH className="text-right">Total</TH></TR></THead>
                <TBody>
                  {detalle.map((x) => <TR key={x.mes + x.empresa_id}><TD className="capitalize">{mesLargo(x.mes)}</TD><TD>{x.empresa_nombre}</TD><TD className="text-right tabular-nums">{x.abonos}</TD><TD className="whitespace-nowrap text-right tabular-nums">{monto(x.total, m)}</TD></TR>)}
                </TBody>
              </Table>
            </Seccion>
          </section>
        );
      })}
    </div>
  );
}
