import { AlertOctagon, CheckCircle2, CircleDashed, Clock3, Eye, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { EstadoComprobante, EstadoPago } from '@/lib/supabase/tipos-dinero';
import { ETIQUETA_ESTADO_PAGO } from './formato';

export function EstadoCuotaBadge({ estado }: { estado: EstadoPago }) {
  const m = {
    pagado: ['success', CheckCircle2], en_revision: ['warning', Eye], vencido: ['danger', AlertOctagon],
    por_vencer: ['info', Clock3], pendiente: ['neutral', CircleDashed],
  } as const;
  const [v, I] = m[estado];
  return <Badge variant={v} data-estado-cuota={estado}><I className="size-3.5" aria-hidden />{ETIQUETA_ESTADO_PAGO[estado]}</Badge>;
}

export function EstadoComprobanteBadge({ estado }: { estado: EstadoComprobante }) {
  const m = {
    en_revision: ['warning', 'En revisión', Eye], confirmado: ['success', 'Confirmado', CheckCircle2], rechazado: ['danger', 'Rechazado', XCircle],
  } as const;
  const [v, t, I] = m[estado];
  return <Badge variant={v}><I className="size-3.5" aria-hidden />{t}</Badge>;
}
