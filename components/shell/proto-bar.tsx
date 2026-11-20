'use client';
import * as React from 'react';
import { Settings2, X } from 'lucide-react';
import { Select } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/form';
import { useStore, type EstadoPantalla } from '@/lib/store';
import { ir, useRuta } from '@/lib/router';
import type { Rol } from '@/lib/data';

/** Barra del prototipo: NO es parte del producto. Sirve para cambiar de rol y ver los estados especiales. */
export function ProtoBar() {
  const s = useStore();
  const ruta = useRuta();
  const [abierto, setAbierto] = React.useState(false);

  const cambiarRol = (r: Rol) => {
    s.setRol(r);
    s.setVerComo(false);
    if (r === 'super' && (ruta.startsWith('/cliente') || ruta === '/')) { if (ruta !== '/') ir('/admin/panel'); }
    if (r !== 'super' && ruta.startsWith('/admin')) ir('/cliente/inicio');
  };
  const clientes = s.empresas;

  return (
    <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur" role="region" aria-label="Controles del prototipo">
      <div className="flex min-h-11 items-center gap-2 px-3 md:gap-3 md:px-6">
        <span className="hidden shrink-0 rounded-full border border-dashed border-warning/60 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-warning md:inline">Prototipo · datos de ejemplo</span>
        
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <label htmlFor="propuesta" className="hidden shrink-0 text-sm font-medium text-muted-foreground md:block">Propuesta:</label>
          <div className="w-[6.75rem] sm:w-40">
            <Select id="propuesta" value={s.tema} onChange={(e) => s.setTema(e.target.value as 'claro' | 'oscuro')} className="h-8 text-xs sm:text-sm" aria-label="Propuesta visual">
              <option value="claro">A Clara</option>
              <option value="oscuro">B Oscura</option>
            </Select>
          </div>
          <label htmlFor="ver-como" className="hidden shrink-0 text-sm font-medium text-muted-foreground md:block">Ver como:</label>
          <div className="w-[9.5rem] sm:w-52">
            <Select id="ver-como" value={s.rol} onChange={(e) => cambiarRol(e.target.value as Rol)} className="h-8 text-xs sm:text-sm" aria-label="Ver como">
              <option value="super">Super admin</option>
              <option value="admin">Admin del cliente</option>
              <option value="equipo">Equipo del cliente</option>
            </Select>
          </div>
          <button onClick={() => setAbierto((a) => !a)} className="flex h-8 shrink-0 items-center gap-1.5 rounded border border-border px-2.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-expanded={abierto} aria-controls="opciones-prototipo">
            {abierto ? <X className="size-4" /> : <Settings2 className="size-4" />}<span className="sr-only">Opciones</span>
          </button>
        </div>
      </div>
      {abierto && (
        <div id="opciones-prototipo" className="absolute right-2 top-12 w-[calc(100vw-1rem)] max-w-sm rounded-lg border border-border bg-surface p-4 shadow-card md:right-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opciones del prototipo</p>
          <div className="space-y-4">
            {s.rol !== 'super' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="proto-empresa">Empresa que se está viendo</Label>
                <Select id="proto-empresa" value={s.empresaId} onChange={(e) => s.setEmpresaId(e.target.value)}>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.estado === 'pausada' ? ' (pausada)' : ''}</option>)}
                </Select>
                <p className="text-xs text-muted-foreground">Websourcing tiene el mantenimiento apagado; Comercial Ejemplo lo tiene activo.</p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proto-estado">Estado de la pantalla</Label>
              <Select id="proto-estado" value={s.estadoPantalla} onChange={(e) => s.setEstadoPantalla(e.target.value as EstadoPantalla)}>
                <option value="normal">Normal (con datos)</option>
                <option value="vacio">Vacío</option>
                <option value="cargando">Cargando</option>
                <option value="error">Error</option>
              </Select>
            </div>
            {s.rol !== 'super' && (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="proto-pausa">Empresa pausada</Label>
                <Switch id="proto-pausa" checked={s.empresa.estado === 'pausada'} onCheckedChange={(v) => s.mutar(s.empresaId, (e) => { e.estado = v ? 'pausada' : 'activa'; })} />
              </div>
            )}
            <a href="#/" className="block text-sm text-primary-text underline-offset-4 hover:underline" onClick={() => setAbierto(false)}>Ir al índice del prototipo</a>
          </div>
        </div>
      )}
    </div>
  );
}
