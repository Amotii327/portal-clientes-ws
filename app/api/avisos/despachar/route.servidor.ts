import { NextResponse } from 'next/server';
import { revisarCron } from '@/lib/servidor/avisos/cron';
import { despacharAvisos } from '@/lib/servidor/avisos/despachar';

/**
 * Despachador de avisos por correo. Lo llama el cron del VPS cada pocos minutos:
 *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRETO" https://<portal>/api/avisos/despachar
 * Protegido con CRON_SECRETO (variable de entorno, nunca en el repositorio). No lleva datos de entrada.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const g = revisarCron(request);
  if (!g.ok) return NextResponse.json({ error: g.estado === 503 ? 'no_configurado' : 'no_autorizado' }, { status: g.estado, headers: { 'Cache-Control': 'no-store' } });
  try {
    const resumen = await despacharAvisos();
    return NextResponse.json(resumen, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Sin detalles al exterior (podrían traer datos); el servidor ya sabe cuál fue.
    return NextResponse.json({ error: 'fallo_del_despachador' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
