// Parte del Supabase SIMULADO para el Módulo 4 (Dinero). Imita lo que calcula la base: estados de cuotas, saldo, abonos,
// comprobantes, facturas, ingresos y el bucket privado "dinero". Reglas resumidas de docs/matriz-permisos-dinero.md.
// Los montos se guardan en centavos enteros (nunca float). Todos los datos son inventados. No toca nada de otros módulos.
import crypto from 'node:crypto';

const uuid = () => crypto.randomUUID();
export const NO_ES_DINERO = Symbol('no-es-dinero');

export const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const sumaDias = (f, d) => { const t = new Date(f + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const diasHasta = (desde, hasta) => Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000);
const aCent = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v);
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  const [e, d = ''] = s.split('.');
  return Number(e) * 100 + Number((d + '00').slice(0, 2));
};
const num = (c) => c / 100;

export const IDS = {
  P1: '33333333-3333-4333-8333-333333333331', P2: '33333333-3333-4333-8333-333333333332', P3: '33333333-3333-4333-8333-333333333333', P4: '33333333-3333-4333-8333-333333333334',
  C1: '44444444-4444-4444-8444-444444444441', C2: '44444444-4444-4444-8444-444444444442',
};

export function sembrarDinero(S, E) {
  const h = hoy();
  const d = (S.d = { proyectos: [], hitos: [], contratos: [], pagos: [], abonos: [], facturas: [], comprobantes: [], archivos: {}, descargas: [] });
  const emp = (id) => S.empresas.find((e) => e.id === id);
  const proy = (id, empresa_id, nombre) => d.proyectos.push({ proyecto_id: id, empresa_id, empresa_nombre: emp(empresa_id).nombre, empresa_estado: emp(empresa_id).estado, nombre });
  proy(IDS.P1, E.A, 'Plataforma de pedidos'); proy(IDS.P2, E.A, 'Tienda móvil de ventas'); proy(IDS.P3, E.B, 'Portal Demo'); proy(IDS.P4, E.A, 'Sitio web corporativo');
  [['Descubrimiento', 1], ['Diseño aprobado', 2], ['Sprints 1 y 2', 3], ['Entrega final', 4]].forEach(([nombre, numero]) =>
    d.hitos.push({ id: `55555555-5555-4555-8555-55555555555${numero}`, empresa_id: E.A, proyecto_id: IDS.P1, numero, nombre, visible: true }));
  const contrato = (id, proyecto_id, empresa_id, valor, moneda, anticipo, firma) => d.contratos.push({ id, proyecto_id, empresa_id, valor, moneda, anticipo, fecha_firma: firma });
  contrato(IDS.C1, IDS.P1, E.A, 2000000000, 'COP', 600000000, sumaDias(h, -60));
  contrato(IDS.C2, IDS.P2, E.A, 500000, 'USD', 150000, sumaDias(h, -30));
  const pago = (id, contrato_id, concepto, valor, vence_el, hito_id = null) => { const c = d.contratos.find((x) => x.id === contrato_id); d.pagos.push({ id, contrato_id, empresa_id: c.empresa_id, proyecto_id: c.proyecto_id, concepto, valor, vence_el, hito_id }); };
  pago('66666666-6666-4666-8666-666666666661', IDS.C1, 'Anticipo', 600000000, sumaDias(h, -50), '55555555-5555-4555-8555-555555555551');
  pago('66666666-6666-4666-8666-666666666662', IDS.C1, 'Entrega de los sprints 1 y 2', 500000000, sumaDias(h, -10), '55555555-5555-4555-8555-555555555553');
  pago('66666666-6666-4666-8666-666666666663', IDS.C1, 'Entrega de los sprints 3 y 4', 500000000, sumaDias(h, 2), '55555555-5555-4555-8555-555555555554');
  pago('66666666-6666-4666-8666-666666666664', IDS.C1, 'Cierre y puesta en marcha', 400000000, sumaDias(h, 30));
  pago('66666666-6666-4666-8666-666666666665', IDS.C2, 'Anticipo', 150000, sumaDias(h, -20));
  pago('66666666-6666-4666-8666-666666666666', IDS.C2, 'Entrega de la versión beta', 350000, sumaDias(h, 20));
  const abono = (contrato_id, pago_id, valor, fecha_pago, medio, extra = {}) => { const c = d.contratos.find((x) => x.id === contrato_id); d.abonos.push({ id: uuid(), contrato_id, empresa_id: c.empresa_id, pago_programado_id: pago_id, valor, moneda: c.moneda, fecha_pago, medio, referencia: null, tiene_archivo: false, anulado_en: null, anulado_motivo: null, ...extra }); };
  abono(IDS.C1, '66666666-6666-4666-8666-666666666661', 600000000, sumaDias(h, -49), 'transferencia', { referencia: 'TR-1001' });
  abono(IDS.C1, '66666666-6666-4666-8666-666666666662', 100000000, sumaDias(h, -15), 'consignacion', { anulado_en: sumaDias(h, -14), anulado_motivo: 'Se registró por error en este proyecto.' });
  abono(IDS.C2, '66666666-6666-4666-8666-666666666665', 150000, sumaDias(h, -19), 'transferencia');
  const ruta = `${E.A}/facturas/${uuid()}.pdf`;
  d.archivos[ruta] = { empresa: E.A, tipo: 'application/pdf' };
  d.facturas.push({ id: '77777777-7777-4777-8777-777777777771', contrato_id: IDS.C1, empresa_id: E.A, numero: 'FV-0001', valor: 600000000, moneda: 'COP', fecha_emision: sumaDias(h, -49), pago_programado_id: '66666666-6666-4666-8666-666666666661', archivo_path: ruta, archivo_nombre: 'FV-0001.pdf', anulada_en: null, anulada_motivo: null });
}

