'use client';
import * as React from 'react';

/**
 * Enrutador por "#" (ejemplo: index.html#/cliente/dinero).
 * Así el prototipo exportado funciona desde cualquier carpeta, incluso abriendo
 * el archivo index.html directo, sin servidor y sin rutas absolutas que se rompan.
 */
function leerRuta(): string {
  if (typeof window === 'undefined') return '/';
  const h = window.location.hash.replace(/^#/, '');
  const [path] = h.split('?');
  return path && path !== '' ? path : '/';
}

export function useRuta() {
  const [ruta, setRuta] = React.useState<string>('/');
  React.useEffect(() => {
    const on = () => {
      setRuta(leerRuta());
      window.scrollTo(0, 0);
    };
    setRuta(leerRuta());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return ruta;
}

export function ir(path: string) {
  if (typeof window !== 'undefined') window.location.hash = path;
}

export function Enlace({ to, children, ...rest }: { to: string } & Omit<React.ComponentProps<'a'>, 'href'>) {
  return (
    <a href={'#' + to} {...rest}>
      {children}
    </a>
  );
}

/** Compara una ruta con un patrón como "/cliente/tickets/:id". */
export function coincide(patron: string, ruta: string): Record<string, string> | null {
  const a = patron.split('/').filter(Boolean);
  const b = ruta.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
