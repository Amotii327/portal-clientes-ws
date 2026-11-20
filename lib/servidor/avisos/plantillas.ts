/**
 * Plantillas de los correos del portal. Texto en español, firmado "Equipo Websourcing" (por área). Nunca mencionan
 * inteligencia artificial, agentes, modelos ni herramientas internas. Funciones puras: sin red, sin base de datos.
 *
 * Los avisos de la cola traen SOLO ids, tipo y cifras/fechas del sistema. Por eso ningún correo repite el título de un
 * ticket, el texto de un mensaje, el concepto de una cuota ni el motivo de un rechazo: dicen "entra al portal" y el
 * enlace lleva a la pantalla donde esa información está protegida por la sesión de cada persona.
 */
export interface DestinatarioAviso { user_id: string; nombre: string; correo: string }
export interface AvisoReclamado {
  id: string; modulo: string; tipo: string; destino: string; referencia_id: string | null;
  empresa_id: string | null; empresa_nombre: string | null; datos: Record<string, unknown>; intentos: number;
  destinatarios: DestinatarioAviso[];
}
export interface CorreoArmado { asunto: string; texto: string; html: string }

const AREAS = ['Producto', 'Arquitectura', 'Diseño', 'Desarrollo', 'Calidad', 'Operaciones'];
export const FIRMA_TEXTO = 'Equipo Websourcing';

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const primerNombre = (n: string) => (n || '').trim().split(/\s+/)[0] || '';
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));

function dinero(valor: unknown, moneda: unknown): string {
  const n = num(valor);
  if (!Number.isFinite(n)) return '';
  const m = moneda === 'USD' ? 'USD' : 'COP';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: m, maximumFractionDigits: m === 'COP' ? 0 : 2 }).format(n);
}
function fecha(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return '';
  const [a, m, d] = v.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d)));
}
const mb = (b: unknown) => { const n = num(b); return Number.isFinite(n) ? `${(n / 1048576).toFixed(n >= 1073741824 ? 0 : 1)} MB` : ''; };

interface Cuerpo { asunto: string; parrafos: string[]; enlace?: { ruta: string; texto: string }; area?: string }