// ---------- cálculos que en la base hace una vista ----------
const vigentes = (d, f) => d.abonos.filter((a) => !a.anulado_en && f(a));
const sum = (l, k) => l.reduce((t, x) => t + x[k], 0);
function vistaPago(d, p) {
  const c = d.contratos.find((x) => x.id === p.contrato_id);
  const abonado = sum(vigentes(d, (a) => a.pago_programado_id === p.id), 'valor');
  const pendiente = p.valor - abonado;
  const enRev = d.comprobantes.some((x) => x.pago_programado_id === p.id && x.estado === 'en_revision');
  const dias = diasHasta(hoy(), p.vence_el);
  const estado = pendiente <= 0 ? 'pagado' : enRev ? 'en_revision' : dias < 0 ? 'vencido' : dias <= 3 ? 'por_vencer' : 'pendiente';
  const hito0 = p.hito_id ? d.hitos.find((x) => x.id === p.hito_id) : null;
  const hito = hito0 && hito0.visible !== false ? hito0 : null; // hito oculto: la vista entrega hito_id en null
  return { pago_id: p.id, empresa_id: p.empresa_id, contrato_id: p.contrato_id, proyecto_id: p.proyecto_id, concepto: p.concepto, valor: num(p.valor), moneda: c.moneda, vence_el: p.vence_el, hito_id: hito ? hito.id : null, hito_numero: hito ? hito.numero : null, hito_nombre: hito ? hito.nombre : null, abonado: num(abonado), pendiente: num(Math.max(pendiente, 0)), estado, dias_para_vencer: dias };
}
function vistaContrato(d, c) {
  const pagos = d.pagos.filter((p) => p.contrato_id === c.id).map((p) => vistaPago(d, p));
  const abonado = sum(vigentes(d, (a) => a.contrato_id === c.id), 'valor');
  const programado = sum(d.pagos.filter((p) => p.contrato_id === c.id), 'valor');
  const venc = pagos.filter((p) => p.estado === 'vencido');
  const abiertas = pagos.filter((p) => p.estado !== 'pagado').map((p) => p.vence_el).sort();
  return { contrato_id: c.id, empresa_id: c.empresa_id, proyecto_id: c.proyecto_id, valor: num(c.valor), moneda: c.moneda, anticipo: num(c.anticipo), fecha_firma: c.fecha_firma, abonado: num(abonado), saldo: num(c.valor - abonado), programado: num(programado), sin_programar: num(c.valor - programado), pagos_vencidos: venc.length, monto_vencido: num(venc.reduce((t, p) => t + Math.round(p.pendiente * 100), 0)), proximo_vence: abiertas[0] ?? null };
}
const vistaAbono = (a) => ({ id: a.id, pago_programado_id: a.pago_programado_id, valor: num(a.valor), moneda: a.moneda, fecha_pago: a.fecha_pago, medio: a.medio, referencia: a.referencia, tiene_archivo: a.tiene_archivo, anulado_en: a.anulado_en, anulado_motivo: a.anulado_motivo });
const vistaFactura = (f) => ({ id: f.id, numero: f.numero, valor: num(f.valor), moneda: f.moneda, fecha_emision: f.fecha_emision, pago_programado_id: f.pago_programado_id, archivo_path: f.archivo_path, archivo_nombre: f.archivo_nombre, anulada_en: f.anulada_en, anulada_motivo: f.anulada_motivo });
const vistaComprobante = (x) => ({ id: x.id, pago_programado_id: x.pago_programado_id, valor_declarado: num(x.valor), fecha_pago_declarada: x.fecha_pago, estado: x.estado, motivo_rechazo: x.motivo_rechazo, archivo_nombre: x.archivo_nombre, archivo_path: x.archivo_path, nota: x.nota, creado_en: x.creado_en, revisado_en: x.revisado_en });

