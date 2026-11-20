// Extensión del Supabase SIMULADO para Tickets (módulo 5) y Mantenimiento (módulo 10).
// Imita las reglas de docs/matriz-permisos-tickets-mant.md en lo que usan las pantallas. Datos inventados.
// servidor.mjs la llama en tres puntos: sembrar (al reiniciar), leer (tablas), rpc (funciones) y almacenamiento (Storage).
import crypto from 'node:crypto';

export const NO_ES_MIO = Symbol('no_es_mio');
const uuid = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();
const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const AREAS = ['Producto', 'Arquitectura', 'Diseño', 'Desarrollo', 'Calidad', 'Operaciones'];
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg', 'audio/webm'];
const PLAZO = { urgente: 120, alta: 600, normal: 1200, baja: null };

export function sembrar(S, { usuario, miembro, emp }) {
  const A = S.E.A;
  const C = '33333333-3333-4333-8333-333333333333';
  S.E.C = C;
  emp(C, 'Tercera Empresa S.A.S.', '901000111-2', 'activa');
  const uAdmin = S.usuarios['admin@cliente.test'].id; const uEq = S.usuarios['equipo@cliente.test'].id; const uDin = S.usuarios['equipo-dinero@cliente.test'].id;
  const uTodos = usuario('equipo-todos@cliente.test', 'Equipo Con Todos');
  miembro(uTodos, A, 'equipo', { ver_todos_tickets: true });
  const uC = usuario('admin@otra.test', 'Admin Tercera');
  miembro(uC, C, 'admin_cliente');
  const tm = (S.tm = { tickets: [], mensajes: [], adjuntos: [], archivos: {}, planes: [], historial: [], bolsas: [], avisos: [], horas: [], notas: [], garantias: [], proyectos: [], rechazos: [], base: [], n: { [A]: 0, [C]: 0 } });
  tm.proyectos.push({ id: '44444444-4444-4444-8444-444444444444', empresa_id: A, nombre: 'Portal de ventas', estado: 'activo' });
  tm.base = ['basico', 'estandar', 'premium'].map((plan, i) => ({ plan, parametros: { horas_mes: [4, 8, 16][i], acumular_horas: false, revisiones_por_semana: [1, 2, 2][i], copias_frecuencia: 'diaria', parches_frecuencia: ['mensual', 'quincenal', 'semanal'][i], auditoria: i === 2, auditoria_cada_meses: i === 2 ? 3 : null, reuniones_por_mes: i, reporte_tipo: 'resumido', servidores_incluidos: false, incluye: ['correccion_errores', 'copias_seguridad', 'monitoreo'] }, nota: 'Valores de partida.', actualizado_en: ahora(), actualizado_por: null }));
  // Plan activo de la empresa A (la C no tiene mantenimiento).
  const planId = uuid();
  tm.planes.push({ id: planId, empresa_id: A, activo: true, plan_base: 'estandar', fecha_inicio: '2026-10-01', fecha_fin: null, renovacion_automatica: true, moneda: 'COP', cuota_mensual: 600000, horas_mes: 8, acumular_horas: false, revisiones_por_semana: 2, dias_atencion: [1, 2, 3, 4, 5], horario_desde: '08:00:00', horario_hasta: '18:00:00', zona_horaria: 'America/Bogota', tiempos_respuesta: { urgente: { horas_habiles: 1 }, alta: { horas_habiles: 4 }, normal: { dias_habiles: 1 } }, copias_frecuencia: 'diaria', parches_frecuencia: 'quincenal', auditoria: false, auditoria_cada_meses: null, reuniones_por_mes: 1, reporte_tipo: 'resumido', servidores_incluidos: false, servidores_costo_mensual: 120000, incluye: ['correccion_errores', 'copias_seguridad', 'monitoreo'], incluye_otros: 'Soporte por correo', valor_hora_extra: 90000, proxima_revision: '2026-12-03', activado_en: ahora(), activado_por: null, apagado_en: null, apagado_por: null, creado_en: ahora(), actualizado_en: ahora() });
  tm.historial.push({ id: uuid(), empresa_id: A, plan_id: planId, tipo: 'activacion', parametros_anteriores: {}, parametros_nuevos: {}, motivo: 'Activación del mantenimiento', efectivo_desde: '2026-10-01', aplicado_en: ahora(), error_aplicacion: null, creado_por: null, creado_en: '2026-10-01T10:00:00Z' });
  const bolsaId = uuid();
  tm.bolsas.push({ id: bolsaId, empresa_id: A, plan_id: planId, mes: hoy().slice(0, 7) + '-01', horas_incluidas: 8, horas_arrastradas: 0, horas_usadas: 6.5, horas_extra: 0, extra_autorizado: false });
  tm.garantias.push({ id: uuid(), empresa_id: A, proyecto_id: null, inicia_en: '2026-08-01', vence_en: '2026-08-31', nota: 'Garantía de la entrega', creado_por: null, creado_en: ahora(), actualizado_en: ahora() });

  const t = (empresa, creador, d) => {
    tm.n[empresa] += 1;
    const x = { id: uuid(), empresa_id: empresa, numero: tm.n[empresa], proyecto_id: null, tipo: 'error', tipo_original: null, titulo: '', detalle: 'Detalle de ejemplo del ticket para la prueba.', prioridad_propuesta: 'normal', prioridad: 'normal', estado: 'clasificado', creado_por: creador, miembro_id: uuid(), fuera_de_plan: false, motivo_fuera_de_plan: null, sla_origen: 'predeterminado', plazo_habil_minutos: 1200, vence_primera_respuesta: null, primera_respuesta_en: null, clasificado_en: null, resuelto_en: null, cerrado_en: null, resolucion: null, cierre_motivo: null, decision_dueno: null, decision_motivo: null, decision_en: null, decision_por: null, cobro_valor: null, cobro_moneda: null, cobro_aceptado_en: null, cobro_aceptado_por: null, cobro_rechazado_en: null, calificacion: null, calificacion_comentario: null, calificado_en: null, creado_en: hace(300), actualizado_en: ahora(), _resta: 600, ...d };
    tm.tickets.push(x); return x;
  };
  const t1 = t(A, uAdmin, { titulo: 'No llega el correo de confirmación', prioridad: 'alta', prioridad_propuesta: 'alta', estado: 'en_progreso', primera_respuesta_en: hace(200), proyecto_id: tm.proyectos[0].id });
  const t2 = t(A, uEq, { titulo: 'Pregunta sobre el reporte de ventas', tipo: 'pregunta', estado: 'nuevo', prioridad: null, _resta: 900, plazo_habil_minutos: 1200 });
  const t3 = t(A, uAdmin, { titulo: 'Agregar exportación a Excel', tipo: 'solicitud_cambio', estado: 'clasificado', _resta: 200, plazo_habil_minutos: 1200 });
  const t4 = t(A, uDin, { titulo: 'El botón de pago se queda cargando', estado: 'resuelto', primera_respuesta_en: hace(250), resolucion: 'Corregimos el tiempo de espera del botón de pago.', resuelto_en: hace(30) });
  const t5 = t(A, uAdmin, { titulo: 'Nuevo módulo de cupones', tipo: 'solicitud_cambio', estado: 'esperando_cliente', decision_dueno: 'cobrar', decision_motivo: 'Incluye pantalla nueva y pruebas', cobro_valor: 450000, cobro_moneda: 'COP', primera_respuesta_en: hace(100) });
  const t6 = t(A, uAdmin, { titulo: 'Cambiar el logo del encabezado', estado: 'cerrado', primera_respuesta_en: hace(290), cerrado_en: hace(10), cierre_motivo: 'confirmado_cliente' });
  const t7 = t(C, uC, { titulo: 'Ticket de otra empresa', creado_en: hace(250), prioridad: 'urgente', prioridad_propuesta: 'urgente', _resta: 60, plazo_habil_minutos: 120 });
  void t2; void t3; void t5; void t6; void t7;
  const m = (ticket, d) => tm.mensajes.push({ id: uuid(), empresa_id: ticket.empresa_id, ticket_id: ticket.id, autor_id: null, autor_tipo: 'cliente', area: null, texto: '', interno: false, retirado_en: null, retirado_por: null, creado_en: ahora(), ...d });
  m(t1, { autor_tipo: 'websourcing', area: 'Desarrollo', texto: 'Estamos revisando el servicio de correo. Te contamos en breve.', creado_en: hace(200) });
  m(t1, { autor_tipo: 'websourcing', interno: true, texto: 'Nota interna: parece un problema del proveedor.', creado_en: hace(190) });
  m(t1, { autor_id: uAdmin, texto: 'Gracias, quedamos atentos.', creado_en: hace(150) });
  const adj = uuid(); const ruta = `${A}/${t1.id}/${adj}-pantallazo.png`;
  tm.adjuntos.push({ id: adj, empresa_id: A, ticket_id: t1.id, mensaje_id: null, subido_por: uAdmin, nombre_original: 'pantallazo.png', mime: 'image/png', tamano_bytes: 68, storage_path: ruta, creado_en: hace(290) });
  tm.archivos[ruta] = { mime: 'image/png', bytes: PNG };
  const h = (ticket, horas, estado, nota) => { const id = uuid(); tm.horas.push({ id, empresa_id: A, ticket_id: ticket.id, bolsa_id: bolsaId, origen_id: null, mes: tm.bolsas[0].mes, fecha_trabajo: hoy(), horas, estado, sin_descuento: false, registrado_por: uAdmin, registrado_en: ahora(), revisado_por: null, revisado_en: null, motivo_revision: null, decidido_cliente_por: null, decidido_cliente_en: null, actualizado_en: ahora() }); if (nota) tm.notas.push({ hora_id: id, empresa_id: A, nota, creado_en: ahora() }); return id; };
  h(t1, 6.5, 'aprobada'); h(t4, 1, 'pendiente_dueno', 'Revisión del botón de pago');
  tm.avisos.push({ id: uuid(), empresa_id: A, bolsa_id: bolsaId, tipo: '80_por_ciento', porcentaje: 81.25, horas_usadas: 6.5, horas_disponibles: 1.5, creado_en: ahora() });
}

