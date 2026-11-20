import { NextResponse } from 'next/server';
import { revisarCron } from '@/lib/servidor/avisos/cron';
import { tareasDiarias } from '@/lib/servidor/avisos/despachar';

/**
 * Tareas diarias de la base (una vez al día, por ejemplo 6:00 a. m. hora de Colombia):
 * recordatorios de pago y de revisiones, marca de archivos de proyectos cerrados hace más de 30 días y resumen del
 * registro de actividad. Mismo secreto que el despachador (CRON_SECRETO). No mueve ni borra archivos.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const g = revisarCron(request);
  if (!g.ok) return NextResponse.json({ error: g.estado === 503 ? 'no_configurado' : 'no_autorizado' }, { status: g.estado, headers: { 'Cache-Control': 'no-store' } });
  try {
    return NextResponse.json(await tareasDiarias(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'fallo_de_las_tareas' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