// ---------- permisos ----------
const esSA = (c) => c.estado === 'super_admin';
const miembroActivo = (c) => c.estado === 'activo';
const puedeVer = (c) => esSA(c) || (miembroActivo(c) && (c.rol === 'admin_cliente' || c.permisos?.ver_dinero));
const puedeSubir = (c) => miembroActivo(c) && (c.rol === 'admin_cliente' || (c.permisos?.ver_dinero && c.permisos?.subir_archivos));
const delaEmpresa = (c, empresa_id) => esSA(c) || c.empresa?.id === empresa_id;

// ---------- tablas y vistas ----------
export function leerTablaDinero(S, tabla, c, params, filtrar) {
  const d = S.d;
  const propias = (f) => (esSA(c) || (miembroActivo(c) && f.empresa_id === c.empresa.id));
  if (tabla === 'v_proyectos_resumen') return filtrar(d.proyectos.filter(propias), params);
  if (tabla === 'hitos') return filtrar(d.hitos.filter(propias), params);
  if (tabla === 'v_pagos_programados') return puedeVer(c) ? filtrar(d.pagos.filter(propias).map((p) => vistaPago(d, p)), params) : [];
  if (tabla === 'v_contratos_saldo') return puedeVer(c) ? filtrar(d.contratos.filter(propias).map((k) => vistaContrato(d, k)), params) : [];
  if (tabla.startsWith('v_ingresos_')) {
    if (!esSA(c)) return [];
    const ab = d.abonos.filter((a) => !a.anulado_en);
    const nombre = (id) => S.empresas.find((e) => e.id === id).nombre;
    const agrupar = (clave, extra) => {
      const g = new Map();
      for (const a of ab) {
        const k = clave(a); const x = g.get(k) ?? { ...extra(a), moneda: a.moneda, abonos: 0, total: 0, ultimo: '' };
        x.abonos += 1; x.total += a.valor; if (a.fecha_pago > x.ultimo) x.ultimo = a.fecha_pago; g.set(k, x);
      }
      return [...g.values()];
    };
    const sal = (x, extra = {}) => ({ ...extra, moneda: x.moneda, abonos: x.abonos, total: num(x.total) });
    if (tabla === 'v_ingresos_por_mes') return filtrar(agrupar((a) => a.fecha_pago.slice(0, 7) + a.moneda, (a) => ({ mes: a.fecha_pago.slice(0, 7) + '-01' })).map((x) => sal(x, { mes: x.mes })), params);
    if (tabla === 'v_ingresos_por_cliente') return filtrar(agrupar((a) => a.empresa_id + a.moneda, (a) => ({ empresa_id: a.empresa_id })).map((x) => sal(x, { empresa_id: x.empresa_id, empresa_nombre: nombre(x.empresa_id), ultimo_pago: x.ultimo })), params);
    if (tabla === 'v_ingresos_por_mes_y_cliente') return filtrar(agrupar((a) => a.fecha_pago.slice(0, 7) + a.empresa_id + a.moneda, (a) => ({ mes: a.fecha_pago.slice(0, 7) + '-01', empresa_id: a.empresa_id })).map((x) => sal(x, { mes: x.mes, empresa_id: x.empresa_id, empresa_nombre: nombre(x.empresa_id) })), params);
  }
  return null;
}

