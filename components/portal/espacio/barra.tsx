'use client';
import * as React from 'react';
import { HardDrive } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { espacioDeEmpresa } from '@/lib/portal/acciones-espacio';
import { useCargar } from '@/lib/app/datos';
import type { EspacioDeEmpresa } from '@/lib/supabase/database.types';
import { tamanoEspacio } from './formato';

/** Barra de espacio usado. Avisa desde el 80 % y explica con claridad qué pasa al llegar al 100 %. */
export function BarraEspacio({ datos }: { datos: EspacioDeEmpresa }) {
  const lleno = datos.estado === 'lleno';
  const aviso = datos.estado === 'aviso';
  return (
    <Card className="mb-6 p-5" data-testid="espacio-cliente" data-estado={datos.estado}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium"><HardDrive className="size-4 text-primary-text" aria-hidden />Espacio de tu empresa</p>
        <p className="text-sm text-muted-foreground" data-testid="espacio-texto">{tamanoEspacio(datos.usado_bytes)} de {tamanoEspacio(datos.cupo_bytes)} · {Math.round(datos.porcentaje)} %</p>
      </div>
      <Progress className="mt-3" value={datos.porcentaje} tone={lleno ? 'danger' : aviso ? 'warning' : 'primary'} marker={80} label="Espacio usado por tu empresa" />
      {aviso && (
        <Alert className="mt-4" variant="warning" title="Ya usaste el 80 % de tu espacio" data-testid="espacio-aviso">
          Todavía puedes subir archivos. Para no quedarte sin espacio, borra lo que ya no necesites o <Enlace to="/cliente/tickets/nuevo" className="underline">pídenos ampliar el cupo</Enlace>.
        </Alert>
      )}
      {lleno && (
        <Alert className="mt-4" variant="danger" title="Tu espacio está lleno" data-testid="espacio-lleno">
          No puedes subir archivos nuevos hasta liberar espacio. Borra archivos que ya no necesites o <Enlace to="/cliente/tickets/nuevo" className="underline">escríbenos para ampliar el cupo</Enlace>. Lo que ya subiste sigue a salvo.
        </Alert>
      )}
    </Card>
  );
}

/** Solo la ve el administrador de la empresa (la base no responde a los demás): para el resto no muestra nada. */
export function EspacioDeMiEmpresa() {
  const { estado, datos } = useCargar(async () => {
    const { data, error } = await espacioDeEmpresa(crearClienteNavegador());
    if (error || !data) return null;
    return data;
  }, []);
  if (estado !== 'ok' || !datos) return null;
  return <BarraEspacio datos={datos} />;
}