function semaforo(t) {
  if (t.estado === 'cerrado') return { semaforo: 'cerrado', minutos: null };
  if (t.primera_respuesta_en) return { semaforo: t.primera_respuesta_en <= (t.vence_primera_respuesta ?? '9') ? 'cumplido' : 'incumplido', minutos: null };
  if (t.plazo_habil_minutos === null || (t.prioridad ?? t.prioridad_propuesta) === 'baja') return { semaforo: 'sin_plazo', minutos: null };
  const r = t._resta;
  return { semaforo: r < 0 ? 'rojo' : r <= t.plazo_habil_minutos / 2 ? 'amarillo' : 'verde', minutos: r };
}
const quitarInternos = (t) => { const { _resta, ...r } = t; return r; };

function ve(c, t) {
  if (c.estado === 'super_admin') return true;
  if (c.empresa?.id !== t.empresa_id) return false;
  return c.rol === 'admin_cliente' || c.permisos?.ver_todos_tickets || t.creado_por === c.user_id;
}
const planActivoDe = (S, empresa) => S.tm.planes.find((p) => p.empresa_id === empresa && p.activo);

export function leer(S, tabla, c) {
  const tm = S.tm; const esSuper = c.estado === 'super_admin'; const eid = c.empresa?.id; const admin = c.rol === 'admin_cliente';
  const visibles = () => tm.tickets.filter((t) => ve(c, t));
  switch (tabla) {
    case 'tickets': return visibles().map(quitarInternos);
    case 'ticket_mensajes': { const ids = new Set(visibles().map((t) => t.id)); return tm.mensajes.filter((x) => ids.has(x.ticket_id) && (esSuper || !x.interno)); }
    case 'ticket_adjuntos': { const ids = new Set(visibles().map((t) => t.id)); return tm.adjuntos.filter((a) => ids.has(a.ticket_id) && (esSuper || !tm.mensajes.find((m) => m.id === a.mensaje_id)?.interno)); }
    case 'tickets_semaforo': return visibles().map((t) => { const s = semaforo(t); return { ticket_id: t.id, empresa_id: t.empresa_id, numero: t.numero, estado: t.estado, prioridad: t.prioridad, prioridad_propuesta: t.prioridad_propuesta, vence_primera_respuesta: t.vence_primera_respuesta, primera_respuesta_en: t.primera_respuesta_en, sla_origen: t.sla_origen, semaforo: s.semaforo, minutos_habiles_restantes: s.minutos }; });
    case 'proyectos': return tm.proyectos.filter((p) => esSuper || p.empresa_id === eid);
    case 'garantias': return tm.garantias.filter((g) => esSuper || g.empresa_id === eid);
    case 'planes_base_mantenimiento': return esSuper ? tm.base : [];
    case 'planes_mantenimiento': return tm.planes.filter((p) => esSuper || (admin && p.empresa_id === eid && p.activo));
    case 'planes_mantenimiento_historial': return esSuper ? [...tm.historial].reverse() : [];
    case 'bolsa_mensual_resumen': return tm.bolsas.filter((b) => esSuper || (admin && b.empresa_id === eid && planActivoDe(S, eid))).map((b) => { const tot = b.horas_incluidas + b.horas_arrastradas; return { bolsa_id: b.id, empresa_id: b.empresa_id, plan_id: b.plan_id, mes: b.mes, horas_incluidas: b.horas_incluidas, horas_arrastradas: b.horas_arrastradas, horas_usadas: b.horas_usadas, horas_extra: b.horas_extra, horas_disponibles: Math.max(0, tot - b.horas_usadas), porcentaje_usado: tot > 0 ? Math.round((b.horas_usadas * 10000) / tot) / 100 : 100, extra_autorizado: b.extra_autorizado, aviso_80_en: null, aviso_100_en: null, cerrada_en: null, horas_perdidas: null, horas_acumuladas: null }; });
    case 'bolsa_avisos': return tm.avisos.filter((a) => esSuper || (admin && a.empresa_id === eid && planActivoDe(S, eid)));
    case 'horas_registradas': return tm.horas.filter((h) => esSuper || (admin && h.empresa_id === eid && planActivoDe(S, eid) && !['pendiente_dueno', 'rechazada'].includes(h.estado)));
    case 'horas_notas_internas': return esSuper ? tm.notas : [];
    default: return null;
  }
}