// ---------- funciones (rpc) ----------
const motivoOk = (m) => typeof m === 'string' && m.trim().length >= 5 && m.trim().length <= 500;
export function rpcDinero(S, nombre, a, c, falla) {
  const d = S.d;
  const sa = () => { if (!esSA(c)) { falla('no_autorizado'); return false; } return true; };
  const contratoDe = (id) => d.contratos.find((x) => x.id === id);
  const pagoDe = (id) => d.pagos.find((x) => x.id === id);
  const bad = (cod) => { falla(cod); return undefined; };
  switch (nombre) {
    case 'dinero_del_proyecto': {
      if (!puedeVer(c)) return bad('no_autorizado');
      const p = d.proyectos.find((x) => x.proyecto_id === a.p_proyecto_id);
      if (!p || !delaEmpresa(c, p.empresa_id)) return bad('proyecto_no_encontrado');
      const k = d.contratos.find((x) => x.proyecto_id === p.proyecto_id);
      if (!k) return { contrato: null, pagos: [], abonos: [], facturas: [], comprobantes: [] };
      const porFecha = (x, y) => (x.fecha_pago ?? x.fecha_emision) < (y.fecha_pago ?? y.fecha_emision) ? -1 : 1;
      return {
        contrato: vistaContrato(d, k),
        pagos: d.pagos.filter((x) => x.contrato_id === k.id).map((x) => vistaPago(d, x)).sort((x, y) => (x.vence_el < y.vence_el ? -1 : 1)),
        abonos: d.abonos.filter((x) => x.contrato_id === k.id).sort(porFecha).map(vistaAbono),
        facturas: d.facturas.filter((x) => x.contrato_id === k.id).sort(porFecha).map(vistaFactura),
        comprobantes: d.comprobantes.filter((x) => x.contrato_id === k.id).map(vistaComprobante),
      };
    }
    case 'crear_contrato': {
      if (!sa()) return undefined;
      const p = d.proyectos.find((x) => x.proyecto_id === a.p_proyecto_id); if (!p) return bad('proyecto_no_encontrado');
      if (d.contratos.some((x) => x.proyecto_id === p.proyecto_id)) return bad('contrato_ya_existe');
      const v = aCent(a.p_valor); const an = a.p_anticipo === undefined ? 0 : aCent(a.p_anticipo);
      if (!v || v <= 0 || an === null || !['COP', 'USD'].includes(a.p_moneda)) return bad('datos_invalidos');
      if (an > v) return bad('anticipo_excede_valor');
      const k = { id: uuid(), proyecto_id: p.proyecto_id, empresa_id: p.empresa_id, valor: v, moneda: a.p_moneda, anticipo: an, fecha_firma: a.p_fecha_firma ?? null };
      d.contratos.push(k); return { contrato_id: k.id };
    }
    case 'editar_contrato': {
      if (!sa()) return undefined;
      const k = contratoDe(a.p_contrato_id); if (!k) return bad('contrato_no_encontrado');
      const v = a.p_valor === undefined ? k.valor : aCent(a.p_valor); const an = a.p_anticipo === undefined ? k.anticipo : aCent(a.p_anticipo);
      if (!v || an === null) return bad('datos_invalidos');
      const programado = sum(d.pagos.filter((x) => x.contrato_id === k.id), 'valor'); const abonado = sum(vigentes(d, (x) => x.contrato_id === k.id), 'valor');
      if (v < programado || v < abonado) return bad('contrato_bajo_lo_comprometido');
      if (a.p_moneda && a.p_moneda !== k.moneda && (programado > 0 || abonado > 0)) return bad('moneda_con_movimientos');
      if (an > v) return bad('anticipo_excede_valor');
      k.valor = v; k.anticipo = an; if (a.p_fecha_firma) k.fecha_firma = a.p_fecha_firma; if (a.p_moneda) k.moneda = a.p_moneda; return null;
    }
    case 'agregar_pago': {
      if (!sa()) return undefined;
      const k = contratoDe(a.p_contrato_id); if (!k) return bad('contrato_no_encontrado');
      const v = aCent(a.p_valor); if (!v || !a.p_concepto || !a.p_vence_el) return bad('datos_invalidos');
      if (a.p_hito_id && d.hitos.find((h) => h.id === a.p_hito_id)?.proyecto_id !== k.proyecto_id) return bad('hito_de_otro_proyecto');
      if (sum(d.pagos.filter((x) => x.contrato_id === k.id), 'valor') + v > k.valor) return bad('pagos_exceden_contrato');
      const p = { id: uuid(), contrato_id: k.id, empresa_id: k.empresa_id, proyecto_id: k.proyecto_id, concepto: a.p_concepto, valor: v, vence_el: a.p_vence_el, hito_id: a.p_hito_id ?? null };
      d.pagos.push(p); return { pago_id: p.id };
    }
    case 'editar_pago': {
      if (!sa()) return undefined;
      const p = pagoDe(a.p_pago_id); if (!p) return bad('pago_no_encontrado');
      const k = contratoDe(p.contrato_id);
      const v = a.p_valor === undefined ? p.valor : aCent(a.p_valor); if (!v) return bad('datos_invalidos');
      const enRev = d.comprobantes.some((x) => x.pago_programado_id === p.id && x.estado === 'en_revision');
      if (enRev && (v !== p.valor || (a.p_vence_el && a.p_vence_el !== p.vence_el))) return bad('pago_en_revision');
      if (v < sum(vigentes(d, (x) => x.pago_programado_id === p.id), 'valor')) return bad('pago_bajo_lo_abonado');
      if (a.p_hito_id && d.hitos.find((h) => h.id === a.p_hito_id)?.proyecto_id !== k.proyecto_id) return bad('hito_de_otro_proyecto');
      if (sum(d.pagos.filter((x) => x.contrato_id === k.id && x.id !== p.id), 'valor') + v > k.valor) return bad('pagos_exceden_contrato');
      p.valor = v; if (a.p_concepto) p.concepto = a.p_concepto; if (a.p_vence_el) p.vence_el = a.p_vence_el;
      if (a.p_quitar_hito) p.hito_id = null; else if (a.p_hito_id) p.hito_id = a.p_hito_id; return null;
    }
    case 'quitar_pago': {
      if (!sa()) return undefined;
      const p = pagoDe(a.p_pago_id); if (!p) return bad('pago_no_encontrado');
      if (d.abonos.some((x) => x.pago_programado_id === p.id) || d.comprobantes.some((x) => x.pago_programado_id === p.id) || d.facturas.some((x) => x.pago_programado_id === p.id)) return bad('pago_con_movimientos');
      d.pagos = d.pagos.filter((x) => x.id !== p.id); return null;
    }
    case 'crear_abono': {
      if (!sa()) return undefined;
      const k = contratoDe(a.p_contrato_id); if (!k) return bad('contrato_no_encontrado');
      const v = aCent(a.p_valor); if (!v || !a.p_fecha_pago || !['transferencia', 'consignacion', 'tarjeta', 'efectivo', 'otro'].includes(a.p_medio)) return bad('datos_invalidos');
      if (a.p_fecha_pago > hoy()) return bad('fechas_invalidas');
      const p = a.p_pago_id ? pagoDe(a.p_pago_id) : null; if (a.p_pago_id && (!p || p.contrato_id !== k.id)) return bad('pago_no_encontrado');
      const vista = vistaContrato(d, k);
      if (v > Math.round(vista.saldo * 100)) return bad('abono_excede_saldo');
      if (p && v > Math.round(vistaPago(d, p).pendiente * 100)) return bad('abono_excede_pago');
      const ab = { id: uuid(), contrato_id: k.id, empresa_id: k.empresa_id, pago_programado_id: p?.id ?? null, valor: v, moneda: k.moneda, fecha_pago: a.p_fecha_pago, medio: a.p_medio, referencia: a.p_referencia ?? null, tiene_archivo: false, anulado_en: null, anulado_motivo: null };
      d.abonos.push(ab); return { abono_id: ab.id, saldo: vistaContrato(d, k).saldo };
    }
    case 'anular_abono': {
      if (!sa()) return undefined;
      const ab = d.abonos.find((x) => x.id === a.p_abono_id); if (!ab) return bad('abono_no_encontrado');
      if (ab.anulado_en) return bad('abono_ya_anulado'); if (!motivoOk(a.p_motivo)) return bad('datos_invalidos');
      ab.anulado_en = hoy(); ab.anulado_motivo = a.p_motivo.trim();
      return { abono_id: ab.id, saldo: vistaContrato(d, contratoDe(ab.contrato_id)).saldo };
    }
    case 'crear_factura': {
      if (!sa()) return undefined;
      const k = contratoDe(a.p_contrato_id); if (!k) return bad('contrato_no_encontrado');
      const v = aCent(a.p_valor); if (!v || !a.p_numero) return bad('datos_invalidos');
      if (d.facturas.some((f) => f.numero === a.p_numero)) return bad('factura_numero_repetido');
      if (!d.archivos[a.p_archivo_path] || !a.p_archivo_path.startsWith(`${k.empresa_id}/facturas/`) || a.p_tamano_bytes > 20 * 1024 * 1024) return bad('archivo_invalido');
      const f = { id: uuid(), contrato_id: k.id, empresa_id: k.empresa_id, numero: a.p_numero, valor: v, moneda: k.moneda, fecha_emision: a.p_fecha_emision, pago_programado_id: a.p_pago_id ?? null, archivo_path: a.p_archivo_path, archivo_nombre: a.p_archivo_nombre, anulada_en: null, anulada_motivo: null };
      d.facturas.push(f); return { factura_id: f.id };
    }
    case 'anular_factura': {
      if (!sa()) return undefined;
      const f = d.facturas.find((x) => x.id === a.p_factura_id); if (!f) return bad('factura_no_encontrada');
      if (f.anulada_en) return bad('factura_ya_anulada'); if (!motivoOk(a.p_motivo)) return bad('datos_invalidos');
      f.anulada_en = hoy(); f.anulada_motivo = a.p_motivo.trim(); return null;
    }
    case 'anotar_descarga_factura': { if (puedeVer(c)) d.descargas.push(a.p_factura_id); return null; }
    case 'anotar_rechazo': { (S.rechazos ??= []).push({ accion: a.p_accion, codigo: a.p_codigo }); return null; }
    case 'subir_comprobante': {
      if (!puedeSubir(c)) return bad('no_autorizado');
      const p = pagoDe(a.p_pago_id); if (!p || p.empresa_id !== c.empresa.id) return bad('pago_no_encontrado');
      const v = aCent(a.p_valor); if (!v || !a.p_fecha_pago) return bad('datos_invalidos');
      if (a.p_fecha_pago > hoy()) return bad('fechas_invalidas');
      const vp = vistaPago(d, p);
      if (vp.estado === 'pagado') return bad('pago_ya_pagado');
      if (vp.estado === 'en_revision') return bad('comprobante_en_revision');
      // Como la base real: el archivo debe existir en Storage y se usa su tipo real (no el declarado)
      const real = d.archivos[a.p_archivo_path];
      if (!real || !a.p_archivo_path.startsWith(`${p.empresa_id}/comprobantes/`) || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(real.tipo)) return bad('archivo_invalido');
      if (v > Math.round(vp.pendiente * 100)) return bad('valor_excede_pendiente');
      const x = { id: uuid(), contrato_id: p.contrato_id, empresa_id: p.empresa_id, pago_programado_id: p.id, valor: v, fecha_pago: a.p_fecha_pago, estado: 'en_revision', motivo_rechazo: null, archivo_nombre: a.p_archivo_nombre, archivo_path: a.p_archivo_path, nota: a.p_nota ?? null, creado_en: new Date().toISOString(), revisado_en: null };
      d.comprobantes.push(x); return { comprobante_id: x.id };
    }
    case 'comprobantes_por_revisar': {
      if (!sa()) return undefined;
      return d.comprobantes.filter((x) => x.estado === 'en_revision').map((x) => {
        const p = pagoDe(x.pago_programado_id); const k = contratoDe(x.contrato_id);
        return { id: x.id, empresa_id: x.empresa_id, empresa_nombre: S.empresas.find((e) => e.id === x.empresa_id).nombre, pago_programado_id: p.id, concepto: p.concepto, valor_declarado: num(x.valor), moneda: k.moneda, fecha_pago_declarada: x.fecha_pago, archivo_path: x.archivo_path, archivo_nombre: x.archivo_nombre, nota: x.nota, creado_en: x.creado_en };
      });
    }
    case 'confirmar_comprobante': {
      if (!sa()) return undefined;
      const x = d.comprobantes.find((y) => y.id === a.p_comprobante_id); if (!x) return bad('comprobante_no_encontrado');
      if (x.estado !== 'en_revision') return bad('comprobante_ya_revisado');
      const v = a.p_valor === undefined ? x.valor : aCent(a.p_valor); if (!v) return bad('datos_invalidos');
      const k = contratoDe(x.contrato_id);
      if (v > Math.round(vistaContrato(d, k).saldo * 100)) return bad('abono_excede_saldo');
      const ab = { id: uuid(), contrato_id: k.id, empresa_id: k.empresa_id, pago_programado_id: x.pago_programado_id, valor: v, moneda: k.moneda, fecha_pago: a.p_fecha_pago ?? x.fecha_pago, medio: a.p_medio ?? 'transferencia', referencia: a.p_referencia ?? null, tiene_archivo: true, anulado_en: null, anulado_motivo: null };
      d.abonos.push(ab); x.estado = 'confirmado'; x.revisado_en = new Date().toISOString();
      return { abono_id: ab.id, saldo: vistaContrato(d, k).saldo };
    }
    case 'rechazar_comprobante': {
      if (!sa()) return undefined;
      const x = d.comprobantes.find((y) => y.id === a.p_comprobante_id); if (!x) return bad('comprobante_no_encontrado');
      if (x.estado !== 'en_revision') return bad('comprobante_ya_revisado'); if (!motivoOk(a.p_motivo)) return bad('datos_invalidos');
      x.estado = 'rechazado'; x.motivo_rechazo = a.p_motivo.trim(); x.revisado_en = new Date().toISOString(); return null;
    }
    default: return NO_ES_DINERO;
  }
}

