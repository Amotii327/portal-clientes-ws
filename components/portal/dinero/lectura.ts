'use client';
import * as React from 'react';

export type EstadoLectura = 'cargando' | 'ok' | 'error' | 'sin_permiso';

/**
 * Lectura de datos con estados cargando / ok / error / sin_permiso. `fn` debe devolver { data, error } como las funciones de
 * lib/portal. Un error `no_autorizado` es "sin permiso" (la base lo decide), no un fallo.
 */
export function useLectura<T>(fn: () => PromiseLike<{ data: T | null; error: { message?: string } | null }>, deps: React.DependencyList) {
  const [estado, setEstado] = React.useState<EstadoLectura>('cargando');
  const [datos, setDatos] = React.useState<T | null>(null);
  const [version, setVersion] = React.useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = React.useCallback(fn, deps);
  React.useEffect(() => {
    let vivo = true;
    Promise.resolve(f()).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { setEstado(error.message?.trim().startsWith('no_autorizado') ? 'sin_permiso' : 'error'); return; }
      setDatos(data); setEstado('ok');
    }).catch(() => { if (vivo) setEstado('error'); });
    return () => { vivo = false; };
  }, [f, version]);
  const recargar = React.useCallback((silencioso = false) => { if (!silencioso) setEstado('cargando'); setVersion((v) => v + 1); }, []);
  return { estado, datos, recargar };
}
