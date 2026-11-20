// Supabase SIMULADO para las pruebas de Playwright (no hay Supabase real en este entorno).
// Imita solo lo que usan las pantallas: Auth (contraseña, registro, recuperar, 2FA TOTP) y la API de tablas/funciones.
// Reglas de acceso resumidas de docs/matriz-permisos.md. Todos los datos son inventados. Puerto: 54399.
import http from 'node:http';
import crypto from 'node:crypto';
import { FUNCIONES_S2, funcionS2, leerProyectos, sembrarProyectos } from './proyectos.mjs';
import * as revdocs from './revdocs.mjs';
import { NO_ES_DINERO, leerTablaDinero, resumenParaPanel, rpcDinero, sembrarDinero, storageDinero } from './dinero.mjs';
import * as TM from './tickets-mant.mjs';
import * as ESP from './espacio.mjs';

const PUERTO = Number(process.env.MOCK_PUERTO || 54399);
const CLAVE = 'ClaveSegura123';
const CODIGO_2FA = '123456';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const uuid = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();
const en = (dias) => new Date(Date.now() + dias * 86400000).toISOString();

let S;
function reiniciar(perfil = 'base') {
  const E = { A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222' };
  S = {
    E, empresas: [], miembros: [], perfiles: {}, usuarios: {}, invitaciones: [], facturacion: {}, preferencias: {}, config: { exigir_2fa_admin_cliente: true } /* D-014: el 2FA del administrador del cliente es obligatorio por defecto */,
    tokens: {}, refresh: {}, ultimoToken: null, bitacora: [], supers: new Set(), perfil,
  };
  const emp = (id, nombre, nit, estado) => S.empresas.push({ id, nombre, nit_registro: nit, logo_path: null, estado, motivo_pausa: null, pausada_en: null, pausada_por: null, creada_en: '2026-11-10T10:00:00Z', actualizado_en: '2026-11-10T10:00:00Z' });
  emp(E.A, 'Comercial Ejemplo S.A.S.', '900123456-7', 'activa');
  emp(E.B, 'Servicios Demo Ltda.', '800765432-1', 'pausada');
  S.facturacion[E.A] = { empresa_id: E.A, razon_social: 'Comercial Ejemplo S.A.S.', nit: '900123456-7', correo_facturas: 'facturas@comercial-ejemplo.test' };
  S.facturacion[E.B] = { empresa_id: E.B, razon_social: 'Servicios Demo Ltda.', nit: '800765432-1', correo_facturas: 'facturas@servicios-demo.test' };
  const usuario = (correo, nombre, extra = {}) => {
    const id = uuid();
    S.usuarios[correo] = { id, email: correo, password: CLAVE, confirmado: true, factores: [], ...extra };
    if (!extra.sinPerfil) S.perfiles[id] = { user_id: id, nombre, correo, celular: null, bloqueado: !!extra.bloqueadoGlobal, bloqueado_en: null, creado_en: '2026-11-10T10:00:00Z', actualizado_en: '2026-11-10T10:00:00Z' };
    return id;
  };
  const miembro = (uid, empresa, rol, extra = {}) => S.miembros.push({ id: uuid(), empresa_id: empresa, user_id: uid, rol, aprobar: false, ver_dinero: false, ver_todos_tickets: false, subir_archivos: false, bloqueado: false, bloqueado_en: null, quitado_en: null, creado_en: ahora(), actualizado_en: ahora(), ...extra });
  const factor = () => [{ id: uuid(), factor_type: 'totp', status: 'verified', friendly_name: 'Portal', created_at: ahora(), updated_at: ahora() }];
  const sid = usuario('super@websourcing.test', 'Super Admin Prueba', { factores: factor() }); S.supers.add(sid);
  const nid = usuario('super-nuevo@websourcing.test', 'Super Nuevo'); S.supers.add(nid);
  miembro(usuario('admin@cliente.test', 'Admina Prueba', { factores: factor() }), E.A, 'admin_cliente'); // con su código ya configurado
  miembro(usuario('equipo@cliente.test', 'Equipo Uno'), E.A, 'equipo');
  miembro(usuario('equipo-dinero@cliente.test', 'Equipo Con Dinero'), E.A, 'equipo', { ver_dinero: true });
  miembro(usuario('pausada@servicios.test', 'Usuaria Pausada', { factores: factor() }), E.B, 'admin_cliente');
  miembro(usuario('quitado@cliente.test', 'Persona Quitada'), E.A, 'equipo', { quitado_en: '2026-11-12T10:00:00Z' });
  miembro(usuario('bloqueado@cliente.test', 'Persona Bloqueada'), E.A, 'equipo', { bloqueado: true });
  miembro(usuario('global@cliente.test', 'Bloqueo Global', { bloqueadoGlobal: true }), E.A, 'equipo');
  usuario('frenada@cliente.test', 'Cuenta Frenada', { frenada: true });
  usuario('sinmembresia@cliente.test', 'Sin Membresia');
  usuario('sinperfil@cliente.test', '', { sinPerfil: true });
  const inv = (token, correo, extra = {}) => S.invitaciones.push({ id: uuid(), empresa_id: E.A, correo, rol: 'equipo', aprobar: false, ver_dinero: false, ver_todos_tickets: false, subir_archivos: false, creada_en: ahora(), vence_en: en(7), usada_en: null, usada_por: null, miembro_id: null, revocada_en: null, invitada_por: null, _token: token, ...extra });
  inv('tok-valido-123', 'invitado@cliente.test');
  inv('tok-vencido-999', 'vencido@cliente.test', { vence_en: en(-1) });
  inv('tok-confirmado-777', 'existente@cliente.test');
  usuario('existente@cliente.test', 'Existente');
  delete S.perfiles[S.usuarios['existente@cliente.test'].id];
  inv('tok-otro-555', 'otro@cliente.test');
  S.invitaciones.at(-1).empresa_id = E.A;
  sembrarProyectos(S);
  revdocs.sembrar(S, perfil);
  sembrarDinero(S, E); // Módulo 4: contratos, cuotas, abonos, facturas (ver dinero.mjs)
  TM.sembrar(S, { usuario, miembro, emp });
  ESP.sembrar(S); // ahorro de espacio (SC-5): cupo, enlaces de video y archivados // tickets y mantenimiento (tests/mock-supabase/tickets-mant.mjs)
}
reiniciar();

const respuestaErr = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const authErr = (res, status, error_code, msg) => respuestaErr(res, status, { code: status, error_code, msg });
const dbErr = (res, codigo) => respuestaErr(res, 400, { code: 'P0001', message: codigo, details: null, hint: null });

function jwt(u, aal) {
  const ahoraS = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aal, amr: [{ method: aal === 'aal2' ? 'totp' : 'password', timestamp: ahoraS }], session_id: uuid(), iat: ahoraS, exp: ahoraS + 3600 })}.firma-de-prueba`;
}
const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.confirmado ? ahora() : null, phone: '', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], factors: u.factores, created_at: ahora(), updated_at: ahora() });
function sesion(u, aal = 'aal1') {
  const access = jwt(u, aal); const refresh = 'rt-' + uuid();
  S.tokens[access] = { email: u.email, aal }; S.refresh[refresh] = { email: u.email, aal };
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: refresh, user: userJson(u) };
}
function quien(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  const reg = S.tokens[t];
  return reg ? { u: S.usuarios[reg.email], aal: reg.aal, token: t } : null;
}

const miembroActivo = (uid) => S.miembros.find((m) => m.user_id === uid && !m.quitado_en);
const miembroDe = (uid) => miembroActivo(uid) ?? S.miembros.find((m) => m.user_id === uid);
function contexto(q) {
  if (!q) return { estado: 'sin_sesion' };
  const { u, aal } = q; const p = S.perfiles[u.id];
  const base = { user_id: u.id, aal };
  if (S.supers.has(u.id) && aal === 'aal2' && S.verComo?.[u.id]) {
    const v = S.verComo[u.id];
    if (new Date(v.vence_en) < new Date()) delete S.verComo[u.id];
    else {
      const e = S.empresas.find((x) => x.id === v.empresa_id);
      const adm = v.rol === 'admin_cliente';
      return { ...base, estado: 'ver_como', nombre: p?.nombre ?? '', tema: 'clara', es_super_admin: true, empresa: { id: e.id, nombre: e.nombre, estado: e.estado }, rol: v.rol, permisos: { aprobar: adm || v.aprobar, ver_dinero: adm || v.ver_dinero, ver_todos_tickets: adm || v.ver_todos_tickets, subir_archivos: adm || v.subir_archivos }, ver_como: { sesion_id: v.sesion_id, empresa_id: v.empresa_id, empresa_nombre: v.empresa_nombre, rol: v.rol, vence_en: v.vence_en } };
    }
  }
  if (S.supers.has(u.id)) return { ...base, estado: aal === 'aal2' ? 'super_admin' : 'super_admin_requiere_2fa', nombre: p?.nombre ?? '', tema: S.preferencias[u.id]?.tema ?? 'clara', es_super_admin: true, empresa: null, rol: null, permisos: null };
  if (!p) return { ...base, estado: 'sin_perfil' };
  if (p.bloqueado) return { ...base, estado: 'usuario_bloqueado', nombre: p.nombre };
  const m = miembroDe(u.id);
  if (!m) return { ...base, estado: 'sin_membresia', nombre: p.nombre };
  const e = S.empresas.find((x) => x.id === m.empresa_id);
  const comun = { ...base, nombre: p.nombre, tema: S.preferencias[u.id]?.tema ?? 'clara', es_super_admin: false, empresa: { id: e.id, nombre: e.nombre, estado: e.estado }, rol: m.rol, permisos: { aprobar: m.aprobar, ver_dinero: m.ver_dinero, ver_todos_tickets: m.ver_todos_tickets, subir_archivos: m.subir_archivos } };
  if (m.quitado_en) return { ...comun, estado: 'miembro_quitado' };
  if (m.bloqueado) return { ...comun, estado: 'miembro_bloqueado' };
  if (e.estado === 'pausada') return { ...comun, estado: 'empresa_pausada' };
  if (S.config.exigir_2fa_admin_cliente && m.rol === 'admin_cliente' && aal !== 'aal2') return { ...comun, estado: 'requiere_2fa' };
  return { ...comun, estado: 'activo' };
}
const ctxActivo = (q) => { const c = contexto(q); return c.estado === 'activo' || c.estado === 'super_admin' || c.estado === 'ver_como' ? c : null; };

// ---- Tablas (con las reglas de acceso de la matriz, resumidas) ----
function filtrar(filas, params) {
  let r = filas;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    if (v.startsWith('eq.')) r = r.filter((f) => String(f[k]) === v.slice(3));
    else if (v.startsWith('neq.')) r = r.filter((f) => String(f[k]) !== v.slice(4));
    else if (v.startsWith('in.(')) { const l = v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, '')); r = r.filter((f) => l.includes(String(f[k]))); }
    else if (v === 'not.is.null') r = r.filter((f) => f[k] !== null && f[k] !== undefined);
    else if (v === 'is.null') r = r.filter((f) => f[k] === null || f[k] === undefined);
  }
  const ord = params.get('order');
  if (ord) { const [col, dir] = ord.split('.'); r = [...r].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
  return r;
}
const sinSecretos = (i) => { const { _token, ...resto } = i; return resto; };
function leerTabla(tabla, q, params) {
  const c = ctxActivo(q); if (!c) return [];
  const esSuper = c.estado === 'super_admin'; const eid = c.empresa?.id; const admin = c.rol === 'admin_cliente';
  // En el perfil 'dinero' el módulo de dinero trae sus propios proyectos e hitos (ids fijos); en los demás, los del sprint 2.
  const propioDinero = S.perfil === 'dinero' && (tabla === 'v_proyectos_resumen' || tabla === 'hitos');
  const s2 = propioDinero ? undefined : leerProyectos(S, tabla, c, filtrar, params); if (s2 !== undefined) return s2;
  const rdFilas = revdocs.leer(S, tabla, c, params, filtrar); if (rdFilas) return rdFilas;
  if (tabla === 'perfiles') return esSuper ? filtrar(Object.values(S.perfiles), params) : [];
  if (tabla === 'empresas') return filtrar(esSuper ? S.empresas : S.empresas.filter((e) => e.id === eid), params);
  if (tabla === 'datos_facturacion') {
    const f = Object.values(S.facturacion);
    return filtrar(esSuper ? f : f.filter((x) => x.empresa_id === eid && (admin || c.permisos.ver_dinero)), params);
  }
  if (tabla === 'miembros') {
    const m = S.miembros.filter((x) => esSuper || (admin ? x.empresa_id === eid : x.user_id === c.user_id));
    return filtrar(m, params).map((x) => ({ ...x, perfiles: S.perfiles[x.user_id] ? { nombre: S.perfiles[x.user_id].nombre, correo: S.perfiles[x.user_id].correo, bloqueado: S.perfiles[x.user_id].bloqueado } : null }));
  }
  if (tabla === 'invitaciones') return filtrar(S.invitaciones.filter((i) => esSuper || (admin && i.empresa_id === eid)), params).map(sinSecretos);
  if (tabla === 'preferencias_usuario') return filtrar(Object.values(S.preferencias).filter((p) => p.user_id === c.user_id), params);
  const esp = ESP.leer(S, tabla, c); if (esp) return filtrar(esp, params);
  const tm = TM.leer(S, tabla, c);
  if (tm) return filtrar(tm, params);
  return leerTablaDinero(S, tabla, c, params, filtrar) ?? [];
}

const FRENO = {}; // correo -> { fallos, hasta }
function freno(nombre, a) {
  const correo = String(a.p_correo || '').toLowerCase();
  const u = S.usuarios && Object.values(S.usuarios).find((x) => x.email === correo);
  const f = FRENO[correo] || (FRENO[correo] = { fallos: 0, hasta: 0 });
  const bloqueado = () => !!(u && u.frenada) || f.hasta > Date.now();
  if (nombre === 'freno_acceso_consultar') return { bloqueado: bloqueado() };
  if (bloqueado()) return { decision: 'reject' };
  if (a.p_valido) { f.fallos = 0; return { decision: 'continue' }; }
  f.fallos += 1;
  if (f.fallos >= 5) { f.hasta = Date.now() + 15 * 60_000; return { decision: 'reject' }; }
  return { decision: 'continue' };
}

function rpc(nombre, a, q, res) {
  const body_ = a;
  if (nombre === 'freno_acceso_consultar' || nombre === 'freno_acceso_anotar') return freno(nombre, a);
  const c = nombre === 'politica_vigente' ? {} : contexto(q);
  if (nombre === 'politica_vigente') return '2026-11-v1';
  if (nombre === 'mi_contexto') return contexto(q);
  const falla = (cod) => { dbErr(res, cod); return undefined; };
  if (c.estado === 'sin_sesion') return falla('no_autenticado');
  if (FUNCIONES_S2.has(nombre)) {
    const r = funcionS2(S, nombre, body_, c, falla);
    if (!r || (nombre !== 'panel_super_admin' && nombre !== 'inicio_cliente')) return r;
    // Panel e inicio suman dinero y tickets (igual que la base integrada).
    const din = resumenParaPanel(S, c); const abiertos = TM.ticketsAbiertos(S, c);
    if (nombre === 'inicio_cliente') return { ...r, pagos_vencidos: din.pagos_vencidos, proximo_pago: din.proximo_pago, comprobantes_en_revision: din.comprobantes_en_revision, tickets_abiertos: abiertos };
    return { ...r, totales: { ...r.totales, pagos_vencidos: din.pagos_vencidos ?? 0, comprobantes_en_revision: din.comprobantes_en_revision ?? 0, tickets_abiertos: abiertos }, atencion: [...r.atencion, ...din.atencion].sort((x, y) => x.prioridad.localeCompare(y.prioridad)) };
  }
  if (revdocs.esFuncionRevDocs(nombre)) return revdocs.rpc(S, nombre, a, c, S.reqActual, falla);
  if (c.estado === 'ver_como') return falla('ver_como_solo_lectura');
  const esSuper = c.estado === 'super_admin'; const admin = c.estado === 'activo' && c.rol === 'admin_cliente';
  const crearInvitacion = (empresa_id, correo, rol, perms = {}) => {
    S.invitaciones.filter((i) => i.empresa_id === empresa_id && i.correo === correo && !i.usada_en && !i.revocada_en).forEach((i) => { i.revocada_en = ahora(); });
    const token = 'tok-' + crypto.randomBytes(12).toString('hex'); S.ultimoToken = token;
    const i = { id: uuid(), empresa_id, correo, rol, aprobar: !!perms.p_aprobar, ver_dinero: !!perms.p_ver_dinero, ver_todos_tickets: !!perms.p_ver_todos_tickets, subir_archivos: !!perms.p_subir_archivos, creada_en: ahora(), vence_en: en(7), usada_en: null, usada_por: null, miembro_id: null, revocada_en: null, invitada_por: c.user_id, _token: token };
    S.invitaciones.push(i);
    return { invitacion_id: i.id, correo, token, vence_en: i.vence_en };
  };
  switch (nombre) {
    case 'crear_empresa': {
      if (!esSuper) return falla('no_autorizado');
      if (S.empresas.some((e) => e.nit_registro === a.p_nit)) return falla('nit_duplicado');
      const id = uuid();
      S.empresas.push({ id, nombre: a.p_nombre, nit_registro: a.p_nit, logo_path: null, estado: 'activa', motivo_pausa: null, pausada_en: null, pausada_por: null, creada_en: ahora(), actualizado_en: ahora() });
      S.facturacion[id] = { empresa_id: id, razon_social: a.p_razon_social, nit: a.p_nit, correo_facturas: a.p_correo_facturas };
      return { empresa_id: id, ...crearInvitacion(id, a.p_correo_admin, 'admin_cliente') };
    }
    case 'invitar_miembro': {
      const rol = a.p_rol ?? 'equipo';
      if (!esSuper && !(admin && c.empresa.id === a.p_empresa_id && rol === 'equipo')) return falla('no_autorizado');
      if (S.miembros.some((m) => m.empresa_id === a.p_empresa_id && !m.quitado_en && S.perfiles[m.user_id]?.correo === a.p_correo)) return falla('correo_ya_es_miembro');
      return crearInvitacion(a.p_empresa_id, a.p_correo, rol, a);
    }
    case 'aceptar_invitacion': {
      const u = q.u; const inv = S.invitaciones.find((i) => i._token === a.p_token);
      if (!inv || inv.usada_en || inv.revocada_en || new Date(inv.vence_en) < new Date() || inv.correo !== u.email) return falla('invitacion_invalida');
      if (!u.confirmado) return falla('correo_sin_confirmar');
      if (a.p_version_politica !== '2026-11-v1') return falla('politica_version_invalida');
      if (miembroActivo(u.id)) return falla('ya_es_miembro');
      S.perfiles[u.id] ??= { user_id: u.id, nombre: a.p_nombre ?? '', correo: u.email, celular: a.p_celular ?? null, bloqueado: false, bloqueado_en: null, creado_en: ahora(), actualizado_en: ahora() };
      const m = { id: uuid(), empresa_id: inv.empresa_id, user_id: u.id, rol: inv.rol, aprobar: inv.aprobar, ver_dinero: inv.ver_dinero, ver_todos_tickets: inv.ver_todos_tickets, subir_archivos: inv.subir_archivos, bloqueado: false, bloqueado_en: null, quitado_en: null, creado_en: ahora(), actualizado_en: ahora() };
      S.miembros.push(m); inv.usada_en = ahora(); inv.usada_por = u.id;
      return { empresa_id: inv.empresa_id, miembro_id: m.id, rol: inv.rol };
    }
    case 'revocar_invitacion': {
      const i = S.invitaciones.find((x) => x.id === a.p_invitacion_id);
      if (!i || i.usada_en || i.revocada_en) return falla('invitacion_invalida');
      if (!esSuper && !(admin && i.empresa_id === c.empresa.id)) return falla('no_autorizado');
      i.revocada_en = ahora(); return null;
    }
    case 'quitar_miembro':
    case 'bloquear_miembro': {
      const m = S.miembros.find((x) => x.id === a.p_miembro_id);
      if (!m) return falla('usuario_no_encontrado');
      if (!esSuper && !(admin && m.empresa_id === c.empresa.id && m.rol === 'equipo' && m.user_id !== c.user_id)) return falla('no_autorizado');
      if (m.quitado_en) return falla('miembro_ya_quitado');
      if (nombre === 'quitar_miembro') m.quitado_en = ahora(); else m.bloqueado = a.p_bloqueado ?? true;
      return null;
    }
    case 'pausar_empresa':
    case 'reactivar_empresa': {
      if (!esSuper) return falla('no_autorizado');
      const e = S.empresas.find((x) => x.id === a.p_empresa_id); if (!e) return falla('empresa_no_encontrada');
      if (nombre === 'pausar_empresa') { if (e.estado === 'pausada') return falla('empresa_ya_pausada'); e.estado = 'pausada'; e.motivo_pausa = a.p_motivo ?? null; }
      else { if (e.estado === 'activa') return falla('empresa_ya_activa'); e.estado = 'activa'; e.motivo_pausa = null; }
      return null;
    }
    case 'bloquear_usuario': {
      if (!esSuper) return falla('no_autorizado');
      const p = S.perfiles[a.p_user_id]; if (!p) return falla('usuario_no_encontrado');
      if (S.supers.has(a.p_user_id)) return falla('no_se_puede_bloquear_super_admin');
      p.bloqueado = a.p_bloqueado ?? true; return null;
    }
    default: {
      let r = ESP.rpc(S, nombre, a, c, falla);
      if (r === ESP.NO_ES_ESPACIO) r = TM.rpc(S, nombre, a, c, falla);
      if (r === TM.NO_ES_MIO) r = rpcDinero(S, nombre, a, c, falla);
      return r === NO_ES_DINERO ? falla('datos_invalidos') : r;
    }
  }
}

async function cuerpo(req) {
  const trozos = []; for await (const t of req) trozos.push(t);
  req._raw = Buffer.concat(trozos);
  const txt = req._raw.toString('utf8');
  try { return txt ? JSON.parse(txt) : {}; } catch { return {}; }
}
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PUERTO}`);
  res.setHeader('access-control-allow-origin', req.headers.origin || '*');
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || '*');
  res.setHeader('access-control-expose-headers', 'content-range');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const ruta = url.pathname; const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await cuerpo(req) : {};
  S.reqActual = req;
  const q = quien(req);
  S.bitacora.push({ m: req.method, ruta });

  // ---- control para las pruebas ----
  if (ruta === '/__espacio') { if (req.method === 'POST') { const { empresa_id, usado_bytes, cupo_bytes } = body; if (usado_bytes !== undefined) S.esp.usado[empresa_id] = usado_bytes; if (cupo_bytes !== undefined) S.esp.cupos[empresa_id] = cupo_bytes; } return json(res, 200, S.esp); }
  if (ruta === '/__tm') return json(res, 200, TM.estado(S));
  if (ruta === '/__reset') { for (const k of Object.keys(FRENO)) delete FRENO[k]; reiniciar(url.searchParams.get('perfil') || 'base'); return json(res, 200, { ok: true }); }
  if (ruta === '/__estado') return json(res, 200, { ultimoToken: S.ultimoToken, preferencias: S.preferencias, empresas: S.empresas, miembros: S.miembros, perfiles: S.perfiles, exigir2fa: S.config.exigir_2fa_admin_cliente, invitaciones: S.invitaciones.map(sinSecretos), bitacora: S.bitacora.length, proyectos: S.proyectos, hitos: S.hitos, sprints: S.sprints, retrasos: S.retrasos, cambios: S.cambios, historial: S.historial, registro: S.registro, rechazos: S.rechazos, verComo: S.verComo, consumoP: S.consumoP, consumoS: S.consumoS, pagos: S.pagos, p1: S.p1, p2: S.p2, p3: S.p3 });
  if (ruta === '/__vaciar_proyectos') { S.proyectos = []; S.hitos = []; S.sprints = []; S.historial = []; S.retrasos = []; return json(res, 200, { ok: true }); }
  if (ruta === '/__sin_factor') { const u = S.usuarios[body.correo]; if (u) u.factores = []; return json(res, 200, { ok: !!u }); } // deja a esa persona sin código configurado
  if (ruta === '/__confirmar') { const u = S.usuarios[url.searchParams.get('correo')]; if (u) u.confirmado = true; return json(res, 200, { ok: !!u }); }
  if (ruta === '/__ver_como') {
    const sup = [...S.supers][0];
    if (!body.rol) delete S.verComo[sup];
    else { const e = S.empresas.find((x) => x.id === body.empresa_id); S.verComo[sup] = { sesion_id: crypto.randomUUID(), empresa_id: e.id, empresa_nombre: e.nombre, rol: body.rol, aprobar: !!body.aprobar, ver_dinero: !!body.ver_dinero, ver_todos_tickets: !!body.ver_todos_tickets, subir_archivos: !!body.subir_archivos, vence_en: new Date(Date.now() + 3600000).toISOString() }; }
    return json(res, 200, { ok: true });
  }
  if (ruta === '/__miembro') { const m = S.miembros.find((x) => x.user_id === S.usuarios[body.correo]?.id); if (m) Object.assign(m, body.campos); return json(res, 200, { ok: !!m }); }
  if (ruta === '/__revdocs') return json(res, 200, { ...S.rd, storage: Object.keys(S.rd.storage), firmas: undefined });
  if (ruta.startsWith('/storage/v1/') && ruta.includes('/portal-tickets/')) return TM.almacenamiento(S, req, res, ruta, ctxActivo(q) ?? {});
  if (ruta.startsWith('/storage/v1/') && storageDinero(S, req, res, url, ctxActivo(q), json)) return;
  if (ruta.startsWith('/storage/v1/') && revdocs.almacenamiento(S, req, res, url, req._raw ?? Buffer.alloc(0), body, ctxActivo(q), json, respuestaErr)) return;
  if (ruta === '/__config') { Object.assign(S.config, body); return json(res, 200, S.config); }

  if (ruta === '/__permiso') { const { correo, ...perm } = body; const u = S.usuarios[correo]; const m = u && S.miembros.find((x) => x.user_id === u.id && !x.quitado_en); if (m) Object.assign(m, perm); return json(res, 200, { ok: !!m }); }
  if (ruta === '/__dinero') return json(res, 200, { ...S.d, rechazos: S.rechazos ?? [] });

  // ---- Auth ----
  if (ruta === '/auth/v1/token') {
    const tipo = url.searchParams.get('grant_type');
    if (tipo === 'password') {
      const u = S.usuarios[(body.email || '').toLowerCase()];
      if (u && u.frenada) return authErr(res, 500, 'unexpected_failure', 'Error running hook URI: cuenta_frenada_temporalmente');
      if (!u || u.password !== body.password) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
      if (!u.confirmado) return authErr(res, 400, 'email_not_confirmed', 'Email not confirmed');
      return json(res, 200, sesion(u));
    }
    if (tipo === 'refresh_token') {
      const r = S.refresh[body.refresh_token]; if (!r) return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
      return json(res, 200, sesion(S.usuarios[r.email], r.aal));
    }
  }
  if (ruta === '/auth/v1/signup') {
    const correo = (body.email || '').toLowerCase();
    if (!S.invitaciones.some((i) => i.correo === correo && !i.usada_en && !i.revocada_en)) return authErr(res, 500, 'unexpected_failure', 'Error running hook URI: registro_solo_por_invitacion');
    if (S.usuarios[correo]) return authErr(res, 422, 'user_already_exists', 'User already registered');
    if (String(body.password || '').length < 10) return authErr(res, 422, 'weak_password', 'Password should be at least 10 characters');
    const id = uuid();
    S.usuarios[correo] = { id, email: correo, password: body.password, confirmado: false, factores: [] };
    return json(res, 200, userJson(S.usuarios[correo]));
  }
  if (ruta === '/auth/v1/recover') return json(res, 200, {});
  if (ruta === '/auth/v1/logout') { if (q) delete S.tokens[q.token]; res.writeHead(204); return res.end(); }
  if (ruta === '/auth/v1/user') {
    if (!q) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
    if (req.method === 'PUT') {
      if (body.password) {
        if (body.password === 'password123') return authErr(res, 422, 'weak_password', 'Password is known to be weak');
        if (body.password === q.u.password) return authErr(res, 422, 'same_password', 'New password should be different from the old password.');
        q.u.password = body.password;
      }
    }
    return json(res, 200, userJson(q.u));
  }
  let m = ruta.match(/^\/auth\/v1\/factors(?:\/([^/]+)(?:\/(challenge|verify))?)?$/);
  if (m) {
    if (!q) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
    const [, fid, accion] = m;
    if (!fid && req.method === 'POST') {
      const id = uuid(); q.u.factores.push({ id, factor_type: 'totp', status: 'unverified', friendly_name: body.friendly_name, created_at: ahora(), updated_at: ahora() });
      return json(res, 200, { id, type: 'totp', friendly_name: body.friendly_name, totp: { qr_code: 'data:image/svg+xml;utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><path d="M20 20h60v60H20zM120 20h60v60h-60zM20 120h60v60H20z" fill="black"/></svg>'), secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Prueba?secret=JBSWY3DPEHPK3PXP' } });
    }
    if (fid && !accion && req.method === 'DELETE') { q.u.factores = q.u.factores.filter((f) => f.id !== fid); return json(res, 200, { id: fid }); }
    if (fid && accion === 'challenge') return json(res, 200, { id: uuid(), type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (fid && accion === 'verify') {
      if (body.code !== CODIGO_2FA) return authErr(res, 400, 'mfa_verification_failed', 'Invalid TOTP code entered');
      const f = q.u.factores.find((x) => x.id === fid); if (f) f.status = 'verified';
      return json(res, 200, sesion(q.u, 'aal2'));
    }
  }

  // ---- API de tablas y funciones ----
  m = ruta.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (m) {
    const r = rpc(m[1], body, q, res);
    if (res.writableEnded) return;
    return json(res, 200, r === null ? null : r);
  }
  m = ruta.match(/^\/rest\/v1\/(\w+)$/);
  if (m) {
    const tabla = m[1]; const c = ctxActivo(q);
    if (req.method === 'GET') {
      if (revdocs.selectProhibido(tabla, url.searchParams)) return respuestaErr(res, 403, { code: '42501', message: 'permission denied for table ' + tabla, details: null, hint: null });
      const filas = leerTabla(tabla, q, url.searchParams);
      if ((req.headers.accept || '').includes('pgrst.object')) return filas.length === 1 ? json(res, 200, filas[0]) : respuestaErr(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });
      return json(res, 200, filas);
    }
    if (c?.estado === 'ver_como' && ['PATCH', 'POST', 'PUT', 'DELETE'].includes(req.method)) return respuestaErr(res, 400, { code: 'P0001', message: 'ver_como_solo_lectura', details: null, hint: null });
    if (req.method === 'PATCH') {
      let tocadas = [];
      const params = url.searchParams;
      if (tabla === 'miembros' && c) {
        const admin = c.rol === 'admin_cliente';
        tocadas = filtrar(S.miembros, params).filter((x) => c.estado === 'super_admin' || (admin && x.empresa_id === c.empresa.id && x.rol === 'equipo' && !x.quitado_en));
        const permitido = ['aprobar', 'ver_dinero', 'ver_todos_tickets', 'subir_archivos'];
        if (Object.keys(body).some((k) => !permitido.includes(k))) return respuestaErr(res, 403, { code: '42501', message: 'permission denied', details: null, hint: null });
        tocadas.forEach((x) => Object.assign(x, body));
      } else if (tabla === 'datos_facturacion' && c) {
        tocadas = filtrar(Object.values(S.facturacion), params).filter((x) => c.estado === 'super_admin' || (c.rol === 'admin_cliente' && x.empresa_id === c.empresa.id));
        tocadas.forEach((x) => Object.assign(x, body));
      }
      return (req.headers.prefer || '').includes('return=representation') ? json(res, 200, tocadas) : (res.writeHead(204), res.end());
    }
    if (req.method === 'POST' && c && tabla !== 'preferencias_usuario') {
      const r = TM.insertar(S, tabla, body, c, (cod) => dbErr(res, cod));
      if (res.writableEnded) return;
      if (r === true) { res.writeHead(201); return res.end(); }
    }
    if (req.method === 'POST' && tabla === 'preferencias_usuario' && c) {
      if (body.user_id !== c.user_id) return respuestaErr(res, 403, { code: '42501', message: 'permission denied', details: null, hint: null });
      S.preferencias[body.user_id] = { user_id: body.user_id, tema: body.tema, actualizado_en: ahora() };
      res.writeHead(201); return res.end();
    }
  }
  respuestaErr(res, 404, { message: 'no existe en el simulado: ' + req.method + ' ' + ruta });
});
servidor.listen(PUERTO, '127.0.0.1', () => console.log(`Supabase simulado en http://127.0.0.1:${PUERTO}`));
