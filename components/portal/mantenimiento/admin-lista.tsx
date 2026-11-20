'use client';
import * as React from 'react';
import { Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { Enlace, ir } from '@/lib/router';
import { useCargar } from '@/lib/app/datos';
import { fecha } from '@/lib/utils';
import type { BolsaResumenFila, GarantiaFila, PlanMantenimientoFila } from '@/lib/supabase/tipos-tickets-mant';
import { horas, hoyISO } from '../tickets/comunes';
import { ActivarDialog, ApagarDialog } from './acciones-admin';
import { PLAN_TXT, desde, leer } from './comunes';

async function cargar() {
  const [empresas, planes, bolsas, garantias] = await Promise.all([
    leer<{ id: string; nombre: string; estado: string }>(desde('empresas').select('id, nombre, estado').order('nombre')),
    leer<PlanMantenimientoFila>(desde('planes_mantenimiento').select('*')),
    leer<BolsaResumenFila>(desde('bolsa_mensual_resumen').select('*').order('mes', { ascending: false })),
    leer<GarantiaFila>(desde('garantias').select('*').order('vence_en', { ascending: false })),
  ]);
  return { empresas, planes, bolsas, garantias };
}

export function MantenimientoListaReal() {
  const { estado, datos, recargar } = useCargar(cargar, []);
  const [activar, setActivar] = React.useState<{ id: string; nombre: string } | null>(null);
  const [apagar, setApagar] = React.useState<{ id: string; nombre: string } | null>(null);
  return (
    <>
      <PageHeader titulo="Mantenimiento por empresa" descripcion="Se activa solo a quien lo contrató. Cada empresa tiene su bolsa de horas, sus tiempos y su cuota." />
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => recargar()} />}
      {estado === 'ok' && datos && (datos.empresas.length === 0
        ? <EstadoVacio titulo="Ninguna empresa todavía" texto="Crea una empresa para poder activar su mantenimiento." />
        : (
          <ul className="grid gap-4 md:grid-cols-2" aria-label="Empresas">
            {datos.empresas.map((e) => {
              const plan = datos.planes.find((p) => p.empresa_id === e.id);
              const activo = !!plan?.activo;
              const bolsa = datos.bolsas.find((b) => b.empresa_id === e.id);
              const pct = bolsa ? Number(bolsa.porcentaje_usado) : 0;
              const gar = datos.garantias.find((g) => g.empresa_id === e.id);
              const garVigente = gar && gar.vence_en >= hoyISO();
              return (
                <li key={e.id} data-testid="empresa-mant" data-empresa={e.nombre}>
                  <Card className="h-full p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-display text-lg font-semibold">{e.nombre}</p>
                        <p className="text-sm text-muted-foreground">{activo ? `Plan ${PLAN_TXT[plan!.plan_base]} · desde ${fecha(plan!.fecha_inicio)}` : 'Apagado: el cliente no ve el módulo ni el hito 13.'}</p>
                      </div>
                      <Badge variant={activo ? 'success' : 'neutral'}>{activo ? 'Activo' : 'Apagado'}</Badge>
                    </div>
                    {activo && bolsa && (
                      <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Horas del mes</span><span>{horas(Number(bolsa.horas_usadas))} de {horas(Number(bolsa.horas_incluidas) + Number(bolsa.horas_arrastradas))}</span></div><Progress value={pct} tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'primary'} marker={80} label="Horas usadas" /></div>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">{gar ? `Garantía ${garVigente ? 'vigente hasta' : 'terminó el'} ${fecha(gar.vence_en)}` : 'Sin garantía registrada'}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" asChild><Enlace to={`/admin/mantenimiento/${e.id}`}><Settings />Configurar</Enlace></Button>
                      {activo
                        ? <Button size="sm" variant="outline" onClick={() => setApagar(e)}>Apagar</Button>
                        : <Button size="sm" onClick={() => setActivar(e)} disabled={e.estado !== 'activa'}>Activar</Button>}
                      {activo && pct >= 80 && <Badge variant="warning">{pct >= 100 ? 'Bolsa agotada' : '80 % de la bolsa'}</Badge>}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        ))}
      {activar && <ActivarDialog abierto empresaId={activar.id} empresa={activar.nombre} onCerrar={() => setActivar(null)} onHecho={() => { const id = activar.id; recargar(true); ir(`/admin/mantenimiento/${id}`); }} />}
      {apagar && <ApagarDialog abierto empresaId={apagar.id} empresa={apagar.nombre} onCerrar={() => setApagar(null)} onHecho={() => recargar(true)} />}
    </>
  );
}
