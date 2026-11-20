'use client';
import * as React from 'react';
import type { MiContexto } from '@/lib/supabase/database.types';

const Ctx = React.createContext<MiContexto | null>(null);
export const ProveedorContexto = Ctx.Provider;

/** Contexto de la persona que entró (lo que respondió mi_contexto() en el servidor). Solo dentro de la zona privada. */
export function usePortal(): MiContexto {
  const c = React.useContext(Ctx);
  if (!c) throw new Error('usePortal solo se usa dentro de la zona privada');
  return c;
}
