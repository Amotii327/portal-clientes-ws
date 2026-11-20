'use client';
import * as React from 'react';
import { Lock, UserCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/form';
import { useCargar } from '@/lib/app/datos';
import { EstadoCargando, EstadoError } from '@/components/ds/states';
import type { VisibilidadDocumento } from '@/lib/supabase/tipos-revisiones-docs';
import { leerEmpresas, type EmpresaMini } from './datos';

export function VisibilidadBadge({ v }: { v: VisibilidadDocumento }) {
  if (v === 'todo_el_equipo') return <Badge variant="neutral"><Users className="size-3.5" aria-hidden />Todo el equipo</Badge>;
  if (v === 'solo_admin') return <Badge variant="warning"><Lock className="size-3.5" aria-hidden />Solo administración</Badge>;
  return <Badge variant="info"><UserCheck className="size-3.5" aria-hidden />Personas elegidas</Badge>;
}

/** Elige la empresa con la que trabaja el super admin. Entrega la empresa elegida a `children`. */
export function ConEmpresa({ children, etiqueta = 'Empresa' }: { children: (e: EmpresaMini) => React.ReactNode; etiqueta?: string }) {
  const { estado, datos, recargar } = useCargar(leerEmpresas, []);
  const [id, setId] = React.useState('');
  if (estado === 'cargando') return <EstadoCargando />;
  if (estado === 'error' || !datos) return <EstadoError onReintentar={() => recargar()} />;
  const elegida = datos.find((e) => e.id === id) ?? datos[0];
  return (
    <>
      <div className="mb-6 max-w-sm">
        <label htmlFor="sel-empresa" className="mb-1.5 block text-sm font-medium">{etiqueta}</label>
        <Select id="sel-empresa" value={elegida?.id ?? ''} onChange={(e) => setId(e.target.value)}>
          {datos.map((e) => <option key={e.id} value={e.id}>{e.nombre}{e.estado === 'pausada' ? ' (en pausa)' : ''}</option>)}
        </Select>
      </div>
      {elegida ? <React.Fragment key={elegida.id}>{children(elegida)}</React.Fragment> : <p className="text-sm text-muted-foreground">Todavía no hay empresas.</p>}
    </>
  );
}
