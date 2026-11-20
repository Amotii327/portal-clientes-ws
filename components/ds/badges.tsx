import { CheckCircle2, CircleDashed, Clock3, Hourglass, Loader2, MessageSquareReply, XCircle, Eye, FileEdit, Send, ShieldCheck, Ban, AlertOctagon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { HitoEstado, PagoEstado, Prioridad, RevEstado, TicketEstado } from '@/lib/data';

export function HitoBadge({ estado }: { estado: HitoEstado }) {
  const m = {
    pendiente: ['neutral', 'Pendiente', CircleDashed],
    en_curso: ['info', 'En curso', Loader2],
    esperando: ['warning', 'Esperando tu aprobación', Hourglass],
    terminado: ['success', 'Terminado', CheckCircle2],
  } as const;
  const [v, t, I] = m[estado];
  return <Badge variant={v}><I className="size-3.5" aria-hidden />{t}</Badge>;
}

export function PagoBadge({ estado }: { estado: PagoEstado }) {
  const m = {
    pagado: ['success', 'Pagado', CheckCircle2],
    proximo: ['info', 'Próximo', Clock3],
    vencido: ['danger', 'Vencido', AlertOctagon],
    en_revision: ['warning', 'En revisión', Eye],
    pendiente: ['neutral', 'Pendiente', CircleDashed],
  } as const;
  const [v, t, I] = m[estado];
  return <Badge variant={v}><I className="size-3.5" aria-hidden />{t}</Badge>;
}

export function RevisionBadge({ estado, vistaWebsourcing = false }: { estado: RevEstado; vistaWebsourcing?: boolean }) {
  const m = {
    borrador: ['neutral', vistaWebsourcing ? 'Esperando tu revisión' : 'Borrador', FileEdit],
    publicada: ['warning', vistaWebsourcing ? 'Esperando al cliente' : 'Esperando tu aprobación', Send],
    aprobada: ['success', 'Aprobada', ShieldCheck],
    cambios_pedidos: ['danger', 'Cambios pedidos', MessageSquareReply],
  } as const;
  const [v, t, I] = m[estado];
  return <Badge variant={v}><I className="size-3.5" aria-hidden />{t}</Badge>;
}

export function TicketBadge({ estado }: { estado: TicketEstado }) {
  const v: Record<TicketEstado, 'neutral' | 'info' | 'primary' | 'warning' | 'success'> = {
    Nuevo: 'info', Clasificado: 'neutral', 'En progreso': 'primary', 'Esperando al cliente': 'warning', Resuelto: 'success', Cerrado: 'neutral',
  };
  return <Badge variant={v[estado]}>{estado}</Badge>;
}

export function PrioridadBadge({ p }: { p: Prioridad }) {
  const v = { Urgente: 'danger', Alta: 'warning', Normal: 'info', Baja: 'neutral' } as const;
  return <Badge variant={v[p]}>{p}</Badge>;
}

export function LadoBadge({ lado }: { lado: 'websourcing' | 'cliente' }) {
  return lado === 'websourcing'
    ? <Badge variant="warning"><Ban className="size-3.5" aria-hidden />Retraso por Websourcing</Badge>
    : <Badge variant="info"><XCircle className="size-3.5 rotate-45" aria-hidden />Esperando al cliente</Badge>;
}

/** Semáforo de tiempo de primera respuesta: verde, amarillo, rojo o gris (ya respondido). */
export function Semaforo({ totalH, restanteH }: { totalH: number; restanteH: number | null }) {
  let color = 'bg-muted-foreground'; let texto = 'Respondido';
  let tono: 'neutral' | 'success' | 'warning' | 'danger' = 'neutral';
  const f = (h: number) => (Math.abs(h) < 1 ? `${Math.round(Math.abs(h) * 60)} min` : `${Math.round(Math.abs(h) * 10) / 10} h`.replace('.', ','));
  if (restanteH === null && totalH === 0) texto = 'Siguiente planeación';
  else if (restanteH !== null) {
    const r = restanteH / totalH;
    if (restanteH < 0) { color = 'bg-danger'; tono = 'danger'; texto = `Vencida hace ${f(restanteH)}`; }
    else if (r <= 0.5) { color = 'bg-warning'; tono = 'warning'; texto = `Quedan ${f(restanteH)} hábiles`; }
    else { color = 'bg-success'; tono = 'success'; texto = `Quedan ${f(restanteH)} hábiles`; }
  }
  const txt = { neutral: 'text-muted-foreground', success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tono];
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium ${txt}`} title="Tiempo para la primera respuesta">
      <span className={`size-2.5 rounded-full ${color}`} aria-hidden />
      <span>{texto}</span>
    </span>
  );
}
