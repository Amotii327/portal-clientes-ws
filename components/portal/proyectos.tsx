'use client';
import * as React from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { Enlace, ir } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { crearProyecto } from '@/lib/portal/acciones';
import { correr, ESTADO_PROYECTO } from '@/lib/app/proyectos';
import { useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import type { ResumenProyecto } from '@/lib/supabase/database.types';
import { fecha } from '@/lib/utils';

export interface EmpresaMini { id: string; nombre: string; estado: 'activa' | 'pausada' }

/** Ventana para crear un proyecto en una empresa. El proyecto nace con sus 13 hitos. */
export function NuevoProyectoDialog({ abierto, onCerrar, empresas, empresaId, onHecho }: {
  abierto: boolean; onCerrar: () => void; empresas: EmpresaMini[]; empresaId?: string; onHecho: (empresaId: string, proyectoId: string) => void;
}) {
  const { avisar } = useStore();
  const [f, setF] = React.useState({ empresa: empresaId ?? '', nombre: '', descripcion: '', inicio: '', fin: '' });
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [trabajando, setTrabajando] = React.useState(false);
  React.useEffect(() => { if (abierto) { setF({ empresa: empresaId ?? '', nombre: '', descripcion: '', inicio: '', fin: '' }); setIntento(false); setError(''); } }, [abierto, empresaId]);
  const activas = empresas.filter((e) => e.estado === 'activa');
  const errNombre = intento && f.nombre.trim().length < 2 ? 'Escribe el nombre del proyecto (mínimo 2 letras).' : undefined;
  const errEmpresa = intento && !f.empresa ? 'Elige la empresa.' : undefined;
  const errFechas = f.inicio && f.fin && f.fin < f.inicio ? 'La fecha final no puede ser anterior a la inicial.' : undefined;
  const crear = async (ev: React.FormEvent) => {
    ev.preventDefault(); setIntento(true); setError('');
    if (f.nombre.trim().length < 2 || !f.empresa || errFechas) return;
    setTrabajando(true);
    const r = await correr('crear_proyecto', crearProyecto(crearClienteNavegador(), {
      p_empresa_id: f.empresa, p_nombre: f.nombre.trim(), p_descripcion: f.descripcion.trim() || null,
      p_fecha_inicio: f.inicio || null, p_fecha_fin_planeada: f.fin || null,
    }));
    setTrabajando(false);
    if (r.error) { setError(r.mensaje); return; }
    avisar('Proyecto creado con sus 13 hitos.');
    onHecho(f.empresa, (r.data as { proyecto_id: string }).proyecto_id);
  };
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !trabajando && onCerrar()}>
      <DialogContent title="Nuevo proyecto" description="Nace con los 13 hitos estándar. Después ajustas fechas, nombres y el plan de sprints.">
        <form className="space-y-4" onSubmit={crear} noValidate>
          <Field label="Empresa" htmlFor="np-empresa" error={errEmpresa}>
            <Select id="np-empresa" value={f.empresa} disabled={!!empresaId} onChange={(e) => setF({ ...f, empresa: e.target.value })}>
              <option value="">Elige una empresa</option>
              {activas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Nombre del proyecto" htmlFor="np-nombre" error={errNombre}><Input id="np-nombre" value={f.nombre} maxLength={160} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
          <Field label="Descripción (opcional)" htmlFor="np-desc"><Textarea id="np-desc" value={f.descripcion} maxLength={1000} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha de inicio" htmlFor="np-ini"><Input id="np-ini" type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Field>
            <Field label="Fin planeado" htmlFor="np-fin" error={errFechas}><Input id="np-fin" type="date" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Field>
          </div>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="ghost" disabled={trabajando}>Cancelar</Button></DialogClose><Button type="submit" disabled={trabajando}>{trabajando ? 'Creando…' : 'Crear proyecto'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function leerLista() {
  const c = crearClienteNavegador();
  const [p, e] = await Promise.all([
    c.from('v_proyectos_resumen').select('*').order('empresa_nombre', { ascending: true }),
    c.from('empresas').select('id, nombre, estado').order('nombre', { ascending: true }),
  ]);
  if (p.error || e.error) throw new Error('lectura_fallida');
  return { proyectos: (p.data ?? []) as ResumenProyecto[], empresas: (e.data ?? []) as EmpresaMini[] };
}

/** Lista de proyectos de todas las empresas, con filtro por empresa y creación. */
export function ProyectosListaReal() {
  const { estado, datos, recargar } = useCargar(leerLista, []);
  const [dlg, setDlg] = React.useState(false);
  const [emp, setEmp] = React.useState('todas');
  const nuevo = <Button onClick={() => setDlg(true)}><Plus />Nuevo proyecto</Button>;
  const cab = <PageHeader titulo="Proyectos" descripcion="Todos los proyectos de todas las empresas. Cada uno nace con sus 13 hitos." acciones={nuevo} />;
  if (estado === 'cargando') return <>{cab}<EstadoCargando /></>;
  if (estado === 'error' || !datos) return <>{cab}<EstadoError onReintentar={() => recargar()} /></>;
  const lista = datos.proyectos.filter((p) => emp === 'todas' || p.empresa_id === emp);
  return (
    <>
      {cab}
      {datos.proyectos.length === 0 ? (
        <EstadoVacio titulo="Aún no hay proyectos" texto="Crea el primero: eliges la empresa, le pones nombre y nace con sus 13 hitos."><Button onClick={() => setDlg(true)}><Plus />Nuevo proyecto</Button></EstadoVacio>
      ) : (
        <>
          <div className="mb-4 max-w-xs"><Select aria-label="Filtrar por empresa" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="todas">Todas las empresas</option>{datos.empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select></div>
          <Table>
            <THead><TR><TH>Empresa</TH><TH>Proyecto</TH><TH className="w-48">Avance</TH><TH>Plan de sprints</TH><TH>Próxima demo</TH><TH>Estado</TH></TR></THead>
            <TBody>
              {lista.map((p) => (
                <TR key={p.proyecto_id} data-testid="fila-proyecto" className="cursor-pointer" onClick={() => ir(`/admin/proyectos/${p.empresa_id}/${p.proyecto_id}`)}>
                  <TD className="font-medium">{p.empresa_nombre}</TD>
                  <TD><Enlace to={`/admin/proyectos/${p.empresa_id}/${p.proyecto_id}`} className="text-primary-text hover:underline">{p.nombre}</Enlace></TD>
                  <TD><div className="flex items-center gap-3"><Progress className="flex-1" value={p.avance_pct} label={`Avance de ${p.nombre}`} /><span className="w-12 text-right tabular-nums">{Math.round(p.avance_pct * 10) / 10}%</span></div></TD>
                  <TD><Badge variant={p.plan_estado === 'aprobado' ? 'success' : 'warning'}>{p.plan_estado === 'aprobado' ? 'Publicado' : 'Propuesta'}</Badge></TD>
                  <TD>{p.proxima_demo ? fecha(p.proxima_demo) : '—'}</TD>
                  <TD><Badge variant={p.estado === 'activo' ? 'info' : 'neutral'}>{ESTADO_PROYECTO[p.estado]}</Badge>{p.empresa_estado === 'pausada' && <Badge variant="warning" className="ml-1.5">Empresa pausada</Badge>}</TD>
                </TR>
              ))}
              {lista.length === 0 && <TR><TD colSpan={6} className="text-muted-foreground">Esta empresa todavía no tiene proyectos.</TD></TR>}
            </TBody>
          </Table>
        </>
      )}
      <NuevoProyectoDialog abierto={dlg} onCerrar={() => setDlg(false)} empresas={datos.empresas} empresaId={emp !== 'todas' ? emp : undefined} onHecho={(e, p) => ir(`/admin/proyectos/${e}/${p}`)} />
    </>
  );
}
