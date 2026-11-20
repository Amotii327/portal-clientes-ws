'use client';
import * as React from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError } from '@/components/ds/states';
import { useCargar } from '@/lib/app/datos';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { bandejaRevisiones } from '@/lib/portal/acciones-revisiones-docs';
import { Enlace } from '@/lib/router';
import type { ItemBandeja } from '@/lib/supabase/tipos-revisiones-docs';
import { leerEmpresas } from '../documentos/datos';
import { ETIQUETA_TIPO, EstadoBadge, fechaCo } from './comun';
import { NuevaRevisionDialogo } from './admin-nueva';

function Lista({ titulo, nota, vacio, items, id }: { titulo: string; nota: string; vacio: string; items: ItemBandeja[]; id: string }) {
  return (
    <section aria-label={titulo} className="min-w-0" data-lista={id}>
      <div className="mb-1 flex items-center justify-between gap-2"><h2 className="font-display text-lg font-semibold">{titulo}</h2><Badge>{items.length}</Badge></div>
      <p className="mb-3 text-xs text-muted-foreground">{nota}</p>
      <div className="space-y-3">
        {items.length === 0 && <Card className="p-5 text-sm text-muted-foreground">{vacio}</Card>}
        {items.map((i) => (
          <Card key={i.revision_id} className="p-4">
            <p className="text-xs text-muted-foreground">{i.empresa_nombre} · {i.proyecto_nombre}</p>
            <p className="mt-0.5 break-words font-medium">{i.titulo} <span className="text-muted-foreground">v{i.version}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{ETIQUETA_TIPO[i.tipo]} · {fechaCo(i.actualizado_en)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <EstadoBadge estado={i.estado} vistaWebsourcing />
              <Button size="sm" variant="secondary" asChild><Enlace to={`/admin/revisiones/${i.revision_id}`}>Abrir</Enlace></Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** Bandeja del super admin: las 4 listas, con filtro por cliente y botón para crear una revisión. */
export function BandejaAdmin() {
  const [empresa, setEmpresa] = React.useState('');
  const [nueva, setNueva] = React.useState(false);
  const empresas = useCargar(leerEmpresas, []);
  const { estado, datos, recargar } = useCargar(async () => {
    const r = await bandejaRevisiones(crearClienteNavegador(), empresa || undefined);
    if (r.error || !r.data) throw new Error('lectura_fallida');
    return r.data;
  }, [empresa]);
  return (
    <>
      <PageHeader titulo="Bandeja de aprobaciones" descripcion="Qué espera tu revisión, qué pidió cambiar cada cliente y qué ya aprobó. Tú no puedes aprobar por el cliente."
        acciones={<>
          <div className="w-56"><Select aria-label="Filtrar por cliente" value={empresa} onChange={(e) => setEmpresa(e.target.value)}><option value="">Todos los clientes</option>{(empresas.datos ?? []).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select></div>
          <Button onClick={() => setNueva(true)}><Plus />Nueva revisión</Button>
        </>} />
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => recargar()} />}
      {estado === 'ok' && datos && (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Lista id="esperando_a_websourcing" titulo="Esperando a Websourcing" nota="Borradores por publicar y revisiones reabiertas por rehacer." vacio="Nada por publicar." items={datos.esperando_a_websourcing} />
            <Lista id="cambios_pedidos" titulo="Cambios pedidos" nota="El cliente pidió ajustes. Quedan abiertos para ti." vacio="Ningún cambio pendiente." items={datos.cambios_pedidos} />
            <Lista id="aprobado" titulo="Aprobado" nota="Quedan registradas con quién, cuándo y qué versión." vacio="Aún no hay aprobaciones." items={datos.aprobado} />
          </div>
          <div className="mt-8"><Lista id="esperando_al_cliente" titulo="Publicadas, esperando al cliente" nota="Ya las puede ver el cliente." vacio="Ninguna." items={datos.esperando_al_cliente} /></div>
        </>
      )}
      <NuevaRevisionDialogo abierto={nueva} alCerrar={() => setNueva(false)} />
    </>
  );
}
