import * as React from 'react';
import { coincide } from '@/lib/router';
import { Codigo, Invitacion, Login, Recuperar } from './entrada';
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

export type R = (p: Record<string, string>) => React.ReactNode;
export const ENTRADA: [string, R][] = [['/entrada/login', () => <Login />], ['/entrada/invitacion', () => <Invitacion />], ['/entrada/recuperar', () => <Recuperar />], ['/entrada/codigo', () => <Codigo />]];
export const CLIENTE: [string, R][] = [
  ['/cliente/inicio', () => <Inicio />], ['/cliente/revisiones', () => <Revisiones />], ['/cliente/dinero', () => <Dinero />],
  ['/cliente/tickets', () => <TicketsLista modo="cliente" />], ['/cliente/tickets/nuevo', () => <TicketNuevo />], ['/cliente/tickets/:id', (p) => <TicketDetalle id={p.id} modo="cliente" />],
  ['/cliente/documentos', () => <Documentos />], ['/cliente/equipo', () => <MiEquipo />], ['/cliente/mantenimiento', () => <MiMantenimiento />],
];
export const ADMIN: [string, R][] = [
  ['/admin/panel', () => <Panel />], ['/admin/clientes', () => <Clientes />], ['/admin/clientes/:id', (p) => <ClienteDetalle id={p.id} />],
  ['/admin/proyectos/:e/:p', (p) => <ProyectoDetalle empresaId={p.e} proyectoId={p.p} />], ['/admin/aprobaciones', () => <Aprobaciones />], ['/admin/finanzas', () => <Finanzas />],
  ['/admin/tickets', () => <TicketsLista modo="admin" />], ['/admin/tickets/:id', (p) => <TicketDetalle id={p.id} modo="admin" />],
  ['/admin/mantenimiento', () => <MantenimientoLista />], ['/admin/mantenimiento/:id', (p) => <MantenimientoConfig id={p.id} />], ['/admin/registro', () => <Registro />],
];
export function buscar(tabla: [string, R][], ruta: string) {
  for (const [pat, r] of tabla) { const p = coincide(pat, ruta.replace(/\/$/, '') || '/'); if (p) return r(p); }
  return null;
}

