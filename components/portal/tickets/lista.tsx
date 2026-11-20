'use client';
import * as React from 'react';
import { Plus, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Tabs } from '@/components/ui/tabs';
import { PrioridadBadge, TicketBadge } from '@/components/ds/badges';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { useCargar } from '@/lib/app/datos';
import { fecha } from '@/lib/utils';
import { usePortal } from '../contexto';
import { leerLista } from './lecturas';
import { ESTADO_TXT, PESO_SEMAFORO, PRIORIDAD_TXT, SemaforoReal, TIPO_TXT, estaAbierto, numeroDe, prioridadDe, requiereDecision } from './comunes';
import type { EstadoTicket, PrioridadTicket, Semaforo } from '@/lib/supabase/tipos-tickets-mant';

type Pestana = 'abiertos' | 'cerrados' | 'todos' | 'decision';

/** Tickets reales. Cliente: solo los suyos (o todos con permiso); super admin: todas las empresas con filtros. La base filtra. */
export function TicketsListaReal({ modo }: { modo: 'cliente' | 'admin' }) {
  const ctx = usePortal();
  const admin = modo === 'admin';
  const { estado, datos, recargar } = useCargar(() => leerLista(admin), [admin]);
  const [tab, setTab] = React.useState<Pestana>('abiertos');
  const [fEmp, setFEmp] = React.useState('todas');
  const [fPri, setFPri] = React.useState('todas');
  const [fEst, setFEst] = React.useState('todos');
  const [fSem, setFSem] = React.useState('todos');
  const verTodos = ctx.rol === 'admin_cliente' || !!ctx.permisos?.ver_todos_tickets;

  const lista = React.useMemo(() => {
    if (!datos) return [];
    let l = datos.tickets.filter((t) => (tab === 'todos' ? true : tab === 'abiertos' ? estaAbierto(t) : tab === 'cerrados' ? !estaAbierto(t) : requiereDecision(t)));
    if (admin) {
      l = l.filter((t) => (fEmp === 'todas' || t.empresa_id === fEmp) && (fPri === 'todas' || prioridadDe(t) === fPri) && (fEst === 'todos' || t.estado === fEst)
        && (fSem === 'todos' || datos.semaforo.get(t.id)?.semaforo === fSem));
      const peso = (id: string) => PESO_SEMAFORO[datos.semaforo.get(id)?.semaforo ?? 'cerrado'];
      return [...l].sort((a, b) => peso(a.id) - peso(b.id) || b.creado_en.localeCompare(a.creado_en));
    }
    return [...l].sort((a, b) => b.creado_en.localeCompare(a.creado_en));
  }, [datos, tab, admin, fEmp, fPri, fEst, fSem]);

  const nuevo = !admin && <Button asChild><Enlace to="/cliente/tickets/nuevo"><Plus />Nuevo ticket</Enlace></Button>;
  return (
    <>
      <PageHeader
        titulo={admin ? 'Tickets de todos los clientes' : 'Tickets'}
        descripcion={admin ? 'Filtra por cliente, prioridad y estado. El semáforo muestra el tiempo que falta para la primera respuesta.' : verTodos ? 'Todas las solicitudes de tu empresa.' : 'Estas son las solicitudes que creaste tú.'}
        acciones={nuevo}
      />
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => recargar()} />}
      {estado === 'ok' && datos && datos.tickets.length === 0 && (
        <EstadoVacio titulo="Aún no hay tickets" texto={admin ? 'Cuando un cliente cree un ticket, lo verás aquí con su semáforo.' : 'Cuando necesites algo, crea un ticket y sigue su avance aquí hasta que se cierre.'}>
          {!admin && <Button asChild><Enlace to="/cliente/tickets/nuevo"><Plus />Crear mi primer ticket</Enlace></Button>}
        </EstadoVacio>
      )}
      {estado === 'ok' && datos && datos.tickets.length > 0 && (
        <>
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <Tabs value={tab} onChange={setTab} className="w-fit max-w-full" items={[
              { id: 'abiertos', label: 'Abiertos', count: datos.tickets.filter(estaAbierto).length },
              { id: 'cerrados', label: 'Resueltos y cerrados', count: datos.tickets.filter((t) => !estaAbierto(t)).length },
              ...(admin ? [{ id: 'decision' as const, label: 'Por decidir', count: datos.tickets.filter(requiereDecision).length }] : []),
              { id: 'todos', label: 'Todos' },
            ]} />
            {admin && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:w-[44rem]">
                <Select aria-label="Cliente" value={fEmp} onChange={(e) => setFEmp(e.target.value)}><option value="todas">Todos los clientes</option>{[...datos.empresas].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
                <Select aria-label="Prioridad" value={fPri} onChange={(e) => setFPri(e.target.value)}><option value="todas">Toda prioridad</option>{(Object.keys(PRIORIDAD_TXT) as PrioridadTicket[]).map((p) => <option key={p} value={p}>{PRIORIDAD_TXT[p]}</option>)}</Select>
                <Select aria-label="Estado" value={fEst} onChange={(e) => setFEst(e.target.value)}><option value="todos">Todo estado</option>{(Object.keys(ESTADO_TXT) as EstadoTicket[]).map((p) => <option key={p} value={p}>{ESTADO_TXT[p]}</option>)}</Select>
                <Select aria-label="Semáforo" value={fSem} onChange={(e) => setFSem(e.target.value)}><option value="todos">Todo semáforo</option>{([['rojo', 'Vencidos'], ['amarillo', 'Por vencer'], ['verde', 'A tiempo']] as [Semaforo, string][]).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select>
              </div>
            )}
          </div>
          {lista.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">No hay tickets con estos filtros.</Card>
          ) : (
            <ul className="space-y-3" aria-label="Tickets">
              {lista.map((t) => (
                <li key={t.id} data-testid="ticket">
                  <Enlace to={`${admin ? '/admin' : '/cliente'}/tickets/${t.id}`} className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-surface-2 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{numeroDe(t.numero)} · {TIPO_TXT[t.tipo]}{admin ? ` · ${datos.empresas.get(t.empresa_id) ?? ''}` : ''}</p>
                        <h3 className="mt-0.5 break-words font-display text-base font-semibold">{t.titulo}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PrioridadBadge p={PRIORIDAD_TXT[prioridadDe(t)]} /><TicketBadge estado={ESTADO_TXT[t.estado]} />
                        {t.fuera_de_plan && <Badge variant="danger">Fuera de plan</Badge>}
                        {requiereDecision(t) && <Badge variant="warning">{admin ? 'Falta tu decisión' : 'Esperando decisión'}</Badge>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span>{datos.personas.get(t.creado_por) ? `Creado por ${datos.personas.get(t.creado_por)} · ` : 'Creado el '}{fecha(t.creado_en)}</span>
                      {estaAbierto(t) && <SemaforoReal fila={datos.semaforo.get(t.id)} />}
                      {t.calificacion && <span className="inline-flex items-center gap-1 text-warning"><Star className="size-3.5 fill-current" aria-hidden />{t.calificacion}/5</span>}
                    </div>
                  </Enlace>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
