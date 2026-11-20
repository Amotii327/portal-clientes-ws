'use client';
import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Select } from '@/components/ui/form';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { iniciarVerComo, terminarVerComo } from '@/lib/portal/acciones';
import { mensajeDeError } from '@/lib/portal/errores';
import { useStore } from '@/lib/store';
import type { Rol } from '@/lib/supabase/database.types';

/** Franja fija de "ver como el cliente" (D-020). Solo aparece con una sesión abierta; todo lo de abajo es de solo lectura. */
export function FranjaVerComo() {
  const { real, avisar } = useStore();
  const v = real?.verComo;
  const [saliendo, setSaliendo] = React.useState(false);
  if (!v) return null;
  const salir = async () => {
    setSaliendo(true);
    const { error } = await terminarVerComo(crearClienteNavegador());
    // Si la sesión ya había vencido, también se vuelve a la zona de Websourcing.
    if (error && !String(error.message).includes('sin_sesion_ver_como')) { avisar(mensajeDeError(error)); setSaliendo(false); return; }
    window.location.assign('/admin/clientes');
  };
  const vence = new Date(v.venceEn);
  const hora = Number.isNaN(vence.getTime()) ? '' : vence.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-warning/40 bg-warning/15 px-4 py-2 text-sm backdrop-blur md:px-8" role="status" data-testid="franja-ver-como">
      <EyeOff className="size-4 text-warning" aria-hidden />
      <span><strong>Estás viendo como el cliente</strong> · {v.empresaNombre} · solo lectura{hora ? ` · termina a las ${hora}` : ''}. Queda en el registro.</span>
      <Button size="sm" variant="outline" className="ml-auto" disabled={saliendo} onClick={() => void salir()}>Salir</Button>
    </div>
  );
}

/** Botón "Ver como el cliente": pide el rol que se quiere mirar y abre la zona del cliente en solo lectura. */
export function BotonVerComo({ empresaId, empresaNombre, deshabilitado }: { empresaId: string; empresaNombre: string; deshabilitado?: boolean }) {
  const [abierto, setAbierto] = React.useState(false);
  const [rol, setRol] = React.useState<Rol>('admin_cliente');
  const [p, setP] = React.useState({ aprobar: false, ver_dinero: false, ver_todos_tickets: false, subir_archivos: false });
  const [error, setError] = React.useState('');
  const [trabajando, setTrabajando] = React.useState(false);
  const iniciar = async () => {
    setTrabajando(true); setError('');
    const { error: e } = await iniciarVerComo(crearClienteNavegador(), {
      p_empresa_id: empresaId, p_rol: rol,
      ...(rol === 'equipo' ? { p_aprobar: p.aprobar, p_ver_dinero: p.ver_dinero, p_ver_todos_tickets: p.ver_todos_tickets, p_subir_archivos: p.subir_archivos } : {}),
    });
    if (e) { setError(mensajeDeError(e)); setTrabajando(false); return; }
    window.location.assign('/cliente/inicio'); // recarga completa: la sesión de "ver como" vive en el servidor
  };
  return (
    <>
      <Button variant="secondary" disabled={deshabilitado} onClick={() => { setAbierto(true); setError(''); }}><Eye />Ver como el cliente</Button>
      <Dialog open={abierto} onOpenChange={(o) => !trabajando && setAbierto(o)}>
        <DialogContent title="Ver como el cliente" description={`Verás lo mismo que ve ${empresaNombre}, solo para mirar. Dura 60 minutos y queda en el registro de actividad.`}>
          <div className="space-y-4">
            <Field label="Mirar como" htmlFor="vc-rol">
              <Select id="vc-rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
                <option value="admin_cliente">Administrador del cliente</option>
                <option value="equipo">Equipo del cliente</option>
              </Select>
            </Field>
            {rol === 'equipo' && (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Permisos que tendría esa persona</legend>
                <Checkbox id="vc-aprobar" checked={p.aprobar} onChange={(v) => setP({ ...p, aprobar: v })} label="Aprobar" />
                <Checkbox id="vc-dinero" checked={p.ver_dinero} onChange={(v) => setP({ ...p, ver_dinero: v })} label="Ver dinero" />
                <Checkbox id="vc-tickets" checked={p.ver_todos_tickets} onChange={(v) => setP({ ...p, ver_todos_tickets: v })} label="Ver todos los tickets" />
                <Checkbox id="vc-archivos" checked={p.subir_archivos} onChange={(v) => setP({ ...p, subir_archivos: v })} label="Subir archivos" />
              </fieldset>
            )}
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button variant="ghost" disabled={trabajando}>Cancelar</Button></DialogClose>
              <Button onClick={() => void iniciar()} disabled={trabajando}>{trabajando ? 'Abriendo…' : 'Empezar a mirar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
