'use client';
import * as React from 'react';
import { ProtoBar } from '@/components/shell/proto-bar';
import { Shell } from '@/components/shell/shell';
import { Toasts } from '@/components/ds/toasts';
import { EmpresaPausada, SinPermiso } from '@/components/ds/states';
import { PageHeader } from '@/components/ds/page';
import { coincide, ir, useRuta } from '@/lib/router';
import { StoreProvider, useStore } from '@/lib/store';
import { Codigo, EntradaLayout, Invitacion, Login, Recuperar } from './entrada';
import { Indice } from './indice';
import { Sistema } from './sistema';
import { Inicio } from './cliente-inicio';
import { Revisiones } from './cliente-revisiones';
import { Dinero } from './cliente-dinero';
import { TicketDetalle, TicketNuevo, TicketsLista } from './tickets';
import { Documentos } from './cliente-docs';
import { MiEquipo } from './cliente-equipo';
import { MiMantenimiento } from './cliente-mantenimiento';
import { Clientes, Panel } from './admin-panel';
import { ClienteDetalle, ProyectoDetalle } from './admin-clientes';
import { Aprobaciones } from './admin-aprobaciones';
import { Finanzas } from './admin-finanzas';
import { MantenimientoConfig, MantenimientoLista } from './admin-mant';
import { Registro } from './admin-registro';

type R = (p: Record<string, string>) => React.ReactNode;
const ENTRADA: [string, R][] = [['/entrada/login', () => <Login />], ['/entrada/invitacion', () => <Invitacion />], ['/entrada/recuperar', () => <Recuperar />], ['/entrada/codigo', () => <Codigo />]];
const CLIENTE: [string, R][] = [
  ['/cliente/inicio', () => <Inicio />], ['/cliente/revisiones', () => <Revisiones />], ['/cliente/dinero', () => <Dinero />],
  ['/cliente/tickets', () => <TicketsLista modo="cliente" />], ['/cliente/tickets/nuevo', () => <TicketNuevo />], ['/cliente/tickets/:id', (p) => <TicketDetalle id={p.id} modo="cliente" />],
  ['/cliente/documentos', () => <Documentos />], ['/cliente/equipo', () => <MiEquipo />], ['/cliente/mantenimiento', () => <MiMantenimiento />],
];
const ADMIN: [string, R][] = [
  ['/admin/panel', () => <Panel />], ['/admin/clientes', () => <Clientes />], ['/admin/clientes/:id', (p) => <ClienteDetalle id={p.id} />],
  ['/admin/proyectos/:e/:p', (p) => <ProyectoDetalle empresaId={p.e} proyectoId={p.p} />], ['/admin/aprobaciones', () => <Aprobaciones />], ['/admin/finanzas', () => <Finanzas />],
  ['/admin/tickets', () => <TicketsLista modo="admin" />], ['/admin/tickets/:id', (p) => <TicketDetalle id={p.id} modo="admin" />],
  ['/admin/mantenimiento', () => <MantenimientoLista />], ['/admin/mantenimiento/:id', (p) => <MantenimientoConfig id={p.id} />], ['/admin/registro', () => <Registro />],
];
function buscar(tabla: [string, R][], ruta: string) {
  for (const [pat, r] of tabla) { const p = coincide(pat, ruta.replace(/\/$/, '') || '/'); if (p) return r(p); }
  return null;
}

function Rutas() {
  const ruta = useRuta();
  const s = useStore();
  const [listo, setListo] = React.useState(false);
  React.useEffect(() => setListo(true), []);
  React.useEffect(() => { if (s.rol === 'super' && ruta.startsWith('/cliente')) ir('/admin/panel'); }, [s.rol, ruta]);
  if (!listo) return null;
  const r = ruta.replace(/\/$/, '') || '/';
  let cuerpo: React.ReactNode;
  if (r === '/') cuerpo = <Indice />;
  else if (r === '/sistema-de-diseno') cuerpo = <Sistema />;
  else if (r.startsWith('/entrada')) cuerpo = <EntradaLayout>{buscar(ENTRADA, r) ?? <Login />}</EntradaLayout>;
  else if (r.startsWith('/cliente')) {
    if (s.rol === 'super') cuerpo = null;
    else if (s.empresa.estado === 'pausada') cuerpo = <EmpresaPausada />;
    else cuerpo = <Shell>{buscar(CLIENTE, r) ?? <><PageHeader titulo="Pantalla no encontrada" /><SinPermiso texto="Esta pantalla no existe." /></>}</Shell>;
  } else if (r.startsWith('/admin')) {
    cuerpo = s.rol === 'super'
      ? <Shell>{buscar(ADMIN, r) ?? <><PageHeader titulo="Pantalla no encontrada" /><SinPermiso texto="Esta pantalla no existe." /></>}</Shell>
      : <Shell><PageHeader titulo="Zona de Websourcing" /><SinPermiso texto="Esta zona es solo para el equipo de Websourcing. Tu cuenta no tiene acceso." /></Shell>;
  } else cuerpo = <Indice />;
  return <>{cuerpo}</>;
}

export function PrototipoApp() {
  return (
    <StoreProvider>
      <ProtoBar />
      <Rutas />
      <Toasts />
    </StoreProvider>
  );
}
