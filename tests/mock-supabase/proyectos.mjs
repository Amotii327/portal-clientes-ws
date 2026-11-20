// Parte del Supabase SIMULADO para el sprint 2: proyectos, hitos, plan de sprints, panel, historial, "ver como" y
// consumo del equipo. Imita las reglas de docs/2026-11-27_nota_backend-para-frontend_sprint2_v1.md (resumidas).
// Todos los datos son inventados.
import crypto from 'node:crypto';

const uuid = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();
const DIA = 86400000;
export const hoy = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); // fecha de Colombia
export const dia = (n) => new Date(Date.parse(hoy() + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DIA);

export const NOMBRES_HITOS = ['Inicio del proyecto', 'Descubrimiento', 'Requerimientos aprobados', 'Arquitectura', 'Diseño y prototipo', 'Sprints', 'Pruebas finales', 'Pruebas del cliente', 'Capacitación', 'Salida a producción', 'Entrega final', 'Garantía (30 días)', 'Mantenimiento'];
const INICIADOS = ['en_curso', 'en_revision', 'terminado'];

export function sembrarProyectos(S) {
  S.proyectos = []; S.hitos = []; S.sprints = []; S.retrasos = []; S.cambios = []; S.historial = []; S.pagos = {};
  S.registro = []; S.consumoP = {}; S.consumoS = {}; S.verComo = {}; S.rechazos = []; S.seqHist = 1; S.seqReg = 1;
  const A = S.E.A; const B = S.E.B;
  const mk = (empresa, nombre, plan) => {
    const p = { id: uuid(), empresa_id: empresa, nombre, descripcion: null, estado: 'activo', fecha_inicio: dia(-30), fecha_fin_planeada: dia(60), fecha_fin_real: null, plan_estado: plan, plan_aprobado_en: plan === 'aprobado' ? ahora() : null, creado_en: ahora(), actualizado_en: ahora() };
    S.proyectos.push(p); crearHitos(S, p); return p;
  };
  // Proyecto 1 de la empresa A: plan publicado, un hito atrasado por el cliente.
  const p1 = mk(A, 'Plataforma Comercial', 'aprobado'); S.p1 = p1.id;
  const h = (p, n) => S.hitos.find((x) => x.proyecto_id === p.id && x.numero === n);
  [1, 2, 3, 4, 5].forEach((n, i) => { const x = h(p1, n); x.estado = 'terminado'; x.fecha_planeada = dia(-28 + i * 3); x.fecha_real = dia(-27 + i * 3); });
  h(p1, 7).fecha_planeada = dia(40); h(p1, 8).fecha_planeada = dia(-3);
  S.retrasos.push({ id: uuid(), empresa_id: A, proyecto_id: p1.id, hito_id: h(p1, 8).id, fecha_anterior: dia(-10), fecha_nueva: dia(-3), motivo: 'Falta el material de marca', lado: 'cliente', que_falta: 'Logo en vectores y paleta de colores', creado_en: ahora() });
  S.pagos[h(p1, 1).id] = 'Anticipo'; S.pagos[h(p1, 11).id] = 'Saldo final';
  const sp = (n, nombre, estado, ini, fin, demo, incluye) => S.sprints.push({ id: uuid(), empresa_id: A, proyecto_id: p1.id, numero: n, nombre, estado, fecha_inicio: dia(ini), fecha_fin: dia(fin), fecha_demo: demo === null ? null : dia(demo), incluye, terminado_en: estado === 'terminado' ? ahora() : null, creado_en: ahora(), actualizado_en: ahora() });
  sp(1, 'Entrada y empresas', 'terminado', -20, -8, -7, ['Entrar al portal', 'Crear empresas']);
  sp(2, 'Proyectos y línea de tiempo', 'en_curso', -6, 8, 5, ['Línea de tiempo', 'Plan de sprints']);
  sp(3, 'Revisiones y dinero', 'aprobado', 10, 24, 25, ['Revisiones', 'Pagos']);
  recalcular(S, p1.id);
  hist(S, p1, 'proyecto_creado', {}, true);
  hist(S, p1, 'plan_sprints_aprobado', {}, true);
  hist(S, p1, 'proyecto_estado_cambiado', { estado: 'activo', nota_interna: 'Ajuste interno de seguimiento' }, false);
  // Proyecto 2 de la empresa A: el plan sigue como propuesta (borrador que el cliente no debe ver).
  const p2 = mk(A, 'Sitio web corporativo', 'propuesta'); S.p2 = p2.id;
  S.sprints.push({ id: uuid(), empresa_id: A, proyecto_id: p2.id, numero: 1, nombre: 'BORRADOR secreto uno', estado: 'propuesto', fecha_inicio: dia(5), fecha_fin: dia(19), fecha_demo: dia(20), incluye: ['Idea que aún no se muestra'], terminado_en: null, creado_en: ahora(), actualizado_en: ahora() });
  S.sprints.push({ id: uuid(), empresa_id: A, proyecto_id: p2.id, numero: 2, nombre: 'BORRADOR secreto dos', estado: 'propuesto', fecha_inicio: dia(15), fecha_fin: dia(29), fecha_demo: null, incluye: [], terminado_en: null, creado_en: ahora(), actualizado_en: ahora() });
  recalcular(S, p2.id);
  hist(S, p2, 'proyecto_creado', {}, true);
  // Proyecto de la empresa B (pausada).
  const p3 = mk(B, 'Sistema de inventario', 'propuesta'); S.p3 = p3.id;
  hist(S, p3, 'proyecto_creado', {}, true);
  // Consumo del equipo del proyecto 1.
  S.consumoP[p1.id] = { estimado_inicial_pct: 150, tope_pct: 200, aviso_80_en: null };
  const s1 = S.sprints.find((x) => x.proyecto_id === p1.id && x.numero === 1);
  S.consumoS[s1.id] = { estimado_pct: 60, real_pct: 70 };
}

function crearHitos(S, p) {
  NOMBRES_HITOS.forEach((nombre, i) => S.hitos.push({ id: uuid(), empresa_id: p.empresa_id, proyecto_id: p.id, numero: i + 1, nombre, estado: 'pendiente', fecha_planeada: null, fecha_real: null, visible: i + 1 !== 13, creado_en: ahora(), actualizado_en: ahora() }));
}
function hist(S, p, tipo, detalle, visible = true) {
  S.historial.push({ id: S.seqHist++, empresa_id: p.empresa_id, proyecto_id: p.id, tipo, actor_tipo: 'equipo_websourcing', detalle, visible_cliente: visible, creado_en: ahora() });
}
function reg(S, c, accion, empresa_id, detalle = {}) {
  S.registro.push({ id: S.seqReg++, empresa_id: empresa_id ?? null, actor_id: c?.user_id ?? null, actor_tipo: c ? 'usuario' : 'sistema', accion, entidad: 'proyecto', entidad_id: detalle.proyecto_id ?? null, detalle, ip: '203.0.113.7', creado_en: ahora() });
}

const sprintsDe = (S, pid) => S.sprints.filter((s) => s.proyecto_id === pid).sort((a, b) => a.numero - b.numero);
/** Hito 6 derivado de los sprints (solo con plan publicado) y avance (D-013). */
function recalcular(S, pid) {
  const p = S.proyectos.find((x) => x.id === pid);
  const sp = sprintsDe(S, pid); const h6 = S.hitos.find((x) => x.proyecto_id === pid && x.numero === 6);
  const aprobado = p.plan_estado === 'aprobado' && sp.length > 0;
  if (aprobado) {
    const ya = h6.estado;
    h6.estado = sp.every((s) => s.estado === 'terminado') ? 'terminado' : sp.some((s) => s.estado === 'en_revision') ? 'esperando_aprobacion' : sp.some((s) => INICIADOS.includes(s.estado)) ? 'en_curso' : 'pendiente';
    if (h6.estado === 'terminado' && !h6.fecha_real) h6.fecha_real = hoy();
    if (h6.estado !== 'terminado') h6.fecha_real = null;
    void ya;
  }
  const otros = S.hitos.filter((x) => x.proyecto_id === pid && x.numero !== 6 && x.numero !== 13);
  const partes6 = aprobado ? sp.length : 1;
  const hechas6 = aprobado ? sp.filter((s) => s.estado === 'terminado').length : (h6.estado === 'terminado' ? 1 : 0);
  p.avance_partes_total = otros.length + partes6;
  p.avance_partes_hechas = otros.filter((x) => x.estado === 'terminado').length + hechas6;
  p.avance_pct = Math.round((10000 * p.avance_partes_hechas) / p.avance_partes_total) / 100;
  p.actualizado_en = ahora();
}
const avisosDe = (S, pid) => {
  const sp = sprintsDe(S, pid); const out = [];
  for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) if (sp[i].fecha_inicio <= sp[j].fecha_fin && sp[j].fecha_inicio <= sp[i].fecha_fin) out.push({ tipo: 'cruce_de_fechas', sprints: [sp[i].numero, sp[j].numero] });
  return out;
};

