'use client';
import * as React from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { activarMantenimiento, apagarMantenimiento } from '@/lib/portal/acciones-mantenimiento';
import { useStore } from '@/lib/store';
import type { Moneda, PlanBase } from '@/lib/supabase/tipos-tickets-mant';
import { Confirmar } from '../invitar';
import { ejecutar, hoyISO } from '../tickets/comunes';
import { PLAN_TXT } from './comunes';

/** Activar el mantenimiento de una empresa: plan base, inicio y cuota. El resto se afina en "Configurar". */
export function ActivarDialog({ abierto, empresaId, empresa, onCerrar, onHecho }: { abierto: boolean; empresaId: string; empresa: string; onCerrar: () => void; onHecho: () => void }) {
  const { avisar } = useStore();
  const [plan, setPlan] = React.useState<PlanBase>('basico');
  const [inicio, setInicio] = React.useState(hoyISO());
  const [cuota, setCuota] = React.useState('');
  const [moneda, setMoneda] = React.useState<Moneda>('COP');
  const [horas, setHoras] = React.useState('');
  const [motivo, setMotivo] = React.useState('');
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [trabajando, setTrabajando] = React.useState(false);
  const faltaCuota = !(Number(cuota) > 0);
  const activar = async () => {
    setIntento(true); setError(null);
    if (faltaCuota || !inicio || (plan === 'personalizado' && !(Number(horas.replace(',', '.')) > 0))) return;
    setTrabajando(true);
    const r = await ejecutar('activar_mantenimiento', () => activarMantenimiento(crearClienteNavegador(), { p_empresa_id: empresaId, p_plan_base: plan, p_parametros: { fecha_inicio: inicio, cuota_mensual: Number(cuota), moneda, ...(plan === 'personalizado' ? { horas_mes: Number(horas.replace(',', '.')) } : {}) }, p_motivo: motivo.trim() || null }), true);
    setTrabajando(false);
    if (!r.ok) { setError(r.mensaje); return; }
    avisar('Mantenimiento activado. Ahora ajusta los parámetros.'); onCerrar(); onHecho();
  };
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !trabajando && onCerrar()}>
      <DialogContent title={`Activar mantenimiento · ${empresa}`} description="Solo se activa a quien lo contrató. La cuota la escribes tú; el portal no inventa precios.">
        <div className="space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <Field label="Plan base" htmlFor="a-plan" hint="Es solo un punto de partida: luego puedes cambiar cada parámetro."><Select id="a-plan" value={plan} onChange={(e) => setPlan(e.target.value as PlanBase)}>{(Object.keys(PLAN_TXT) as PlanBase[]).map((p) => <option key={p} value={p}>{PLAN_TXT[p]}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha de inicio" htmlFor="a-ini" error={intento && !inicio ? 'Indica la fecha de inicio.' : undefined}><Input id="a-ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></Field>
            <Field label="Moneda" htmlFor="a-mon"><Select id="a-mon" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}><option>COP</option><option>USD</option></Select></Field>
          </div>
          <Field label="Cuota mensual" htmlFor="a-cuota" error={intento && faltaCuota ? 'Indica la cuota mensual.' : undefined}><Input id="a-cuota" inputMode="numeric" value={cuota} onChange={(e) => setCuota(e.target.value.replace(/\D/g, ''))} /></Field>
          {plan === 'personalizado' && <Field label="Horas incluidas al mes" htmlFor="a-horas" error={intento && !(Number(horas.replace(',', '.')) > 0) ? 'Indica las horas incluidas al mes.' : undefined}><Input id="a-horas" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} /></Field>}
          <Field label="Motivo (opcional)" htmlFor="a-mot"><Input id="a-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ejemplo: contrató el plan en la propuesta" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</Button><Button onClick={() => void activar()} disabled={trabajando}>{trabajando ? 'Un momento…' : 'Activar'}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

/** Apagar el mantenimiento: pide el motivo (queda en el historial). */
export function ApagarDialog({ abierto, empresaId, empresa, onCerrar, onHecho }: { abierto: boolean; empresaId: string; empresa: string; onCerrar: () => void; onHecho: () => void }) {
  const { avisar } = useStore();
  const [motivo, setMotivo] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Confirmar abierto={abierto} titulo={`¿Apagar el mantenimiento de ${empresa}?`} texto="El cliente deja de ver el módulo. Sus tickets de error fuera de garantía se marcarán fuera de plan. Queda en el historial." boton="Sí, apagar" onCerrar={() => { setError(null); onCerrar(); }}
      onConfirmar={async () => {
        const r = await ejecutar('apagar_mantenimiento', () => apagarMantenimiento(crearClienteNavegador(), empresaId, motivo.trim()), true);
        if (!r.ok) { setError(r.mensaje); return; }
        avisar('Mantenimiento apagado.'); setMotivo(''); onCerrar(); onHecho();
      }}>
      {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
      <Field label="Motivo" htmlFor="ap-mot" hint="Mínimo 3 caracteres."><Input id="ap-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
    </Confirmar>
  );
}