export function insertar(S, tabla, body, c, falla) {
  if (tabla === 'garantias') {
    if (c.estado !== 'super_admin') return falla('no_autorizado');
    if (!body.vence_en || body.vence_en < body.inicia_en) return falla('datos_invalidos');
    S.tm.garantias.push({ id: uuid(), proyecto_id: null, nota: null, creado_por: c.user_id, creado_en: ahora(), actualizado_en: ahora(), ...body });
    return true;
  }
  return NO_ES_MIO;
}

export function rpc(S, nombre, a, c, falla) {
  const tm = S.tm; const esSuper = c.estado === 'super_admin'; const miembroOk = c.estado === 'activo'; const admin = miembroOk && c.rol === 'admin_cliente';
  const ticket = (id) => { const t = tm.tickets.find((x) => x.id === id); return t && ve(c, t) ? t : null; };
  const guardar = (t) => { t.actualizado_en = ahora(); };
  switch (nombre) {
    case 'mi_mantenimiento_activo': return !!(c.empresa && planActivoDe(S, c.empresa.id));
    case 'anotar_rechazo': tm.rechazos.push({ accion: a.p_accion, codigo: a.p_codigo }); return null;
    case 'crear_ticket': {
      if (!miembroOk) return falla('no_autorizado');
      if (!['error', 'solicitud_cambio', 'pregunta', 'acceso'].includes(a.p_tipo) || !['urgente', 'alta', 'normal', 'baja'].includes(a.p_prioridad ?? 'normal') || (a.p_titulo ?? '').trim().length < 3 || !(a.p_detalle ?? '').trim()) return falla('datos_invalidos');
      if (a.p_proyecto_id && !tm.proyectos.some((p) => p.id === a.p_proyecto_id && p.empresa_id === c.empresa.id)) return falla('proyecto_no_disponible');
      const pri = a.p_prioridad ?? 'normal';
      tm.n[c.empresa.id] = (tm.n[c.empresa.id] ?? 0) + 1;
      const plan = planActivoDe(S, c.empresa.id);
      const fuera = a.p_tipo === 'error' && !plan;
      const garantia = tm.garantias.some((g) => g.empresa_id === c.empresa.id && g.vence_en >= hoy());
      const fp = fuera && !garantia;
      const t = { id: uuid(), empresa_id: c.empresa.id, numero: tm.n[c.empresa.id], proyecto_id: a.p_proyecto_id ?? null, tipo: a.p_tipo, tipo_original: null, titulo: a.p_titulo.trim(), detalle: a.p_detalle.trim(), prioridad_propuesta: pri, prioridad: null, estado: 'nuevo', creado_por: c.user_id, miembro_id: uuid(), fuera_de_plan: fp, motivo_fuera_de_plan: fp ? 'sin_mantenimiento' : null, sla_origen: plan ? 'mantenimiento' : 'predeterminado', plazo_habil_minutos: PLAZO[pri], vence_primera_respuesta: null, primera_respuesta_en: null, clasificado_en: null, resuelto_en: null, cerrado_en: null, resolucion: null, cierre_motivo: null, decision_dueno: null, decision_motivo: null, decision_en: null, decision_por: null, cobro_valor: null, cobro_moneda: null, cobro_aceptado_en: null, cobro_aceptado_por: null, cobro_rechazado_en: null, calificacion: null, calificacion_comentario: null, calificado_en: null, creado_en: ahora(), actualizado_en: ahora(), _resta: PLAZO[pri] };
      tm.tickets.push(t);
      return { ticket_id: t.id, numero: t.numero, fuera_de_plan: fp, motivo_fuera_de_plan: t.motivo_fuera_de_plan, vence_primera_respuesta: null };
    }
    case 'responder_ticket': {
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (!(a.p_texto ?? '').trim()) return falla('datos_invalidos');
      if (t.estado === 'cerrado') return falla('ticket_cerrado');
      const interno = !!a.p_interno;
      if (esSuper && !interno && !AREAS.includes(a.p_area)) return falla('area_invalida');
      if (!esSuper && interno) return falla('no_autorizado');
      const m = { id: uuid(), empresa_id: t.empresa_id, ticket_id: t.id, autor_id: esSuper ? null : c.user_id, autor_tipo: esSuper ? 'websourcing' : 'cliente', area: esSuper && !interno ? a.p_area : null, texto: a.p_texto.trim(), interno, retirado_en: null, retirado_por: null, creado_en: ahora() };
      tm.mensajes.push(m);
      if (esSuper && !interno && !t.primera_respuesta_en) t.primera_respuesta_en = ahora();
      if (!esSuper && t.estado === 'esperando_cliente') t.estado = 'en_progreso';
      guardar(t); return { mensaje_id: m.id };
    }
    case 'retirar_texto_mensaje': {
      if (!esSuper) return falla('no_autorizado');
      const m = tm.mensajes.find((x) => x.id === a.p_mensaje_id); if (!m) return falla('mensaje_no_encontrado');
      if (m.retirado_en) return falla('mensaje_ya_retirado');
      m.retirado_en = ahora(); m.texto = ''; return null;
    }
    case 'preparar_adjunto_ticket': {
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (!MIMES.includes(a.p_mime) || !(a.p_tamano_bytes > 0) || a.p_tamano_bytes > 52428800) return falla('adjunto_invalido');
      if (tm.adjuntos.filter((x) => x.ticket_id === t.id).length >= 30) return falla('demasiados_adjuntos');
      const id = uuid(); const ruta = `${t.empresa_id}/${t.id}/${id}-${String(a.p_nombre).replace(/[^\w.-]/g, '_')}`;
      tm.adjuntos.push({ id, empresa_id: t.empresa_id, ticket_id: t.id, mensaje_id: a.p_mensaje_id ?? null, subido_por: c.user_id, nombre_original: a.p_nombre, mime: a.p_mime, tamano_bytes: a.p_tamano_bytes, storage_path: ruta, creado_en: ahora() });
      return { adjunto_id: id, bucket: 'portal-tickets', ruta };
    }
    case 'clasificar_ticket': {
      if (!esSuper) return falla('no_autorizado');
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (t.estado === 'cerrado') return falla('ticket_cerrado');
      t.prioridad = a.p_prioridad; t.plazo_habil_minutos = PLAZO[a.p_prioridad]; if (a.p_tipo) t.tipo = a.p_tipo;
      if (t.estado === 'nuevo') { t.estado = 'clasificado'; t.clasificado_en = ahora(); }
      guardar(t); return { ticket_id: t.id };
    }
    case 'cambiar_estado_ticket': {
      if (!esSuper) return falla('no_autorizado');
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (t.estado === 'cerrado') return falla('ticket_cerrado');
      if (!['en_progreso', 'esperando_cliente', 'resuelto', 'cerrado'].includes(a.p_estado)) return falla('transicion_invalida');
      if (a.p_estado === 'en_progreso' && (t.tipo === 'solicitud_cambio' || t.fuera_de_plan) && !t.decision_dueno) return falla('ticket_requiere_decision');
      if (a.p_estado === 'resuelto' && !(a.p_resolucion ?? '').trim()) return falla('resolucion_requerida');
      t.estado = a.p_estado; if (a.p_estado === 'resuelto') { t.resolucion = a.p_resolucion.trim(); t.resuelto_en = ahora(); }
      if (a.p_estado === 'cerrado') { t.cerrado_en = ahora(); t.cierre_motivo = 'cerrado_por_websourcing'; }
      guardar(t); return { ticket_id: t.id, estado: t.estado };
    }
    case 'marcar_solicitud_cambio': {
      if (!esSuper) return falla('no_autorizado');
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (t.tipo === 'solicitud_cambio') return falla('ya_es_solicitud_cambio');
      t.tipo_original = t.tipo; t.tipo = 'solicitud_cambio'; t.fuera_de_plan = false; t.motivo_fuera_de_plan = null;
      if (['en_progreso', 'esperando_cliente'].includes(t.estado)) t.estado = 'clasificado';
      guardar(t); return { ticket_id: t.id, tipo: t.tipo };
    }
    case 'decidir_ticket': {
      if (!esSuper) return falla('no_autorizado');
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (t.estado === 'cerrado') return falla('ticket_cerrado');
      if (!(t.tipo === 'solicitud_cambio' || t.fuera_de_plan)) return falla('decision_no_aplica');
      if (!['cobrar', 'regalar', 'rechazar'].includes(a.p_decision)) return falla('decision_invalida');
      if (a.p_decision === 'cobrar' && ['en_progreso', 'esperando_cliente', 'resuelto'].includes(t.estado)) return falla('ticket_en_progreso');
      if (a.p_decision === 'cobrar' && !(a.p_valor > 0)) return falla('valor_cobro_requerido');
      if (a.p_decision === 'rechazar' && (a.p_motivo ?? '').trim().length < 3) return falla('motivo_requerido');
      t.decision_dueno = a.p_decision; t.decision_motivo = a.p_motivo ?? null; t.decision_en = ahora();
      if (a.p_decision === 'cobrar') { t.cobro_valor = a.p_valor; t.cobro_moneda = a.p_moneda ?? 'COP'; t.estado = 'esperando_cliente'; }
      if (a.p_decision === 'regalar') t.estado = 'en_progreso';
      if (a.p_decision === 'rechazar') { t.estado = 'cerrado'; t.cerrado_en = ahora(); t.cierre_motivo = 'rechazado'; }
      guardar(t); return { ticket_id: t.id };
    }
    case 'aceptar_cobro_ticket':
    case 'rechazar_cobro_ticket': {
      if (!admin) return falla('no_autorizado');
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (t.decision_dueno !== 'cobrar') return falla('cobro_no_aplica');
      if (t.cobro_aceptado_en) return falla('cobro_ya_aceptado');
      if (nombre === 'aceptar_cobro_ticket') { t.cobro_aceptado_en = ahora(); t.cobro_aceptado_por = c.user_id; t.estado = 'en_progreso'; }
      else { t.cobro_rechazado_en = ahora(); t.estado = 'cerrado'; t.cerrado_en = ahora(); t.cierre_motivo = 'cobro_rechazado'; }
      guardar(t); return { ticket_id: t.id };
    }
    case 'confirmar_resolucion': {
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (!admin && t.creado_por !== c.user_id) return falla('no_autorizado');
      if (t.estado !== 'resuelto') return falla('ticket_no_resuelto');
      t.estado = 'cerrado'; t.cerrado_en = ahora(); t.cierre_motivo = 'confirmado_cliente'; guardar(t); return { ticket_id: t.id };
    }
    case 'calificar_ticket': {
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (!admin && t.creado_por !== c.user_id) return falla('no_autorizado');
      if (!(a.p_estrellas >= 1 && a.p_estrellas <= 5)) return falla('calificacion_invalida');
      if (t.estado !== 'cerrado') return falla('ticket_no_cerrado');
      if (t.calificacion) return falla('ya_calificado');
      t.calificacion = a.p_estrellas; t.calificacion_comentario = a.p_comentario ?? null; t.calificado_en = ahora(); guardar(t); return { ticket_id: t.id };
    }
    // ---------- Mantenimiento ----------
    case 'activar_mantenimiento': {
      if (!esSuper) return falla('no_autorizado');
      let p = tm.planes.find((x) => x.empresa_id === a.p_empresa_id);
      if (p?.activo) return falla('mantenimiento_ya_activo');
      const base = tm.base.find((b) => b.plan === a.p_plan_base)?.parametros ?? {};
      const par = { ...base, ...(a.p_parametros ?? {}) };
      if (a.p_plan_base === 'personalizado' && !(par.horas_mes > 0)) return falla('horas_requeridas');
      if (!(par.cuota_mensual > 0)) return falla('cuota_requerida');
      if (!par.fecha_inicio) return falla('fecha_inicio_requerida');
      if (!p) { p = { id: uuid(), empresa_id: a.p_empresa_id, plan_base: 'personalizado', fecha_fin: null, renovacion_automatica: true, moneda: 'COP', cuota_mensual: null, horas_mes: 0, acumular_horas: false, revisiones_por_semana: 1, dias_atencion: [1, 2, 3, 4, 5], horario_desde: '08:00:00', horario_hasta: '18:00:00', zona_horaria: 'America/Bogota', tiempos_respuesta: null, copias_frecuencia: 'diaria', parches_frecuencia: 'mensual', auditoria: false, auditoria_cada_meses: null, reuniones_por_mes: 0, reporte_tipo: 'resumido', servidores_incluidos: false, servidores_costo_mensual: null, incluye: [], incluye_otros: null, valor_hora_extra: null, proxima_revision: null, creado_en: ahora() }; tm.planes.push(p); }
      Object.assign(p, par, { plan_base: a.p_plan_base, activo: true, activado_en: ahora(), apagado_en: null, actualizado_en: ahora() });
      tm.historial.push({ id: uuid(), empresa_id: p.empresa_id, plan_id: p.id, tipo: 'activacion', parametros_anteriores: {}, parametros_nuevos: par, motivo: a.p_motivo || 'Activación del mantenimiento', efectivo_desde: hoy(), aplicado_en: ahora(), error_aplicacion: null, creado_por: c.user_id, creado_en: ahora() });
      if (!tm.bolsas.some((b) => b.plan_id === p.id)) tm.bolsas.push({ id: uuid(), empresa_id: p.empresa_id, plan_id: p.id, mes: hoy().slice(0, 7) + '-01', horas_incluidas: Number(p.horas_mes), horas_arrastradas: 0, horas_usadas: 0, horas_extra: 0, extra_autorizado: false });
      return { plan_id: p.id, activo: true };
    }
    case 'apagar_mantenimiento': {
      if (!esSuper) return falla('no_autorizado');
      if ((a.p_motivo ?? '').trim().length < 3) return falla('motivo_requerido');
      const p = tm.planes.find((x) => x.empresa_id === a.p_empresa_id);
      if (!p?.activo) return falla('mantenimiento_no_activo');
      p.activo = false; p.apagado_en = ahora(); p.actualizado_en = ahora();
      tm.historial.push({ id: uuid(), empresa_id: p.empresa_id, plan_id: p.id, tipo: 'apagado', parametros_anteriores: {}, parametros_nuevos: {}, motivo: a.p_motivo.trim(), efectivo_desde: hoy(), aplicado_en: ahora(), error_aplicacion: null, creado_por: c.user_id, creado_en: ahora() });
      return { plan_id: p.id, activo: false };
    }
    case 'configurar_mantenimiento': {
      if (!esSuper) return falla('no_autorizado');
      if ((a.p_motivo ?? '').trim().length < 3) return falla('motivo_requerido');
      const p = tm.planes.find((x) => x.empresa_id === a.p_empresa_id);
      if (!p?.activo) return falla('mantenimiento_no_activo');
      const nuevos = a.p_parametros ?? {};
      if (!Object.keys(nuevos).length || !['hoy', 'proximo_mes'].includes(a.p_aplicar_desde ?? 'proximo_mes')) return falla('datos_invalidos');
      if (nuevos.horario_desde && nuevos.horario_hasta && nuevos.horario_desde >= nuevos.horario_hasta) return falla('horario_invalido');
      const ant = {}; for (const k of Object.keys(nuevos)) ant[k] = p[k];
      const desde = a.p_aplicar_desde === 'hoy' ? hoy() : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); return d.toISOString().slice(0, 10); })();
      if (a.p_aplicar_desde === 'hoy') Object.assign(p, nuevos, { actualizado_en: ahora() });
      tm.historial.push({ id: uuid(), empresa_id: p.empresa_id, plan_id: p.id, tipo: 'parametros', parametros_anteriores: ant, parametros_nuevos: nuevos, motivo: a.p_motivo.trim(), efectivo_desde: desde, aplicado_en: a.p_aplicar_desde === 'hoy' ? ahora() : null, error_aplicacion: null, creado_por: c.user_id, creado_en: ahora() });
      return { plan_id: p.id };
    }
    case 'anotar_horas_ticket': {
      if (!esSuper) return falla('no_autorizado');
      const t = ticket(a.p_ticket_id); if (!t) return falla('ticket_no_encontrado');
      if (!(a.p_horas > 0 && a.p_horas <= 24)) return falla('datos_invalidos');
      const p = planActivoDe(S, t.empresa_id); if (!p) return falla('mantenimiento_no_activo');
      const b = tm.bolsas.find((x) => x.plan_id === p.id);
      const id = uuid();
      tm.horas.push({ id, empresa_id: t.empresa_id, ticket_id: t.id, bolsa_id: b.id, origen_id: null, mes: b.mes, fecha_trabajo: a.p_fecha ?? hoy(), horas: a.p_horas, sin_descuento: t.tipo === 'solicitud_cambio', estado: 'pendiente_dueno', registrado_por: c.user_id, registrado_en: ahora(), revisado_por: null, revisado_en: null, motivo_revision: null, decidido_cliente_por: null, decidido_cliente_en: null, actualizado_en: ahora() });
      if ((a.p_nota ?? '').trim()) tm.notas.push({ hora_id: id, empresa_id: t.empresa_id, nota: a.p_nota.trim(), creado_en: ahora() });
      return { hora_id: id };
    }
    case 'revisar_horas': {
      if (!esSuper) return falla('no_autorizado');
      const h = tm.horas.find((x) => x.id === a.p_hora_id); if (!h) return falla('hora_no_encontrada');
      if (h.estado !== 'pendiente_dueno') return falla('horas_ya_revisadas');
      if (!a.p_aprobar && (a.p_motivo ?? '').trim().length < 3) return falla('motivo_requerido');
      const b = tm.bolsas.find((x) => x.id === h.bolsa_id);
      if (a.p_aprobar && h.sin_descuento) { h.estado = 'aprobada'; }
      else if (a.p_aprobar) {
        const libre = Math.max(0, b.horas_incluidas + b.horas_arrastradas - b.horas_usadas);
        const dentro = Math.min(libre, h.horas); b.horas_usadas += dentro; b.horas_extra += h.horas - dentro;
        h.estado = h.horas - dentro > 0 ? 'extra_pendiente_cliente' : 'aprobada';
      } else { h.estado = 'rechazada'; h.motivo_revision = a.p_motivo.trim(); }
      h.revisado_en = ahora(); return { hora_id: h.id };
    }
    case 'decidir_horas_extra': {
      if (!admin) return falla('no_autorizado');
      const h = tm.horas.find((x) => x.id === a.p_hora_id && x.empresa_id === c.empresa.id); if (!h) return falla('hora_no_encontrada');
      if (h.estado !== 'extra_pendiente_cliente') return falla('horas_ya_revisadas');
      h.estado = a.p_aprobar ? 'extra_aprobada' : 'extra_rechazada'; return { hora_id: h.id };
    }
    case 'autorizar_horas_extra': {
      if (!admin) return falla('no_autorizado');
      const b = tm.bolsas.find((x) => x.id === a.p_bolsa_id && x.empresa_id === c.empresa.id); if (!b) return falla('bolsa_no_encontrada');
      b.extra_autorizado = true; return { bolsa_id: b.id };
    }
    default: return NO_ES_MIO;
  }
}