// ---- quién puede ver qué ----
const esSuperReal = (c) => c.estado === 'super_admin';
const veDinero = (c) => esSuperReal(c) || c.rol === 'admin_cliente' || !!c.permisos?.ver_dinero;
const puedeVer = (S, c, p) => esSuperReal(c) || (c.empresa && c.empresa.id === p.empresa_id);
const sprintsVisibles = (S, c, p) => (esSuperReal(c) || p.plan_estado === 'aprobado' ? sprintsDe(S, p.id) : []);

function resumen(S, c, p) {
  const e = S.empresas.find((x) => x.id === p.empresa_id);
  const sp = sprintsVisibles(S, c, p);
  const actual = sp.find((s) => s.estado === 'en_curso' || s.estado === 'en_revision') ?? null;
  const demos = sp.filter((s) => s.fecha_demo && s.fecha_demo >= hoy() && s.estado !== 'terminado').map((s) => s.fecha_demo).sort();
  const hs = hitosVisibles(S, c, p);
  const atras = hs.filter((x) => x.estado !== 'terminado' && x.fecha_planeada && x.fecha_planeada < hoy());
  const hAct = hs.find((x) => x.estado !== 'terminado');
  return {
    proyecto_id: p.id, empresa_id: p.empresa_id, empresa_nombre: e.nombre, empresa_estado: e.estado, nombre: p.nombre, estado: p.estado, plan_estado: p.plan_estado,
    avance_pct: p.avance_pct, avance_partes_hechas: p.avance_partes_hechas, avance_partes_total: p.avance_partes_total, fecha_inicio: p.fecha_inicio, fecha_fin_planeada: p.fecha_fin_planeada,
    sprint_actual_numero: actual?.numero ?? null, sprint_actual_nombre: actual?.nombre ?? null, sprint_actual_estado: actual?.estado ?? null,
    proxima_demo: demos[0] ?? null, hitos_atrasados: atras.length, hito_actual_numero: hAct?.numero ?? null, hito_actual_nombre: hAct?.nombre ?? null,
  };
}
const hitosVisibles = (S, c, p) => S.hitos.filter((x) => x.proyecto_id === p.id && (esSuperReal(c) || x.visible)).sort((a, b) => a.numero - b.numero);

