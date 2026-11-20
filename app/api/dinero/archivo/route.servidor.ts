import { NextResponse } from 'next/server';
import { procesarArchivoDinero } from '@/lib/servidor/archivos-dinero';

export const dynamic = 'force-dynamic';

/**
 * Subida de comprobantes y facturas (Módulo 4). Es una ruta y no una acción de servidor porque los archivos pueden pesar
 * hasta 20 MB. Solo acepta peticiones del mismo sitio; la sesión y los permisos los decide la base.
 */
export async function POST(req: Request) {
  const origen = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origen && host && new URL(origen).host !== host) return NextResponse.json({ ok: false, mensaje: 'Petición no permitida.' }, { status: 403 });
  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ ok: false, mensaje: 'No pudimos leer el archivo. Intenta de nuevo.' }, { status: 400 }); }
  const { status, cuerpo } = await procesarArchivoDinero(fd);
  return NextResponse.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });
}