/** Storage simulado del bucket portal-tickets: subir, firmar y descargar. */
export async function almacenamiento(S, req, res, ruta, c) {
  const json = (st, b) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
  const m = ruta.match(/^\/storage\/v1\/object\/(sign\/)?portal-tickets\/(.+)$/);
  if (!m) return json(404, { message: 'no existe en el simulado' });
  const path = decodeURIComponent(m[2]);
  if (req.method === 'POST' && !m[1]) {
    const trozos = []; for await (const t of req) trozos.push(t);
    const adj = S.tm.adjuntos.find((x) => x.storage_path === path);
    if (!c.user_id || !adj || adj.subido_por !== c.user_id) return json(403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    if (S.tm.archivos[path]) return json(409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    S.tm.archivos[path] = { mime: adj.mime, bytes: PNG, tamano: Buffer.concat(trozos).length };
    return json(200, { Id: uuid(), Key: `portal-tickets/${path}` });
  }
  if (req.method === 'POST' && m[1]) {
    const adj = S.tm.adjuntos.find((x) => x.storage_path === path);
    const t = adj && S.tm.tickets.find((x) => x.id === adj.ticket_id);
    if (!t || !ve(c, t) || !S.tm.archivos[path]) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return json(200, { signedURL: `/object/sign/portal-tickets/${m[2]}?token=firma-de-prueba` });
  }
  if (req.method === 'GET' && m[1]) {
    const f = S.tm.archivos[path]; if (!f) return json(404, { message: 'Object not found' });
    res.writeHead(200, { 'content-type': f.mime.startsWith('image/') ? 'image/png' : f.mime }); return res.end(f.bytes);
  }
  return json(405, { message: 'no soportado' });
}

/** Estado interno para las pruebas (sin los bytes de los archivos). */
export const estado = (S) => ({ ...S.tm, archivos: Object.keys(S.tm.archivos) });