/** Qué dice cada tipo de aviso. `null` = tipo desconocido (el despachador lo omite y lo deja anotado). */
function cuerpoDe(a: AvisoReclamado): Cuerpo | null {
  const d = a.datos ?? {};
  const emp = a.empresa_nombre ? ` de ${a.empresa_nombre}` : '';
  const aEquipo = a.destino === 'super_admin' || a.destino === 'usuario';
  switch (a.tipo) {
    // ---- Dinero ----
    case 'comprobante_recibido':
      return { asunto: `Comprobante de pago por revisar${emp}`, area: 'Operaciones', parrafos: [`${a.empresa_nombre ?? 'Un cliente'} subió un comprobante de pago${d.valor ? ` por ${dinero(d.valor, d.moneda)}` : ''}. Está en revisión.`], enlace: { ruta: '/admin/finanzas', texto: 'Revisar el comprobante' } };
    case 'comprobante_confirmado':
      return { asunto: 'Confirmamos tu pago', area: 'Operaciones', parrafos: [`Revisamos tu comprobante y confirmamos el pago${d.valor ? ` de ${dinero(d.valor, d.moneda)}` : ''}. Ya quedó registrado en tu cuenta. Gracias.`], enlace: { ruta: '/cliente/dinero', texto: 'Ver mi estado de cuenta' } };
    case 'comprobante_rechazado':
      return { asunto: 'No pudimos confirmar tu comprobante', area: 'Operaciones', parrafos: ['Revisamos el comprobante que subiste y no pudimos confirmarlo. En el portal encuentras el detalle y puedes subir uno nuevo.'], enlace: { ruta: '/cliente/dinero', texto: 'Ver el detalle' } };
    case 'pago_por_vencer':
    case 'pago_vence_hoy':
    case 'pago_vencido': {
      const cuando = a.tipo === 'pago_vence_hoy' ? 'vence hoy' : a.tipo === 'pago_vencido' ? `venció el ${fecha(d.vence_el)}` : `vence el ${fecha(d.vence_el)}`;
      const monto = dinero(d.pendiente, d.moneda);
      if (a.destino === 'super_admin') return { asunto: `Pago vencido${emp}`, area: 'Operaciones', parrafos: [`Una cuota${emp}${monto ? ` por ${monto}` : ''} ${cuando} y sigue sin pagar.`], enlace: { ruta: '/admin/finanzas', texto: 'Ver los pagos' } };
      return { asunto: a.tipo === 'pago_vencido' ? 'Tienes un pago vencido' : a.tipo === 'pago_vence_hoy' ? 'Tu pago vence hoy' : 'Tu pago está por vencer', area: 'Operaciones', parrafos: [`Te recordamos que una cuota${monto ? ` por ${monto}` : ''} ${cuando}. Si ya pagaste, sube el comprobante en el portal y lo revisamos.`], enlace: { ruta: '/cliente/dinero', texto: 'Ir a mis pagos' } };
    }
    // ---- Revisiones ----
    case 'revision_publicada':
      return { asunto: 'Tienes una revisión esperando tu respuesta', area: 'Producto', parrafos: ['Publicamos una revisión para que la veas y la apruebes o nos pidas cambios.'], enlace: { ruta: '/cliente/revisiones', texto: 'Ver la revisión' } };
    case 'revision_pendiente':
      return { asunto: 'Recordatorio: tienes una revisión pendiente', area: 'Producto', parrafos: ['Tienes una revisión que lleva varios días esperando tu respuesta. Mientras no la respondas, el proyecto no avanza.'], enlace: { ruta: '/cliente/revisiones', texto: 'Responder la revisión' } };
    case 'revision_respondida':
      return { asunto: `Respondieron una revisión${emp}`, area: 'Producto', parrafos: [`El cliente respondió una revisión: ${d.decision === 'aprobada' ? 'la aprobó' : 'pidió cambios'}.`], enlace: { ruta: '/admin/aprobaciones', texto: 'Ver la respuesta' } };
    // ---- Tickets ----
    case 'ticket_urgente_nuevo':
      return { asunto: `Ticket urgente nuevo${emp}`, area: 'Operaciones', parrafos: ['Llegó un ticket marcado como urgente.'], enlace: { ruta: '/admin/tickets', texto: 'Abrir el ticket' } };
    case 'ticket_requiere_decision':
      return { asunto: `Un ticket necesita tu decisión${emp}`, area: 'Operaciones', parrafos: ['Hay un ticket fuera del plan o una solicitud de cambio esperando tu decisión: cobrar, regalar o rechazar.'], enlace: { ruta: '/admin/tickets', texto: 'Decidir' } };
    case 'ticket_mensaje_cliente':
      return { asunto: `Nuevo mensaje del cliente${emp}`, area: 'Operaciones', parrafos: ['El cliente escribió en un ticket.'], enlace: { ruta: '/admin/tickets', texto: 'Ver el mensaje' } };
    case 'ticket_cobro_aceptado':
      return { asunto: `El cliente aceptó un cobro${emp}`, area: 'Operaciones', parrafos: ['El cliente aceptó el cobro de un ticket.'], enlace: { ruta: '/admin/tickets', texto: 'Ver el ticket' } };
    case 'ticket_cobro_rechazado':
      return { asunto: `El cliente rechazó un cobro${emp}`, area: 'Operaciones', parrafos: ['El cliente rechazó el cobro de un ticket.'], enlace: { ruta: '/admin/tickets', texto: 'Ver el ticket' } };
    case 'ticket_respuesta':
      return { asunto: 'Respondimos tu ticket', area: AREAS.includes(String(d.area)) ? String(d.area) : 'Operaciones', parrafos: ['Tenemos una respuesta para tu ticket.'], enlace: { ruta: '/cliente/tickets', texto: 'Ver la respuesta' } };
    case 'ticket_estado':
      return { asunto: 'Tu ticket cambió de estado', area: 'Operaciones', parrafos: [`Tu ticket pasó a: ${estadoTicket(d.estado)}.`], enlace: { ruta: '/cliente/tickets', texto: 'Ver mi ticket' } };
    case 'ticket_decision':
      return { asunto: 'Decidimos sobre tu solicitud', area: 'Producto', parrafos: ['Revisamos tu solicitud y la vamos a atender sin costo adicional.'], enlace: { ruta: '/cliente/tickets', texto: 'Ver mi ticket' } };
    case 'ticket_cobro_pendiente': {
      const monto = dinero(d.valor, d.moneda);
      return { asunto: 'Una solicitud tuya necesita tu aprobación de cobro', area: 'Producto', parrafos: [`Tu solicitud está fuera del plan contratado${monto ? ` y tiene un valor de ${monto}` : ''}. Para empezar, necesitamos que aceptes o rechaces el cobro.`], enlace: { ruta: '/cliente/tickets', texto: 'Aceptar o rechazar el cobro' } };
    }
    // ---- Mantenimiento ----
    case 'mantenimiento_aviso_80_por_ciento':
    case 'mantenimiento_aviso_100_por_ciento': {
      const cien = a.tipo.includes('100');
      const usadas = num(d.horas_usadas); const disp = num(d.horas_disponibles);
      const detalle = Number.isFinite(usadas) && Number.isFinite(disp) ? ` Llevas ${usadas} horas usadas y te quedan ${Math.max(disp, 0)}.` : '';
      if (aEquipo) return { asunto: `Bolsa de horas ${cien ? 'agotada' : 'al 80 %'}${emp}`, area: 'Operaciones', parrafos: [`La bolsa de horas de mantenimiento${emp} ${cien ? 'llegó al 100 %' : 'llegó al 80 %'}.${detalle}`], enlace: { ruta: '/admin/mantenimiento', texto: 'Ver la bolsa' } };
      return { asunto: cien ? 'Tu bolsa de horas de mantenimiento se agotó' : 'Tu bolsa de horas de mantenimiento llegó al 80 %', area: 'Operaciones', parrafos: [`Tu bolsa de horas de este mes ${cien ? 'se agotó' : 'va en el 80 %'}.${detalle} ${cien ? 'Para seguir trabajando necesitamos tu autorización de horas extra.' : 'Si necesitas más horas, avísanos con tiempo.'}`], enlace: { ruta: '/cliente/mantenimiento', texto: 'Ver mi bolsa de horas' } };
    }
    case 'horas_extra_pendientes':
      return { asunto: 'Necesitamos tu autorización de horas extra', area: 'Operaciones', parrafos: ['Hay horas extra de mantenimiento esperando tu autorización.'], enlace: { ruta: '/cliente/mantenimiento', texto: 'Revisar las horas extra' } };
    // ---- Espacio (solicitud de cambio 5) ----
    case 'cupo_espacio_aviso':
    case 'cupo_espacio_lleno': {
      const lleno = a.tipo === 'cupo_espacio_lleno';
      const uso = `${mb(d.usado_bytes)} de ${mb(d.cupo_bytes)}`;
      if (aEquipo) return { asunto: `Espacio ${lleno ? 'lleno' : 'al 80 %'}${emp}`, area: 'Operaciones', parrafos: [`El espacio de archivos${emp} ${lleno ? 'está lleno' : 'llegó al 80 %'} (${uso}).`], enlace: { ruta: '/admin/clientes', texto: 'Ver el cliente' } };
      return { asunto: lleno ? 'El espacio de tu empresa está lleno' : 'El espacio de tu empresa llegó al 80 %', area: 'Operaciones', parrafos: [lleno ? `Tu espacio de archivos está lleno (${uso}) y no se pueden subir archivos nuevos hasta liberar espacio o ampliar el cupo.` : `Tu espacio de archivos llegó al 80 % (${uso}). Cuando se llene no podrás subir archivos nuevos. Escríbenos si necesitas más espacio.`], enlace: { ruta: '/cliente/documentos', texto: 'Ver mis archivos' } };
    }
    default:
      return null;
  }
}