// ---------- Storage (bucket privado "dinero") ----------
const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
/** Devuelve true si atendió la petición. */
export function storageDinero(S, req, res, url, c, jsonBase) {
  const json = (...a) => { jsonBase(...a); return true; };
  const m = url.pathname.match(/^\/storage\/v1\/object\/(sign\/)?dinero\/(.+)$/);
  if (!m) return false;
  const firmar = !!m[1]; const ruta = decodeURIComponent(m[2]); const empresa = ruta.split('/')[0]; const carpeta = ruta.split('/')[1];
  const sinPermiso = () => json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
  const noExiste = () => json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
  if (firmar && req.method === 'POST') {
    if (!c || !puedeVer(c) || !delaEmpresa(c, empresa) || !S.d.archivos[ruta]) return noExiste();
    return json(res, 200, { signedURL: `/object/sign/dinero/${ruta}?token=t-${uuid()}` });
  }
  if (firmar && req.method === 'GET') {
    if (!url.searchParams.get('token')) return json(res, 400, { message: 'sin token' });
    res.writeHead(200, { 'content-type': S.d.archivos[ruta]?.tipo ?? 'application/pdf', 'content-disposition': 'attachment; filename="archivo.pdf"' }); res.end(PDF_MINIMO); return true;
  }
  if (!firmar && req.method === 'POST') {
    if (!c) return sinPermiso();
    const ok = carpeta === 'facturas' ? esSA(c) : carpeta === 'comprobantes' ? esSA(c) || (puedeSubir(c) && c.empresa.id === empresa) : false;
    if (!ok) return sinPermiso();
    if (S.d.archivos[ruta]) return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    S.d.archivos[ruta] = { empresa, tipo: (req.headers['content-type'] || '').split(';')[0] };
    return json(res, 200, { Key: `dinero/${ruta}`, Id: uuid() });
  }
  return json(res, 405, { message: 'no soportado en el simulado' });
}

