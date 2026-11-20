import 'server-only';
import { crearClienteSistema, type ClienteSistema } from './sistema';
import { armarCorreoDeAviso, type AvisoReclamado } from './plantillas';
import { enviarPorResend, hayProveedorDeCorreo } from './resend';

/**
 * DESPACHADOR de avisos: vacía la cola unica `avisos_salientes`.
 *  1. Sin RESEND_API_KEY: solo marca los avisos que ya tocan como "pendiente_sin_proveedor" (no envía nada, no gasta intentos;
 *     salen solos cuando exista el proveedor).
 *  2. Con proveedor: reclama un lote (la base los pasa a "enviando" por 10 minutos y evita que dos corridas tomen los mismos),
 *     arma el correo de cada destinatario con las plantillas y lo envía por Resend.
 *  3. Cada resultado se anota: "enviado"; "error" (la base reprograma con espera creciente y al 5.o intento lo deja
 *     "fallido"); "omitido" si no hay a quién avisarle o el tipo no tiene plantilla.
 * Usa la clave de sistema, pero SOLO llama a las funciones reclamar_avisos / marcar_aviso / marcar_avisos_sin_proveedor.
 * Un aviso con varios destinatarios se marca "enviado" cuando salió a TODOS; si uno falla, se reintenta el aviso completo
 * (Resend recibe una clave de idempotencia por aviso y destinatario, así que quien ya lo recibió no lo recibe doble).
 */
export interface ResumenDespacho {
  proveedor: boolean;
  reclamados: number; enviados: number; omitidos: number; conError: number; sinProveedor: number;
}

const sitio = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

export async function despacharAvisos(opciones: { limite?: number; cliente?: ClienteSistema } = {}): Promise<ResumenDespacho> {
  const c = opciones.cliente ?? crearClienteSistema();
  const resumen: ResumenDespacho = { proveedor: hayProveedorDeCorreo(), reclamados: 0, enviados: 0, omitidos: 0, conError: 0, sinProveedor: 0 };

  if (!resumen.proveedor) {
    const { data, error } = await c.rpc('marcar_avisos_sin_proveedor');
    if (error) throw new Error('No se pudo marcar los avisos sin proveedor.');
    resumen.sinProveedor = Number(data ?? 0);
    return resumen;
  }

  const { data, error } = await c.rpc('reclamar_avisos', { p_limite: opciones.limite ?? 25 });
  if (error) throw new Error('No se pudo reclamar el lote de avisos.');
  const lote = (data ?? []) as AvisoReclamado[];
  resumen.reclamados = lote.length;

  for (const aviso of lote) {
    const marcar = (resultado: 'enviado' | 'error' | 'omitido' | 'sin_proveedor', codigo?: string) =>
      c.rpc('marcar_aviso', { p_id: aviso.id, p_resultado: resultado, p_error: codigo ?? null });
    try {
      if (aviso.destinatarios.length === 0) { await marcar('omitido', 'sin_destinatarios'); resumen.omitidos++; continue; }
      let fallo: string | null = null;
      let sinProv = false;
      let armados = 0;
      for (const d of aviso.destinatarios) {
        const correo = armarCorreoDeAviso(aviso, d, sitio());
        if (!correo) break;
        armados++;
        const r = await enviarPorResend({ para: d.correo, asunto: correo.asunto, texto: correo.texto, html: correo.html, claveIdempotencia: `${aviso.id}:${d.user_id}` });
        if (!r.ok) { if (r.codigo === 'sin_proveedor') sinProv = true; else fallo = r.codigo; break; }
      }
      if (armados === 0) { await marcar('omitido', 'tipo_sin_plantilla'); resumen.omitidos++; }
      else if (sinProv) { await marcar('sin_proveedor'); resumen.sinProveedor++; }
      else if (fallo) { await marcar('error', fallo); resumen.conError++; }
      else { await marcar('enviado'); resumen.enviados++; }
    } catch {
      // Cualquier fallo inesperado se anota como error genérico (sin el mensaje, que podría traer datos) y sigue el lote.
      try { await marcar('error', 'fallo_inesperado'); } catch { /* si tampoco se puede anotar, la base lo vuelve a ofrecer a los 10 minutos */ }
      resumen.conError++;
    }
  }
  return resumen;
}

/** Tareas que la base genera cada día (recordatorios de pago y de revisiones, y el archivo de lo viejo). Clave de sistema. */
export async function tareasDiarias(cliente?: ClienteSistema) {
  const c = cliente ?? crearClienteSistema();
  const correr = async (nombre: string) => {
    const { data, error } = await c.rpc(nombre);
    return error ? { ok: false as const } : { ok: true as const, resultado: data };
  };
  return {
    recordatoriosPago: await correr('generar_recordatorios_pago'),
    recordatoriosRevisiones: await correr('generar_recordatorios_revisiones'),
    marcarParaArchivar: await correr('marcar_para_archivar'),
    resumenRegistro: await correr('resumir_registro_actividad'),
  };
}
