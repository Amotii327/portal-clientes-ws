'use client';
import * as React from 'react';
import { Gauge } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EstadoCargando, EstadoError } from '@/components/ds/states';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { anotarConsumoSprint, consumoEquipo, fijarConsumoProyecto } from '@/lib/portal/acciones';
import { correr } from '@/lib/app/proyectos';
import { useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import type { ConsumoEquipo } from '@/lib/supabase/database.types';
import { fecha } from '@/lib/utils';

const txt = (v: number | null) => (v === null || v === undefined ? '' : String(v));
const num = (t: string): number | null | 'mal' => { if (t.trim() === '') return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= 10000 ? n : 'mal'; };
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 10) / 10} %`);

/**
 * Tarjeta INTERNA "Consumo del equipo" (solicitud de cambio 4). Solo se monta en el detalle de proyecto del super admin
 * y las funciones de la base responden "no_autorizado" a cualquier otra persona: nunca va a la zona del cliente.
 * Todo en % de una semana de trabajo del equipo.
 */
export function ConsumoEquipoCard({ proyectoId }: { proyectoId: string }) {
  const { avisar } = useStore();
  const { estado, datos, recargar, setDatos } = useCargar(async () => {
    const { data, error } = await consumoEquipo(crearClienteNavegador(), proyectoId);
    if (error || !data) throw new Error('lectura_fallida');
    return data as ConsumoEquipo;
  }, [proyectoId]);
  const [f, setF] = React.useState({ estimado: '', tope: '' });
  const [filas, setFilas] = React.useState<Record<string, { est: string; real: string }>>({});
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (!datos) return;
    setF({ estimado: txt(datos.estimado_inicial_pct), tope: txt(datos.tope_pct) });
    setFilas(Object.fromEntries(datos.sprints.map((s) => [s.sprint_id, { est: txt(s.estimado_pct), real: txt(s.real_pct) }])));
  }, [datos]);

  const cab = (cuerpo: React.ReactNode) => (
    <Card data-testid="consumo-equipo">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-2"><Gauge className="size-5 text-primary-text" aria-hidden />Consumo del equipo<Badge variant="warning">Interno</Badge></CardTitle><p className="text-sm text-muted-foreground">En % de una semana de trabajo del equipo. Solo lo ves tú.</p></CardHeader>
      <CardContent>{cuerpo}</CardContent>
    </Card>
  );
  if (estado === 'cargando') return cab(<EstadoCargando />);
  if (estado === 'error' || !datos) return cab(<EstadoError onReintentar={() => recargar()} />);

  const guardarProyecto = async () => {
    const e = num(f.estimado); const t = num(f.tope);
    if (e === 'mal' || t === 'mal') { setError('Escribe números entre 0 y 10.000.'); return; }
    setError('');
    const r = await correr('fijar_consumo_proyecto', fijarConsumoProyecto(crearClienteNavegador(), { p_proyecto_id: proyectoId, p_estimado_inicial_pct: e, p_tope_pct: t }));
    if (r.error) setError(r.mensaje); else { setDatos(r.data as ConsumoEquipo); avisar('Consumo del proyecto guardado.'); }
  };
  const guardarSprint = async (id: string) => {
    const fila = filas[id]; const e = num(fila.est); const r0 = num(fila.real);
    if (e === 'mal' || r0 === 'mal') { setError('Escribe números entre 0 y 10.000.'); return; }
    setError('');
    const r = await correr('anotar_consumo_sprint', anotarConsumoSprint(crearClienteNavegador(), { p_sprint_id: id, p_estimado_pct: e, p_real_pct: r0 }));
    if (r.error) setError(r.mensaje); else { setDatos(r.data as ConsumoEquipo); avisar('Consumo del sprint guardado.'); }
  };
  const p = datos.porcentaje_del_tope;
  return cab(
    <div className="space-y-5">
      {datos.aviso_80_en && <Alert variant="warning" title="Llegaste al 80 % del tope" data-testid="aviso-consumo-80">El consumo real ya pasó el 80 % del tope del proyecto (aviso del {fecha(datos.aviso_80_en)}). Conviene hablarlo antes de seguir.</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div><p className="text-sm text-muted-foreground">Real anotado</p><p className="font-display text-2xl font-semibold" data-testid="consumo-real">{pct(datos.real_total_pct)}</p></div>
        <div><p className="text-sm text-muted-foreground">Estimado por sprints</p><p className="font-display text-2xl font-semibold">{pct(datos.estimado_sprints_pct)}</p></div>
        <div><p className="text-sm text-muted-foreground">Del tope</p><p className="font-display text-2xl font-semibold" data-testid="consumo-del-tope">{p === null ? '—' : `${p} %`}</p></div>
      </div>
      {p !== null && <Progress value={p} tone={p >= 100 ? 'danger' : p >= 80 ? 'warning' : 'primary'} marker={80} label="Consumo real frente al tope" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Estimado al iniciar (% de una semana)" htmlFor="c-est"><Input id="c-est" type="number" min={0} max={10000} step="any" inputMode="decimal" value={f.estimado} onChange={(e) => setF({ ...f, estimado: e.target.value })} /></Field>
        <Field label="Tope del proyecto (% de una semana)" htmlFor="c-tope" hint="Se avisa al llegar al 80 %."><Input id="c-tope" type="number" min={0} max={10000} step="any" inputMode="decimal" value={f.tope} onChange={(e) => setF({ ...f, tope: e.target.value })} /></Field>
      </div>
      <div><Button size="sm" variant="secondary" onClick={() => void guardarProyecto()}>Guardar proyecto</Button></div>
      {datos.sprints.length > 0 && (
        <Table className="min-w-[34rem]">
          <THead><TR><TH>Sprint</TH><TH>Estimado %</TH><TH>Real %</TH><TH><span className="sr-only">Guardar</span></TH></TR></THead>
          <TBody>
            {datos.sprints.map((s) => (
              <TR key={s.sprint_id} data-testid="consumo-sprint">
                <TD className="font-medium">{s.numero}. {s.nombre}</TD>
                <TD><Input aria-label={`Estimado del sprint ${s.numero}`} className="w-24" type="number" min={0} step="any" value={filas[s.sprint_id]?.est ?? ''} onChange={(e) => setFilas({ ...filas, [s.sprint_id]: { ...filas[s.sprint_id], est: e.target.value } })} /></TD>
                <TD><Input aria-label={`Real del sprint ${s.numero}`} className="w-24" type="number" min={0} step="any" value={filas[s.sprint_id]?.real ?? ''} onChange={(e) => setFilas({ ...filas, [s.sprint_id]: { ...filas[s.sprint_id], real: e.target.value } })} /></TD>
                <TD className="text-right"><Button size="sm" variant="outline" aria-label={`Guardar el sprint ${s.numero}`} onClick={() => void guardarSprint(s.sprint_id)}>Guardar</Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>,
  );
}
