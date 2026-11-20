'use client';
import { CalendarCheck, CheckCircle2, Clock, MinusCircle, Wallet, Wrench } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EjemploChip, PageHeader, Seccion } from '@/components/ds/page';
import { EstadoVacio, Pantalla } from '@/components/ds/states';
import { Enlace } from '@/lib/router';
import { useStore } from '@/lib/store';
import { cop, fecha } from '@/lib/utils';

export function MiMantenimiento() {
  const { empresa, can } = useStore();
  const m = empresa.mantenimiento;
  if (!m.activo) {
    return <><PageHeader titulo="Mi plan de mantenimiento" /><EstadoVacio titulo="Tu empresa no tiene mantenimiento activo" texto="El mantenimiento es opcional: cuida tu sistema después de la entrega. Si te interesa, escríbenos y lo activamos." /></>;
  }
  const pct = m.horasMes ? (m.horasUsadas / m.horasMes) * 100 : 0;
  const tono = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'primary';
  const disp = Math.max(0, m.horasMes - m.horasUsadas);
  const h = (n: number) => String(n).replace('.', ',') + ' h';
  return (
    <>
      <PageHeader eyebrow={`Plan ${m.plan}`} titulo="Mi plan de mantenimiento" descripcion="Como un plan de celular: tienes una bolsa de horas cada mes y un conjunto de cosas incluidas." acciones={<EjemploChip />} />
      <Pantalla vacio={{ titulo: 'Sin información todavía', texto: 'Cuando se registren horas, las verás aquí.' }}>
        {pct >= 80 && <Alert className="mb-6" variant={pct >= 100 ? 'danger' : 'warning'} title={pct >= 100 ? 'Se acabó la bolsa de horas de este mes' : 'Ya usaste el 80 % de tus horas de este mes'}>{pct >= 100 ? `Las horas siguientes son extra (${cop(m.horaExtra)} por hora) y no se trabajan sin tu aprobación.` : `Te quedan ${h(disp)}. Si se acaban, las horas extra se cobran a ${cop(m.horaExtra)} y solo se trabajan con tu aprobación.`}</Alert>}
        <div className="mb-8 grid gap-4 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm text-muted-foreground">Horas del mes</p><p className="mt-1 font-display text-4xl font-semibold leading-none"><span className={pct >= 80 ? 'text-warning' : 'text-primary-text'}>{h(m.horasUsadas)}</span> <span className="text-xl text-muted-foreground">de {h(m.horasMes)}</span></p></div><Badge variant={pct >= 80 ? 'warning' : 'success'}>Disponibles: {h(disp)}</Badge></div>
            <Progress className="mt-5 h-3" value={pct} tone={tono} marker={80} label="Horas usadas del mes" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>0</span><span>Aviso al 80 %</span><span>{h(m.horasMes)}</span></div>
            <p className="mt-4 text-sm text-muted-foreground">{m.acumular ? 'Las horas que no uses pasan al mes siguiente.' : 'Las horas que no uses se pierden al cerrar el mes.'}</p>
          </Card>
          <div className="grid gap-4">
            <Card className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarCheck className="size-4" aria-hidden />Próxima revisión</div><p className="mt-1 font-display text-2xl font-semibold">{fecha(m.proximaRevision)}</p><p className="text-xs text-muted-foreground">{m.revisionesSemana} revisión(es) por semana</p></Card>
            <Card className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="size-4" aria-hidden />Cuota mensual</div>{can.verDinero ? <><p className="mt-1 font-display text-2xl font-semibold">{cop(m.cuota)}</p><Button variant="link" size="sm" asChild><Enlace to="/cliente/dinero">Ver en Dinero</Enlace></Button></> : <p className="mt-1 text-sm text-muted-foreground">Visible para quien ve Dinero</p>}</Card>
          </div>
        </div>
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="size-5 text-primary-text" aria-hidden />Qué incluye</CardTitle></CardHeader><CardContent>
            <ul className="space-y-2.5">
              {Object.entries(m.incluye).map(([k, v]) => <li key={k} className="flex items-center gap-3 text-sm">{v ? <CheckCircle2 className="size-5 text-primary-text" aria-hidden /> : <MinusCircle className="size-5 text-muted-foreground" aria-hidden />}<span className={v ? '' : 'text-muted-foreground line-through'}>{k}</span>{!v && <span className="sr-only">no incluido</span>}</li>)}
              {m.otros && <li className="flex items-center gap-3 text-sm"><CheckCircle2 className="size-5 text-primary-text" aria-hidden />{m.otros}</li>}
            </ul>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock className="size-5 text-primary-text" aria-hidden />Atención</CardTitle></CardHeader><CardContent>
            <p className="mb-3 text-sm text-muted-foreground">{m.dias} · {m.horario}</p>
            <Table className="min-w-0"><THead><TR><TH>Prioridad</TH><TH>Primera respuesta</TH></TR></THead><TBody>{Object.entries(m.tiempos).map(([k, v]) => <TR key={k}><TD>{k}</TD><TD>{v}</TD></TR>)}</TBody></Table>
            <p className="mt-3 text-xs text-muted-foreground">Estos tiempos reemplazan los generales mientras tu plan esté activo. Plan desde el {fecha(m.inicio)}{m.renovacion ? ', renovación automática mensual' : ''}.</p>
          </CardContent></Card>
        </div>
        <Seccion titulo="Horas de este mes" descripcion="Solo se descuentan las horas que Websourcing ya revisó.">
          <Table className="min-w-0"><THead><TR><TH>Ticket</TH><TH>Fecha</TH><TH className="text-right">Horas</TH></TR></THead><TBody>
            {m.horasRegistradas.filter((x) => x.estado === 'aprobada').map((x) => <TR key={x.ticket + x.fecha}><TD><Enlace className="text-primary-text hover:underline" to={`/cliente/tickets/${x.ticket}`}>{x.ticket}</Enlace></TD><TD>{fecha(x.fecha)}</TD><TD className="text-right tabular-nums">{h(x.horas)}</TD></TR>)}
          </TBody></Table>
        </Seccion>
      </Pantalla>
    </>
  );
}