/** Tablas de lectura del sprint 2. Devuelve undefined si no es una de ellas. */
export function leerProyectos(S, tabla, c, filtrar, params) {
  const soloSuper = esSuperReal(c);
  const propios = (lista) => lista.filter((x) => soloSuper || x.empresa_id === c.empresa?.id);
  if (tabla === 'proyectos') return filtrar(propios(S.proyectos), params);
  if (tabla === 'v_proyectos_resumen') return filtrar(propios(S.proyectos).map((p) => resumen(S, c, p)), params);
  if (tabla === 'historial_proyecto') return filtrar(propios(S.historial).filter((x) => soloSuper || x.visible_cliente), params);
  if (tabla === 'registro_actividad') return soloSuper ? filtrar(S.registro, params) : [];
  if (tabla === 'consumo_equipo_proyecto') return soloSuper ? filtrar(Object.entries(S.consumoP).map(([proyecto_id, v]) => ({ proyecto_id, ...v })), params) : [];
  if (tabla === 'consumo_equipo_sprint') return soloSuper ? filtrar(Object.entries(S.consumoS).map(([sprint_id, v]) => ({ sprint_id, ...v })), params) : [];
  if (tabla === 'hitos') return filtrar(propios(S.hitos).filter((x) => soloSuper || x.visible), params);
  if (tabla === 'sprints') return filtrar(propios(S.sprints).filter((s) => soloSuper || S.proyectos.find((p) => p.id === s.proyecto_id)?.plan_estado === 'aprobado'), params);
  return undefined;
}

const NO_SUPER_VER_COMO = new Set(['crear_proyecto', 'editar_proyecto', 'editar_hito', 'fijar_pago_hito', 'cargar_plan_sprints', 'agregar_sprint', 'editar_sprint', 'quitar_sprint', 'reordenar_sprints', 'aprobar_plan_sprints', 'panel_super_admin', 'iniciar_ver_como', 'fijar_consumo_proyecto', 'anotar_consumo_sprint', 'consumo_equipo']);
export const FUNCIONES_S2 = new Set([...NO_SUPER_VER_COMO, 'inicio_cliente', 'linea_de_tiempo', 'terminar_ver_como', 'anotar_rechazo']);

const OBLIGATORIOS = { retraso: 5, plan: 5 };

