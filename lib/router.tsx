'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Dos enrutadores con la misma interfaz (useRuta, ir, Enlace, coincide):
 * - Prototipo exportable: rutas por "#" (ejemplo: index.html#/cliente/dinero), así funciona desde cualquier
 *   carpeta e incluso abriendo index.html directo, sin servidor.
 * - App real (NEXT_PUBLIC_MODO=servidor): rutas normales de Next (/cliente/dinero).
 * El modo se fija al compilar (next.config.mjs), por eso las dos ramas no se mezclan nunca.
 */
export const MODO_REAL = process.env.NEXT_PUBLIC_MODO === 'servidor';

function leerRutaHash(): string {
  if (typeof window === 'undefined') return '/';
  const h = window.location.hash.replace(/^#/, '');
  const [path] = h.split('?');
  return path && path !== '' ? path : '/';
}

function useRutaHash() {
  const [ruta, setRuta] = React.useState<string>('/');
  React.useEffect(() => {
    const on = () => {
      setRuta(leerRutaHash());
      window.scrollTo(0, 0);
    };
    setRuta(leerRutaHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return ruta;
}

function useRutaReal() {
  return usePathname() || '/';
}

export const useRuta: () => string = MODO_REAL ? useRutaReal : useRutaHash;

/** Puente para poder navegar con `ir()` (fuera de un componente) usando el enrutador de Next sin recargar. */
let navegarReal: ((path: string) => void) | null = null;

export function PuenteDeRutas() {
  const router = useRouter();
  React.useEffect(() => {
    navegarReal = (p) => router.push(p);
    return () => { navegarReal = null; };
  }, [router]);
  return null;
}

export function ir(path: string) {
  if (typeof window === 'undefined') return;
  if (MODO_REAL) {
    if (navegarReal) navegarReal(path);
    else window.location.assign(path);
  } else window.location.hash = path;
}

export function Enlace({ to, children, ...rest }: { to: string } & Omit<React.ComponentProps<'a'>, 'href'>) {
  if (MODO_REAL) {
    return (
      <Link href={to} {...rest}>
        {children}
      </Link>
    );
  }
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