function estadoTicket(e: unknown): string {
  const t: Record<string, string> = { nuevo: 'nuevo', clasificado: 'clasificado', en_progreso: 'en progreso', esperando_cliente: 'esperando tu respuesta', resuelto: 'resuelto', cerrado: 'cerrado' };
  return typeof e === 'string' && t[e] ? t[e] : 'actualizado';
}

function envolver(nombre: string, c: Cuerpo, enlace: string | null): CorreoArmado {
  const saludo = nombre ? `Hola, ${primerNombre(nombre)}.` : 'Hola.';
  const firma = c.area ? `${FIRMA_TEXTO} · ${c.area}` : FIRMA_TEXTO;
  const texto = [saludo, '', ...c.parrafos, ...(enlace && c.enlace ? ['', `${c.enlace.texto}: ${enlace}`] : []), '', 'Un abrazo,', firma].join('\n');
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1d2330">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:28px">
<tr><td style="font-size:16px;line-height:24px">
<p style="margin:0 0 16px">${escapar(saludo)}</p>
${c.parrafos.map((p) => `<p style="margin:0 0 16px">${escapar(p)}</p>`).join('\n')}
${enlace && c.enlace ? `<p style="margin:24px 0"><a href="${escapar(enlace)}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">${escapar(c.enlace.texto)}</a></p>` : ''}
<p style="margin:24px 0 0;color:#4b5563">Un abrazo,<br>${escapar(firma)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { asunto: c.asunto, texto, html };
}

/** Arma el correo de un aviso de la cola para UNA persona. `sitio` = NEXT_PUBLIC_SITE_URL (sin barra final). */
export function armarCorreoDeAviso(a: AvisoReclamado, d: DestinatarioAviso, sitio: string): CorreoArmado | null {
  const c = cuerpoDe(a);
  if (!c) return null;
  return envolver(d.nombre, c, c.enlace ? `${sitio}${c.enlace.ruta}` : null);
}

/** Correos con enlace de un solo uso: el enlace (con su token) existe solo en el servidor y no pasa por la cola. */
export function armarCorreoInvitacion(enlace: string, venceEn: string): CorreoArmado {
  const vence = fecha(venceEn);
  return envolver('', {
    asunto: 'Te invitamos al portal de clientes de Websourcing', area: 'Producto',
    parrafos: ['Te invitamos a entrar al portal de clientes de Websourcing, donde puedes ver el avance de tus proyectos, revisar entregas, consultar tus pagos y escribirnos.', `Para activar tu cuenta usa el botón de abajo${vence ? ` (el enlace vence el ${vence})` : ''}. Es personal: no lo compartas.`],
    enlace: { ruta: '', texto: 'Activar mi cuenta' },
  }, enlace);
}
export function armarCorreoRecuperarClave(enlace: string): CorreoArmado {
  return envolver('', {
    asunto: 'Cambia tu contraseña del portal de Websourcing', area: 'Operaciones',
    parrafos: ['Recibimos una solicitud para cambiar la contraseña de tu cuenta del portal. Usa el botón de abajo para elegir una nueva. El enlace vence pronto y solo sirve una vez.', 'Si no fuiste tú, ignora este mensaje: tu contraseña no cambia.'],
    enlace: { ruta: '', texto: 'Cambiar mi contraseña' },
  }, enlace);
}
export const TIPOS_CON_PLANTILLA = [
  'comprobante_recibido', 'comprobante_confirmado', 'comprobante_rechazado', 'pago_por_vencer', 'pago_vence_hoy', 'pago_vencido',
  'revision_publicada', 'revision_pendiente', 'revision_respondida',
  'ticket_urgente_nuevo', 'ticket_requiere_decision', 'ticket_mensaje_cliente', 'ticket_cobro_aceptado', 'ticket_cobro_rechazado',
  'ticket_respuesta', 'ticket_estado', 'ticket_decision', 'ticket_cobro_pendiente',
  'mantenimiento_aviso_80_por_ciento', 'mantenimiento_aviso_100_por_ciento', 'horas_extra_pendientes', 'cupo_espacio_aviso', 'cupo_espacio_lleno',
] as const;