/** Ejecuta una función del sprint 2. `falla(codigo)` corta con el error de la base; devuelve el resultado. */
export function funcionS2(S, nombre, a, c, falla) {
  if (c.estado === 'ver_como' && NO_SUPER_VER_COMO.has(nombre)) return falla(nombre === 'panel_super_admin' ? 'no_autorizado' : nombre === 'consumo_equipo' ? 'no_autorizado' : 'ver_como_solo_lectura');
  const esSuper = esSuperReal(c);
  const hacerCambio = (pid, tipo, motivo, detalle = {}) => { const p = S.proyectos.find((x) => x.id === pid); if (p.plan_estado === 'aprobado') { S.cambios.push({ id: uuid(), empresa_id: p.empresa_id, proyecto_id: pid, tipo, motivo, detalle, creado_en: ahora() }); hist(S, p, 'plan_sprints_modificado', { motivo, tipo }, true); } };
  const proyectoEscribible = (pid) => {
    const p = S.proyectos.find((x) => x.id === pid); if (!p) return falla('proyecto_no_encontrado');
    if (p.estado === 'terminado' || p.estado === 'cancelado') return falla('proyecto_cerrado');
    return p;
  };
  const motivoPlan = (p, m) => (p.plan_estado === 'aprobado' && String(m ?? '').trim().length < OBLIGATORIOS.plan ? falla('plan_requiere_motivo') : undefined);
  const valFechas = (i, f, d) => (i && f && f < i) || (d && i && d < i);

  switch (nombre) {
    case 'anotar_rechazo': {
      if (c.estado === 'ver_como') return falla('ver_como_solo_lectura');
      if (!/^[a-z_]{1,60}$/.test(a.p_accion ?? '') || !/^[a-z_]{1,60}$/.test(a.p_codigo ?? '')) return falla('datos_invalidos');
      S.rechazos.push({ accion: a.p_accion, codigo: a.p_codigo, user_id: c.user_id });
      reg(S, c, 'intento_rechazado', c.empresa?.id, { accion: a.p_accion, codigo: a.p_codigo });
      return null;
    }
    case 'iniciar_ver_como': {
      if (!esSuper) return falla('no_autorizado');
      const e = S.empresas.find((x) => x.id === a.p_empresa_id);
      if (!e) return falla('empresa_no_encontrada');
      if (e.estado !== 'activa') return falla('empresa_no_disponible');
      const rol = a.p_rol ?? 'admin_cliente';
      const s = { sesion_id: uuid(), empresa_id: e.id, empresa_nombre: e.nombre, rol, aprobar: !!a.p_aprobar, ver_dinero: !!a.p_ver_dinero, ver_todos_tickets: !!a.p_ver_todos_tickets, subir_archivos: !!a.p_subir_archivos, vence_en: new Date(Date.now() + 3600000).toISOString() };
      S.verComo[c.user_id] = s; reg(S, c, 'ver_como_iniciado', e.id, { rol });
      return { sesion_id: s.sesion_id, empresa_id: e.id, empresa_nombre: e.nombre, rol, vence_en: s.vence_en };
    }
    case 'terminar_ver_como': {
      const s = S.verComo[c.user_id]; if (!s) return falla('sin_sesion_ver_como');
      delete S.verComo[c.user_id]; reg(S, c, 'ver_como_terminado', s.empresa_id, {}); return null;
    }
    case 'crear_proyecto': {
      if (!esSuper) return falla('no_autorizado');
      const e = S.empresas.find((x) => x.id === a.p_empresa_id); if (!e) return falla('empresa_no_encontrada');
      if (e.estado !== 'activa') return falla('empresa_no_disponible');
      const n = String(a.p_nombre ?? '').trim(); if (n.length < 2 || n.length > 160) return falla('datos_invalidos');
      if (a.p_fecha_inicio && a.p_fecha_fin_planeada && a.p_fecha_fin_planeada < a.p_fecha_inicio) return falla('fechas_invalidas');
      const p = { id: uuid(), empresa_id: e.id, nombre: n, descripcion: a.p_descripcion ?? null, estado: 'activo', fecha_inicio: a.p_fecha_inicio ?? null, fecha_fin_planeada: a.p_fecha_fin_planeada ?? null, fecha_fin_real: null, plan_estado: 'propuesta', plan_aprobado_en: null, creado_en: ahora(), actualizado_en: ahora() };
      S.proyectos.push(p); crearHitos(S, p); recalcular(S, p.id); hist(S, p, 'proyecto_creado', {}, true); reg(S, c, 'proyecto_creado', e.id, { proyecto_id: p.id });
      return { proyecto_id: p.id };
    }
    case 'editar_proyecto': {
      if (!esSuper) return falla('no_autorizado');
      const p = S.proyectos.find((x) => x.id === a.p_proyecto_id); if (!p) return falla('proyecto_no_encontrado');
      const cerrado = p.estado === 'terminado' || p.estado === 'cancelado';
      if (cerrado && (a.p_estado === undefined || a.p_estado === null || a.p_estado === p.estado)) return falla('proyecto_cerrado');
      if (a.p_nombre != null && (a.p_nombre.trim().length < 2)) return falla('datos_invalidos');
      if (valFechas(a.p_fecha_inicio ?? p.fecha_inicio, a.p_fecha_fin_planeada ?? p.fecha_fin_planeada)) return falla('fechas_invalidas');
      for (const [k, d] of [['p_nombre', 'nombre'], ['p_descripcion', 'descripcion'], ['p_fecha_inicio', 'fecha_inicio'], ['p_fecha_fin_planeada', 'fecha_fin_planeada'], ['p_fecha_fin_real', 'fecha_fin_real']]) if (a[k] != null) p[d] = a[k];
      if (a.p_estado && a.p_estado !== p.estado) { p.estado = a.p_estado; hist(S, p, 'proyecto_estado_cambiado', { estado: a.p_estado }, true); }
      reg(S, c, 'proyecto_editado', p.empresa_id, { proyecto_id: p.id }); return null;
    }
    case 'editar_hito': {
      if (!esSuper) return falla('no_autorizado');
      const h = S.hitos.find((x) => x.id === a.p_hito_id); if (!h) return falla('hito_no_encontrado');
      const p = proyectoEscribible(h.proyecto_id); if (!p || p.error) return undefined;
      if (h.numero === 6 && (a.p_estado != null || a.p_fecha_real != null)) return falla('hito_derivado');
      if (a.p_visible != null && h.numero !== 13) return falla('hito_no_ocultable');
      if (a.p_fecha_real && a.p_fecha_real > hoy()) return falla('fechas_invalidas');
      let retraso = false;
      if (a.p_fecha_planeada && a.p_fecha_planeada !== h.fecha_planeada) {
        if (h.fecha_planeada) {
          if (!a.p_lado) return falla('retraso_requiere_lado');
          if (String(a.p_motivo ?? '').trim().length < OBLIGATORIOS.retraso) return falla('retraso_requiere_motivo');
          if (a.p_lado === 'cliente' && !String(a.p_que_falta ?? '').trim()) return falla('retraso_requiere_que_falta');
          S.retrasos.push({ id: uuid(), empresa_id: h.empresa_id, proyecto_id: h.proyecto_id, hito_id: h.id, fecha_anterior: h.fecha_planeada, fecha_nueva: a.p_fecha_planeada, motivo: a.p_motivo.trim(), lado: a.p_lado, que_falta: a.p_lado === 'cliente' ? a.p_que_falta.trim() : null, creado_en: ahora() });
          hist(S, p, 'retraso_registrado', { numero: h.numero, nombre: h.nombre, motivo: a.p_motivo.trim(), lado: a.p_lado }, h.visible);
          retraso = true;
        } else hist(S, p, 'hito_fecha_fijada', { numero: h.numero, nombre: h.nombre, fecha: a.p_fecha_planeada }, h.visible);
        h.fecha_planeada = a.p_fecha_planeada;
      }
      if (a.p_nombre != null) h.nombre = a.p_nombre.trim();
      if (a.p_visible != null) h.visible = a.p_visible;
      if (a.p_estado && a.p_estado !== h.estado) {
        h.estado = a.p_estado;
        if (h.estado === 'terminado') h.fecha_real = a.p_fecha_real ?? h.fecha_real ?? hoy(); else h.fecha_real = null;
        hist(S, p, 'hito_estado_cambiado', { numero: h.numero, nombre: h.nombre, estado: h.estado }, h.visible);
      } else if (a.p_fecha_real) h.fecha_real = a.p_fecha_real;
      recalcular(S, p.id); reg(S, c, 'hito_editado', h.empresa_id, { proyecto_id: h.proyecto_id, numero: h.numero });
      return { hito_id: h.id, retraso_registrado: retraso };
    }
    case 'fijar_pago_hito': {
      if (!esSuper) return falla('no_autorizado');
      const h = S.hitos.find((x) => x.id === a.p_hito_id); if (!h) return falla('hito_no_encontrado');
      if (a.p_concepto && String(a.p_concepto).trim()) S.pagos[h.id] = String(a.p_concepto).trim(); else delete S.pagos[h.id];
      return null;
    }
    case 'agregar_sprint': {
      if (!esSuper) return falla('no_autorizado');
      const p = proyectoEscribible(a.p_proyecto_id); if (!p || p.error) return undefined;
      if (String(a.p_nombre ?? '').trim().length < 2) return falla('datos_invalidos');
      if (valFechas(a.p_fecha_inicio, a.p_fecha_fin, a.p_fecha_demo)) return falla('fechas_invalidas');
      if (motivoPlan(p, a.p_motivo) !== undefined) return undefined;
      const n = sprintsDe(S, p.id).length + 1;
      const s = { id: uuid(), empresa_id: p.empresa_id, proyecto_id: p.id, numero: n, nombre: a.p_nombre.trim(), estado: p.plan_estado === 'aprobado' ? 'aprobado' : 'propuesto', fecha_inicio: a.p_fecha_inicio, fecha_fin: a.p_fecha_fin, fecha_demo: a.p_fecha_demo ?? null, incluye: a.p_incluye ?? [], terminado_en: null, creado_en: ahora(), actualizado_en: ahora() };
      S.sprints.push(s); hacerCambio(p.id, 'sprint_agregado', a.p_motivo, { numero: n }); recalcular(S, p.id);
      reg(S, c, 'sprint_agregado', p.empresa_id, { proyecto_id: p.id });
      return { sprint_id: s.id, numero: n, avisos: avisosDe(S, p.id) };
    }
    case 'editar_sprint': {
      if (!esSuper) return falla('no_autorizado');
      const s = S.sprints.find((x) => x.id === a.p_sprint_id); if (!s) return falla('sprint_no_encontrado');
      const p = proyectoEscribible(s.proyecto_id); if (!p || p.error) return undefined;
      const ini = a.p_fecha_inicio ?? s.fecha_inicio; const fin = a.p_fecha_fin ?? s.fecha_fin; const demo = a.p_fecha_demo ?? s.fecha_demo;
      if (valFechas(ini, fin, demo)) return falla('fechas_invalidas');
      const cambioContenido = (a.p_nombre != null && a.p_nombre !== s.nombre) || ini !== s.fecha_inicio || fin !== s.fecha_fin || (demo ?? null) !== (s.fecha_demo ?? null) || (a.p_incluye != null && a.p_incluye.join('|') !== s.incluye.join('|'));
      if (cambioContenido && motivoPlan(p, a.p_motivo) !== undefined) return undefined;
      const delta = diasEntre(s.fecha_fin, fin) || diasEntre(s.fecha_inicio, ini);
      const estadoViejo = s.estado;
      Object.assign(s, { nombre: a.p_nombre ?? s.nombre, fecha_inicio: ini, fecha_fin: fin, fecha_demo: demo ?? null, incluye: a.p_incluye ?? s.incluye, estado: a.p_estado ?? s.estado, actualizado_en: ahora() });
      if (s.estado === 'terminado' && estadoViejo !== 'terminado') s.terminado_en = ahora();
      if (a.p_correr_siguientes && delta) sprintsDe(S, p.id).filter((x) => x.numero > s.numero).forEach((x) => { x.fecha_inicio = dia(diasEntre(hoy(), x.fecha_inicio) + delta); x.fecha_fin = dia(diasEntre(hoy(), x.fecha_fin) + delta); if (x.fecha_demo) x.fecha_demo = dia(diasEntre(hoy(), x.fecha_demo) + delta); });
      if (cambioContenido) hacerCambio(p.id, a.p_correr_siguientes && delta ? 'fechas_corridas' : 'sprint_editado', a.p_motivo, { numero: s.numero });
      if (s.estado !== estadoViejo) hist(S, p, 'sprint_estado_cambiado', { numero: s.numero, estado: s.estado }, true);
      recalcular(S, p.id); reg(S, c, 'sprint_editado', p.empresa_id, { proyecto_id: p.id });
      return { sprint_id: s.id, avisos: avisosDe(S, p.id) };
    }
    case 'quitar_sprint': {
      if (!esSuper) return falla('no_autorizado');
      const s = S.sprints.find((x) => x.id === a.p_sprint_id); if (!s) return falla('sprint_no_encontrado');
      const p = proyectoEscribible(s.proyecto_id); if (!p || p.error) return undefined;
      if (INICIADOS.includes(s.estado)) return falla('sprint_ya_iniciado');
      if (motivoPlan(p, a.p_motivo) !== undefined) return undefined;
      S.sprints = S.sprints.filter((x) => x.id !== s.id); delete S.consumoS[s.id];
      sprintsDe(S, p.id).forEach((x, i) => { x.numero = i + 1; });
      hacerCambio(p.id, 'sprint_quitado', a.p_motivo, { numero: s.numero }); recalcular(S, p.id); reg(S, c, 'sprint_quitado', p.empresa_id, { proyecto_id: p.id });
      return { avisos: avisosDe(S, p.id) };
    }
    case 'reordenar_sprints': {
      if (!esSuper) return falla('no_autorizado');
      const p = proyectoEscribible(a.p_proyecto_id); if (!p || p.error) return undefined;
      const actual = sprintsDe(S, p.id); const orden = a.p_orden ?? [];
      if (orden.length !== actual.length || !actual.every((s) => orden.includes(s.id))) return falla('orden_invalido');
      if (actual.some((s, i) => INICIADOS.includes(s.estado) && orden[i] !== s.id)) return falla('orden_invalido');
      if (motivoPlan(p, a.p_motivo) !== undefined) return undefined;
      orden.forEach((id, i) => { S.sprints.find((s) => s.id === id).numero = i + 1; });
      hacerCambio(p.id, 'sprints_reordenados', a.p_motivo); reg(S, c, 'sprints_reordenados', p.empresa_id, { proyecto_id: p.id });
      return { avisos: avisosDe(S, p.id) };
    }
    case 'aprobar_plan_sprints': {
      if (!esSuper) return falla('no_autorizado');
      const p = proyectoEscribible(a.p_proyecto_id); if (!p || p.error) return undefined;
      if (p.plan_estado === 'aprobado') return falla('plan_ya_aprobado');
      const sp = sprintsDe(S, p.id); if (sp.length === 0) return falla('plan_vacio');
      sp.forEach((s) => { if (s.estado === 'propuesto') s.estado = 'aprobado'; });
      p.plan_estado = 'aprobado'; p.plan_aprobado_en = ahora(); recalcular(S, p.id);
      hist(S, p, 'plan_sprints_aprobado', {}, true); reg(S, c, 'plan_sprints_aprobado', p.empresa_id, { proyecto_id: p.id });
      return { avisos: avisosDe(S, p.id) };
    }
    case 'panel_super_admin': {
      if (!esSuper) return falla('no_autorizado');
      const proyectos = S.proyectos.map((p) => resumen(S, c, p)); const atencion = [];
      for (const p of S.proyectos) {
        const e = S.empresas.find((x) => x.id === p.empresa_id);
        for (const h of hitosVisibles(S, c, p).filter((x) => x.estado !== 'terminado' && x.fecha_planeada && x.fecha_planeada < hoy())) {
          const r = S.retrasos.filter((x) => x.hito_id === h.id).at(-1);
          atencion.push({ tipo: 'hito_atrasado', prioridad: '1', empresa_id: e.id, empresa_nombre: e.nombre, proyecto_id: p.id, proyecto_nombre: p.nombre, hito_numero: h.numero, hito_nombre: h.nombre, fecha_planeada: h.fecha_planeada, dias_de_atraso: diasEntre(h.fecha_planeada, hoy()), esperando_al_cliente: r?.lado === 'cliente' });
        }
        if (p.plan_estado === 'propuesta' && sprintsDe(S, p.id).length) atencion.push({ tipo: 'plan_por_aprobar', prioridad: '2', empresa_id: e.id, empresa_nombre: e.nombre, proyecto_id: p.id, proyecto_nombre: p.nombre });
        const d = sprintsDe(S, p.id).find((s) => s.fecha_demo && s.fecha_demo >= hoy() && s.fecha_demo <= dia(7) && s.estado !== 'terminado');
        if (d) atencion.push({ tipo: 'demo_proxima', prioridad: '3', empresa_id: e.id, empresa_nombre: e.nombre, proyecto_id: p.id, proyecto_nombre: p.nombre, fecha: d.fecha_demo });
      }
      atencion.sort((x, y) => x.prioridad.localeCompare(y.prioridad));
      return {
        generado_en: ahora(),
        totales: { empresas_activas: S.empresas.filter((e) => e.estado === 'activa').length, empresas_pausadas: S.empresas.filter((e) => e.estado === 'pausada').length, proyectos_activos: S.proyectos.filter((p) => p.estado === 'activo').length, hitos_atrasados: atencion.filter((x) => x.tipo === 'hito_atrasado').length, planes_por_aprobar: atencion.filter((x) => x.tipo === 'plan_por_aprobar').length, demos_proximas_7_dias: atencion.filter((x) => x.tipo === 'demo_proxima').length, pagos_vencidos: null, tickets_abiertos: null },
        proyectos, atencion,
      };
    }
    case 'inicio_cliente': {
      if (esSuper) return falla('no_autorizado');
      const ps = S.proyectos.filter((p) => p.empresa_id === c.empresa.id);
      const pendientes = [];
      for (const p of ps) for (const h of hitosVisibles(S, c, p).filter((x) => x.estado !== 'terminado')) {
        const r = S.retrasos.filter((x) => x.hito_id === h.id).at(-1);
        if (r && r.lado === 'cliente') pendientes.push({ proyecto_id: p.id, hito_numero: h.numero, hito_nombre: h.nombre, fecha_nueva: r.fecha_nueva, motivo: r.motivo, que_falta: r.que_falta });
      }
      return { empresa: { id: c.empresa.id, nombre: c.empresa.nombre }, proyectos: ps.map((p) => resumen(S, c, p)), pendientes_del_cliente: pendientes };
    }
    case 'linea_de_tiempo': {
      const p = S.proyectos.find((x) => x.id === a.p_proyecto_id);
      if (!p || !puedeVer(S, c, p)) return falla('proyecto_no_encontrado');
      const hitos = hitosVisibles(S, c, p).map((h) => ({
        id: h.id, numero: h.numero, nombre: h.nombre, estado: h.estado, fecha_planeada: h.fecha_planeada, fecha_real: h.fecha_real, visible: h.visible,
        atrasado: h.estado !== 'terminado' && !!h.fecha_planeada && h.fecha_planeada < hoy(),
        pago_asociado: veDinero(c) ? S.pagos[h.id] ?? null : null,
        retrasos: S.retrasos.filter((r) => r.hito_id === h.id).map((r) => ({ fecha_anterior: r.fecha_anterior, fecha_nueva: r.fecha_nueva, motivo: r.motivo, lado: r.lado, que_falta: r.que_falta, creado_en: r.creado_en })),
      }));
      const plan = !esSuper && p.plan_estado !== 'aprobado' ? null : {
        estado: p.plan_estado, sprints: sprintsDe(S, p.id).map(({ id, numero, nombre, estado, fecha_inicio, fecha_fin, fecha_demo, incluye, terminado_en }) => ({ id, numero, nombre, estado, fecha_inicio, fecha_fin, fecha_demo, incluye, terminado_en })),
        cambios: S.cambios.filter((x) => x.proyecto_id === p.id).map(({ tipo, motivo, detalle, creado_en }) => ({ tipo, motivo, detalle, creado_en })), avisos: esSuper ? avisosDe(S, p.id) : [],
      };
      return { proyecto: resumen(S, c, p), hitos, plan };
    }
    // ---- Consumo del equipo (interno) ----
    case 'consumo_equipo':
    case 'fijar_consumo_proyecto':
    case 'anotar_consumo_sprint': {
      if (!esSuper) return falla('no_autorizado');
      let pid = a.p_proyecto_id;
      if (nombre === 'anotar_consumo_sprint') { const s = S.sprints.find((x) => x.id === a.p_sprint_id); if (!s) return falla('sprint_no_encontrado'); pid = s.proyecto_id; }
      const p = S.proyectos.find((x) => x.id === pid); if (!p) return falla('proyecto_no_encontrado');
      const rango = (v) => v == null || (v >= 0 && v <= 10000);
      if (nombre === 'fijar_consumo_proyecto') { if (!rango(a.p_estimado_inicial_pct) || !rango(a.p_tope_pct)) return falla('datos_invalidos'); const k = (S.consumoP[pid] ??= { estimado_inicial_pct: null, tope_pct: null, aviso_80_en: null }); if (a.p_estimado_inicial_pct != null) k.estimado_inicial_pct = a.p_estimado_inicial_pct; if (a.p_tope_pct != null) k.tope_pct = a.p_tope_pct; }
      if (nombre === 'anotar_consumo_sprint') { if (!rango(a.p_estimado_pct) || !rango(a.p_real_pct)) return falla('datos_invalidos'); const k = (S.consumoS[a.p_sprint_id] ??= { estimado_pct: null, real_pct: null }); if (a.p_estimado_pct != null) k.estimado_pct = a.p_estimado_pct; if (a.p_real_pct != null) k.real_pct = a.p_real_pct; }
      const sp = sprintsDe(S, pid); const real = sp.reduce((t, s) => t + (S.consumoS[s.id]?.real_pct ?? 0), 0); const est = sp.reduce((t, s) => t + (S.consumoS[s.id]?.estimado_pct ?? 0), 0);
      const k = S.consumoP[pid];
      if (k?.tope_pct) { if (real >= 0.8 * k.tope_pct) { if (!k.aviso_80_en) k.aviso_80_en = ahora(); } else k.aviso_80_en = null; }
      return {
        estimado_inicial_pct: k?.estimado_inicial_pct ?? null, tope_pct: k?.tope_pct ?? null, estimado_sprints_pct: est, real_total_pct: real,
        porcentaje_del_tope: k?.tope_pct > 0 ? Math.round((1000 * real) / k.tope_pct) / 10 : null, aviso_80_en: k?.aviso_80_en ?? null,
        sprints: sp.map((s) => ({ sprint_id: s.id, numero: s.numero, nombre: s.nombre, estimado_pct: S.consumoS[s.id]?.estimado_pct ?? null, real_pct: S.consumoS[s.id]?.real_pct ?? null })),
      };
    }
    default: return falla('datos_invalidos');
  }
}