// ---------- lo que el panel del super admin y el inicio del cliente suman de este módulo ----------
/** Igual que panel_super_admin() / inicio_cliente() de la base integrada: cuotas vencidas, comprobantes en revisión y la cuota más próxima. */
export function resumenParaPanel(S, c) {
  const d = S.d;
  const propias = (f) => esSA(c) || f.empresa_id === c.empresa?.id;
  const nombreEmp = (id) => S.empresas.find((e) => e.id === id)?.nombre ?? '';
  const pagos = d.pagos.filter(propias).map((p) => vistaPago(d, p));
  const vencidos = pagos.filter((p) => p.estado === 'vencido');
  const enRev = d.comprobantes.filter((x) => x.estado === 'en_revision' && propias(x));
  if (!puedeVer(c)) return { pagos_vencidos: null, comprobantes_en_revision: null, proximo_pago: null, atencion: [] };
  const abiertos = pagos.filter((p) => p.estado !== 'pagado').sort((a, b) => (a.vence_el < b.vence_el ? -1 : 1));
  const prox = abiertos[0];
  const nombreProy = (id) => d.proyectos.find((x) => x.proyecto_id === id)?.nombre ?? S.proyectos?.find((x) => x.id === id)?.nombre ?? '';
  const atencion = esSA(c) ? [
    ...vencidos.map((p) => ({ tipo: 'pago_vencido', prioridad: '1', empresa_id: p.empresa_id, empresa_nombre: nombreEmp(p.empresa_id), proyecto_id: p.proyecto_id, proyecto_nombre: nombreProy(p.proyecto_id), pago_id: p.pago_id, concepto: p.concepto, pendiente: p.pendiente, moneda: p.moneda, vence_el: p.vence_el, dias_de_atraso: -p.dias_para_vencer })),
    ...enRev.map((x) => { const p = d.pagos.find((q) => q.id === x.pago_programado_id); return { tipo: 'comprobante_en_revision', prioridad: '2', empresa_id: x.empresa_id, empresa_nombre: nombreEmp(x.empresa_id), proyecto_id: p?.proyecto_id ?? '', comprobante_id: x.id, concepto: p?.concepto ?? '', valor: num(x.valor), moneda: p ? d.contratos.find((k) => k.id === p.contrato_id).moneda : 'COP', subido_en: x.creado_en ?? new Date().toISOString() }; }),
  ] : [];
  return {
    pagos_vencidos: vencidos.length, comprobantes_en_revision: enRev.length, atencion,
    proximo_pago: prox ? { pago_id: prox.pago_id, proyecto_id: prox.proyecto_id, concepto: prox.concepto, pendiente: prox.pendiente, moneda: prox.moneda, vence_el: prox.vence_el, estado: prox.estado } : null,
  };
}
