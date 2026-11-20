'use client';
import * as React from 'react';
import { Field, Select } from '@/components/ui/form';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { comprobantesPorRevisar } from '@/lib/portal/acciones-dinero';
import { PanelDineroProyecto } from './admin-proyecto';
import { BandejaComprobantes } from './bandeja';
import { Ingresos } from './ingresos';
import { useLectura } from './lectura';

type Pestana = 'comprobantes' | 'contratos' | 'ingresos';

async function leerProyectos() {
  const { data, error } = await crearClienteNavegador().from('v_proyectos_resumen').select('proyecto_id, empresa_id, empresa_nombre, nombre').order('empresa_nombre');
  return { data, error };
}

function ContratosYPagos() {
  const { estado, datos, recargar } = useLectura(leerProyectos, []);
  const [elegido, setElegido] = React.useState('');
  if (estado === 'cargando') return <EstadoCargando />;
  if (estado !== 'ok' || !datos) return <EstadoError onReintentar={() => recargar()} />;
  if (datos.length === 0) return <EstadoVacio titulo="Aún no hay proyectos" texto="Crea un proyecto para un cliente y luego podrás cargar su contrato y su plan de pagos." />;
  const proyectoId = elegido || datos[0].proyecto_id;
  const empresas = Array.from(new Set(datos.map((p) => p.empresa_nombre)));
  return (
    <>
      <Field label="Cliente y proyecto" htmlFor="fin-proyecto" className="mb-6 max-w-md">
        <Select id="fin-proyecto" value={proyectoId} onChange={(e) => setElegido(e.target.value)}>
          {empresas.map((n) => <optgroup key={n} label={n}>{datos.filter((p) => p.empresa_nombre === n).map((p) => <option key={p.proyecto_id} value={p.proyecto_id}>{p.nombre}</option>)}</optgroup>)}
        </Select>
      </Field>
      <PanelDineroProyecto key={proyectoId} proyectoId={proyectoId} />
    </>
  );
}

/** Finanzas del super admin: comprobantes por confirmar, contratos y plan de pagos por proyecto, e ingresos. */
export function FinanzasAdmin() {
  const [pestana, setPestana] = React.useState<Pestana>('comprobantes');
  const bandeja = useLectura(() => comprobantesPorRevisar(crearClienteNavegador()), []);
  const pendientes = bandeja.datos?.length ?? 0;
  return (
    <>
      <PageHeader titulo="Finanzas" descripcion="Contratos, plan de pagos, abonos, facturas e ingresos. Las facturas salen a nombre de Amotii." />
      <Tabs className="mb-6" value={pestana} onChange={setPestana} items={[
        { id: 'comprobantes', label: 'Comprobantes', count: bandeja.estado === 'ok' ? pendientes : undefined },
        { id: 'contratos', label: 'Contratos y pagos' },
        { id: 'ingresos', label: 'Ingresos' },
      ]} />
      {pestana === 'comprobantes' && (
        bandeja.estado === 'cargando' ? <EstadoCargando />
          : bandeja.estado !== 'ok' ? <EstadoError onReintentar={() => bandeja.recargar()} />
          : <BandejaComprobantes lista={bandeja.datos ?? []} onCambio={() => bandeja.recargar(true)} />
      )}
      {pestana === 'contratos' && <ContratosYPagos />}
      {pestana === 'ingresos' && <Ingresos />}
    </>
  );
}
