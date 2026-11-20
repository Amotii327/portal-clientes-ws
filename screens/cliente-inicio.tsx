'use client';
import * as React from 'react';
import { CalendarDays, Flag, History, Layers, LifeBuoy, Wallet } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader, Stat } from '@/components/ds/page';
import { Pantalla } from '@/components/ds/states';
import { Timeline } from '@/components/ds/timeline';
import { Enlace } from '@/lib/router';
import { useStore } from '@/lib/store';
import { avance } from '@/lib/data';
import { cop, fecha } from '@/lib/utils';

export function Inicio() {
  const { empresa, can, rol, usuario } = useStore();
  const [pid, setPid] = React.useState(empresa.proyectos[0]?.id);
  const proyecto = empresa.proyectos.find((p) => p.id === pid) ?? empresa.proyectos[0];
  React.useEffect(() => setPid(empresa.proyectos[0]?.id), [empresa.id, empresa.proyectos]);
  const pendientes = empresa.revisiones.filter((r) => r.estado === 'publicada' && r.proyectoId === proyecto?.id);
  const a = proyecto ? avance(proyecto) : null;
  const contrato = empresa.pagos.filter((p) => p.origen === 'contrato');
  const saldo = contrato.filter((p) => p.estado !== 'pagado').reduce((t, p) => t + p.valor, 0);
  const prox = empresa.pagos.filter((p) => p.estado === 'vencido' || p.estado === 'proximo').sort((x, y) => x.vence.localeCompare(y.vence))[0];
  const abiertos = empresa.tickets.filter((t) => t.estado !== 'Cerrado' && t.estado !== 'Resuelto' && (can.verTodosTickets || t.creadorId === usuario?.id)).length;
  return (
    <>
      <PageHeader
        eyebrow={`Hola, ${usuario?.cargo ?? 'equipo'} · ${empresa.nombre}`}
        titulo={proyecto?.nombre ?? 'Tu proyecto'}
        descripcion="Aquí ves el recorrido completo de tu proyecto, como el rastreo de un paquete."
      />
      <Pantalla vacio={{ titulo: 'Todavía no tienes un proyecto', texto: 'Cuando Websourcing cree tu proyecto, aquí verás su línea de tiempo con los 13 hitos.' }}>
        {empresa.proyectos.length > 1 && <Tabs className="mb-6 w-fit max-w-full" value={proyecto.id} onChange={setPid} items={empresa.proyectos.map((p) => ({ id: p.id, label: p.nombre }))} />}
        {pendientes.length > 0 && (
          <Alert variant="warning" className="mb-6" title={`Tienes ${pendientes.length} revisión esperando tu aprobación`}
            action={<Button size="sm" asChild><Enlace to="/cliente/revisiones">Revisar</Enlace></Button>}>
            {can.aprobar ? `${pendientes[0].titulo} está listo para que lo revises con su link de prueba y su acta.` : 'Quien puede aprobar en tu empresa ya recibió el aviso. Tú puedes mirarla, pero no aprobarla.'}
          </Alert>
        )}
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5 sm:col-span-2 lg:col-span-1">
            <p className="text-sm text-muted-foreground">Avance del proyecto</p>
            <p className="mt-2 font-display text-4xl font-semibold leading-none">{a?.pct}%</p>
            <Progress className="mt-3" value={a?.pct ?? 0} label="Avance del proyecto" />
            <p className="mt-2 text-xs text-muted-foreground">{proyecto.sprintActual ? `Sprint ${proyecto.sprintActual} de ${proyecto.sprintsTotal}` : `${a?.hechos} de ${a?.partes} partes`}{proyecto.proximaDemo ? ` · demo ${fecha(proyecto.proximaDemo, true)}` : ''}</p>
          </Card>
          {can.verDinero ? (
            <>
              <Stat etiqueta="Saldo pendiente" valor={cop(saldo).replace(' COP', '')} nota="COP · cifra de ejemplo" icono={<Wallet className="size-5" />} />
              <Stat etiqueta="Próximo pago" valor={prox ? fecha(prox.vence, true) : '—'} tono={prox?.estado === 'vencido' ? 'danger' : undefined} nota={prox ? `${prox.concepto}${prox.estado === 'vencido' ? ' · vencido' : ''}` : 'Sin pagos próximos'} icono={<CalendarDays className="size-5" />} />
            </>
          ) : (
            <>
              <Stat etiqueta="Sprint actual" valor={proyecto.sprintActual ? `${proyecto.sprintActual} de ${proyecto.sprintsTotal}` : '—'} nota={proyecto.sprintActual ? 'En construcción' : 'Aún no empiezan'} icono={<Layers className="size-5" />} />
              <Stat etiqueta="Próxima demo" valor={proyecto.proximaDemo ? fecha(proyecto.proximaDemo, true) : '—'} nota={proyecto.proximaDemo ? 'Te avisamos por correo' : 'Sin demo programada'} icono={<CalendarDays className="size-5" />} />
            </>
          )}
          <Stat etiqueta="Tickets abiertos" valor={abiertos} nota={`${pendientes.length} revisión esperando tu aprobación`} tono={pendientes.length ? 'warning' : undefined} icono={<LifeBuoy className="size-5" />} />
        </div>
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-display-md"><Flag className="size-5 text-primary-text" aria-hidden />Línea de tiempo</h2>
          <Timeline proyecto={proyecto} pagos={empresa.pagos} verDinero={can.verDinero} mantenimientoActivo={empresa.mantenimiento.activo} />
        </section>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5 text-primary-text" aria-hidden />Historial del proyecto</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {proyecto.historial.map((x, i) => (
                <li key={i} className="flex gap-4 py-3 text-sm"><span className="w-24 shrink-0 text-muted-foreground">{fecha(x.cuando, true)}</span><span>{x.texto}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </Pantalla>
    </>
  );
}
