'use client';
import * as React from 'react';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { miMantenimientoActivo } from '@/lib/portal/acciones-mantenimiento';

/** ¿El mantenimiento de mi empresa está activo? Decide si el menú muestra el módulo. Mientras responde, no se muestra. */
export function useMantenimientoActivo(habilitado: boolean): boolean {
  const [v, setV] = React.useState(false);
  React.useEffect(() => {
    if (!habilitado) return;
    let vivo = true;
    miMantenimientoActivo(crearClienteNavegador()).then((r) => { if (vivo) setV(r.data === true); }).catch(() => {});
    return () => { vivo = false; };
  }, [habilitado]);
  return habilitado && v;
}
