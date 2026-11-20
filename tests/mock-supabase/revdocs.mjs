// Supabase SIMULADO · Módulos 3 (Revisiones y aprobaciones) y 6 (Documentos y Archivos de la empresa).
// Se conecta a tests/mock-supabase/servidor.mjs. Imita SOLO lo que usan las pantallas, con las reglas resumidas de
// docs/matriz-permisos-revisiones-docs.md y los mismos códigos de error que la base real. Datos inventados.
import crypto from 'node:crypto';
import { crearHitos } from './proyectos.mjs';
import { exigirCupo } from './espacio.mjs';

const uuid = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const TIPOS_PERMITIDOS = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv', 'text/plain', 'application/zip', 'application/x-zip-compressed',
];
const TIPOS_CAPTURA = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_ARCHIVO = 52_428_800;
const MAX_CAPTURA = 10_485_760;
const CATEGORIAS = ['contrato', 'propuesta', 'requerimientos', 'arquitectura', 'acta', 'manual', 'entregable', 'otro'];

/** IDs fijos que usan las pruebas. */
export const ID = {
  proyectoA1: id(1), proyectoA2: id(2), proyectoB1: id(3),
  sprintA1: id(11), sprintA2: id(12), sprintA3: id(13), sprintA4: id(14), sprintB1: id(15),
  revDiseno: id(21), revSprint1: id(22), revSprint2Borrador: id(23), revSprint3Cambios: id(24), revB: id(25),
  docContrato: id(31), docArquitectura: id(32), docManual: id(33), docActa: id(34), docB: id(35),
  archivoLogo: id(41), archivoTextos: id(42), archivoFotos: id(43),
};

export function sembrar(S, perfil = 'base') {
  const E = S.E;
  const rd = S.rd = {
    proyectos: [], sprints: [], revisiones: [], versiones: [], aprobaciones: [], documentos: [], docVersiones: [],
    docPermisos: [], archivos: [], reservas: [], registro: S.registro, // una sola tabla de registro de actividad para todos los módulos
    historial: S.historial, storage: {}, verComo: null, // el historial del proyecto es uno solo para todos los módulos
  };
  const porCorreo = (c) => S.usuarios[c].id;
  const miembroDe = (c) => S.miembros.find((m) => m.user_id === porCorreo(c));
  const nombreDe = (c) => S.perfiles[porCorreo(c)].nombre;
  const t = (d) => `2026-12-${d}T15:00:00+00:00`;
  const objeto = (bucket, ruta, mime = 'application/pdf', size = 120_000) => { rd.storage[`${bucket}/${ruta}`] = { bucket, ruta, size, mime }; };

  const proyecto = (pid, empresa, nombre) => rd.proyectos.push({ id: pid, empresa_id: empresa, nombre, descripcion: null, estado: 'activo', fecha_inicio: '2026-11-23', fecha_fin_planeada: '2027-03-01', fecha_fin_real: null, plan_estado: 'aprobado', plan_aprobado_en: t('01'), avance_pct: 30, avance_partes_hechas: 2, avance_partes_total: 8, creado_en: t('01'), actualizado_en: t('01') });
  proyecto(ID.proyectoA1, E.A, 'Portal de pedidos');
  proyecto(ID.proyectoA2, E.A, 'Sitio corporativo');
  proyecto(ID.proyectoB1, E.B, 'Sistema de reservas');

  const sprint = (sid, empresa, pid, numero, nombre, estado) => rd.sprints.push({ id: sid, empresa_id: empresa, proyecto_id: pid, numero, nombre, estado, fecha_inicio: '2026-12-01', fecha_fin: '2026-12-14', fecha_demo: '2026-12-15', incluye: [], terminado_en: null, creado_en: t('01'), actualizado_en: t('01') });
  sprint(ID.sprintA1, E.A, ID.proyectoA1, 1, 'Pedidos y catálogo', 'terminado');
  sprint(ID.sprintA2, E.A, ID.proyectoA1, 2, 'Pagos y facturas', 'en_curso');
  sprint(ID.sprintA3, E.A, ID.proyectoA1, 3, 'Informes', 'en_curso');
  sprint(ID.sprintA4, E.A, ID.proyectoA1, 4, 'Cierre', 'aprobado');
  sprint(ID.sprintB1, E.B, ID.proyectoB1, 1, 'Reservas', 'en_revision');

  // ---- Documentos ----
  const doc = (did, empresa, pid, categoria, titulo, visibilidad, versiones) => {
    rd.documentos.push({ id: did, empresa_id: empresa, proyecto_id: pid, categoria, titulo, descripcion: null, visibilidad, version_actual: versiones.length, creado_en: t('02'), actualizado_en: t('03') });
    versiones.forEach((v, i) => {
      const vid = uuid(); const ruta = `${empresa}/documentos/${vid}.pdf`;
      rd.docVersiones.push({ id: vid, empresa_id: empresa, documento_id: did, version: i + 1, bucket_id: 'documentos', storage_path: ruta, nombre_original: v.nombre, mime_type: 'application/pdf', tamano_bytes: v.bytes, nota: v.nota ?? null, creado_en: t(v.dia) });
      objeto('documentos', ruta, 'application/pdf', v.bytes);
    });
  };
  doc(ID.docContrato, E.A, ID.proyectoA1, 'contrato', 'Contrato de desarrollo', 'todo_el_equipo', [
    { nombre: 'contrato-v1.pdf', bytes: 210_000, dia: '02', nota: 'Primera versión firmada' },
    { nombre: 'contrato-v2.pdf', bytes: 232_000, dia: '08', nota: 'Se actualizó la cláusula de entregas' },
  ]);
  doc(ID.docArquitectura, E.A, ID.proyectoA1, 'arquitectura', 'Arquitectura del portal', 'solo_admin', [{ nombre: 'arquitectura.pdf', bytes: 540_000, dia: '03' }]);
  doc(ID.docManual, E.A, ID.proyectoA1, 'manual', 'Manual del administrador', 'personas', [{ nombre: 'manual-admin.pdf', bytes: 880_000, dia: '04' }]);
  doc(ID.docActa, E.A, ID.proyectoA1, 'acta', 'Acta de la demo del Sprint 1', 'todo_el_equipo', [{ nombre: 'acta-demo-1.pdf', bytes: 95_000, dia: '05' }]);
  doc(ID.docB, E.B, ID.proyectoB1, 'contrato', 'Contrato Servicios Demo', 'todo_el_equipo', [{ nombre: 'contrato-b.pdf', bytes: 150_000, dia: '02' }]);
  // El manual lo ve el admin y quien Websourcing eligió: equipo con dinero.
  rd.docPermisos.push({ id: uuid(), empresa_id: E.A, documento_id: ID.docManual, miembro_id: miembroDe('equipo-dinero@cliente.test').id, otorgado_en: t('04'), revocado_en: null });

  // ---- Revisiones ----
  const revision = (rid, empresa, pid, tipo, sid, titulo, estado, vActual) => rd.revisiones.push({ id: rid, empresa_id: empresa, proyecto_id: pid, tipo, sprint_id: sid, documento_id: null, titulo, estado, version_actual: vActual, creado_en: t('06'), actualizado_en: t('09') });
  const version = (rid, empresa, n, extra = {}) => rd.versiones.push({ id: uuid(), empresa_id: empresa, revision_id: rid, version: n, link_prueba: 'https://prueba.ejemplo.test/demo', video_url: null, acta_documento_id: null, resumen: null, creada_en: t('06'), publicada_en: t('07'), ...extra });
  const aprobacion = (rid, empresa, n, decision, comentario, correo, dia, extra = {}) => {
    const aid = uuid();
    rd.aprobaciones.push({ id: aid, empresa_id: empresa, revision_id: rid, version: n, decision, comentario, captura_path: extra.captura ?? null, miembro_id: miembroDe(correo).id, persona: nombreDe(correo), creado_en: t(dia), _user_id: porCorreo(correo), _ip: '190.24.10.5', _ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36' });
    rd.registro.push({ id: S.seqReg++, empresa_id: empresa, actor_id: porCorreo(correo), actor_tipo: 'usuario', accion: 'revision_respondida', entidad: 'revisiones', entidad_id: rid, detalle: { version: n, decision, aprobacion_id: aid, miembro_id: miembroDe(correo).id, user_agent: '_ua' in extra ? extra._ua : 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36' }, ip: '190.24.10.5', creado_en: t(dia) });
  };
  revision(ID.revDiseno, E.A, ID.proyectoA1, 'diseno', null, 'Diseño y prototipo del portal', 'publicada', 1);
  version(ID.revDiseno, E.A, 1, { link_prueba: 'https://prototipo.ejemplo.test/portal', video_url: 'https://video.ejemplo.test/recorrido', resumen: 'Prototipo navegable con las pantallas del cliente y del equipo.', acta_documento_id: ID.docActa });

  revision(ID.revSprint1, E.A, ID.proyectoA1, 'sprint', ID.sprintA1, 'Sprint 1: Pedidos y catálogo', 'aprobada', 2);
  const capturaRuta = `${E.A}/capturas/${uuid()}.png`; objeto('capturas-revisiones', capturaRuta, 'image/png', 48_000);
  version(ID.revSprint1, E.A, 1, { resumen: 'Pedidos y catálogo, primera entrega.', publicada_en: t('07') });
  version(ID.revSprint1, E.A, 2, { resumen: 'Se corrigió el tamaño del botón de nuevo pedido.', publicada_en: t('09') });
  aprobacion(ID.revSprint1, E.A, 1, 'pido_cambios', 'El botón de nuevo pedido debe verse más grande.', 'admin@cliente.test', '08', { captura: capturaRuta });
  aprobacion(ID.revSprint1, E.A, 2, 'apruebo', 'Todo bien, gracias.', 'admin@cliente.test', '10');

  revision(ID.revSprint2Borrador, E.A, ID.proyectoA1, 'sprint', ID.sprintA2, 'Sprint 2: Pagos y facturas', 'borrador', 1);
  version(ID.revSprint2Borrador, E.A, 1, { link_prueba: 'https://prueba.ejemplo.test/sprint-2', resumen: 'Borrador interno.', publicada_en: null });

  revision(ID.revSprint3Cambios, E.A, ID.proyectoA1, 'sprint', ID.sprintA3, 'Sprint 3: Informes', 'cambios_pedidos', 1);
  version(ID.revSprint3Cambios, E.A, 1, { resumen: 'Informes de ventas.', publicada_en: t('09') });
  aprobacion(ID.revSprint3Cambios, E.A, 1, 'pido_cambios', 'Faltan los totales por mes.', 'admin@cliente.test', '10', { _ua: null });

  revision(ID.revB, E.B, ID.proyectoB1, 'sprint', ID.sprintB1, 'Sprint 1: Reservas', 'publicada', 1);
  version(ID.revB, E.B, 1, { link_prueba: 'https://prueba.ejemplo.test/reservas' });

  // ---- Archivos de la empresa ----
  const archivo = (aid, empresa, nombre, mime, bytes, nota, estado, correo, dia) => {
    const ruta = `${empresa}/archivos/${uuid()}.${nombre.split('.').pop()}`; objeto('archivos-empresa', ruta, mime, bytes);
    rd.archivos.push({ id: aid, empresa_id: empresa, proyecto_id: null, bucket_id: 'archivos-empresa', storage_path: ruta, nombre_original: nombre, mime_type: mime, tamano_bytes: bytes, nota, estado, subido_por: porCorreo(correo), subido_por_nombre: nombreDe(correo), creado_en: t(dia), recibido_en: estado === 'recibido' ? t('11') : null, borrado_en: null });
  };
  archivo(ID.archivoLogo, E.A, 'logo-comercial.png', 'image/png', 84_000, 'Logo con fondo transparente', 'nuevo', 'admin@cliente.test', '05');
  archivo(ID.archivoTextos, E.A, 'textos-sitio.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 32_000, null, 'recibido', 'admin@cliente.test', '04');
  archivo(ID.archivoFotos, E.A, 'fotos-productos.zip', 'application/zip', 4_200_000, 'Fotos de la línea nueva', 'nuevo', 'equipo@cliente.test', '06');

  // Una sola tabla de proyectos y sprints para todos los módulos. Con el perfil 'revdocs' se usan los proyectos y sprints
  // de este módulo (ids fijos); con cualquier otro, los del sprint 2 (proyectos.mjs) y este módulo trabaja sobre ellos.
  if (perfil === 'revdocs') {
    S.proyectos = rd.proyectos; S.sprints = rd.sprints; S.hitos = []; S.historial.length = 0; S.retrasos = []; S.cambios = [];
    rd.proyectos.forEach((p) => crearHitos(S, p));
  } else { rd.proyectos = S.proyectos; rd.sprints = S.sprints; }
}

// ---------------- Lectura de tablas ----------------
const COLUMNAS_V_APROBACIONES = ['id', 'revision_id', 'version', 'decision', 'comentario', 'captura_path', 'persona', 'creado_en'];
/** Igual que la base real: la tabla `aprobaciones` no se lee desde la API (permiso por columna, 42501) y la vista
 *  `v_aprobaciones` solo se lee con columnas explícitas y públicas (sin ip, navegador ni user_id). */
export function selectProhibido(tabla, params) {
  if (tabla === 'aprobaciones') return true;
  if (tabla !== 'v_aprobaciones') return false;
  const sel = params.get('select');
  if (!sel || sel.includes('*')) return true;
  return sel.split(',').map((x) => x.trim()).some((c) => !COLUMNAS_V_APROBACIONES.includes(c));
}

const miembroReal = (S, c) => (c.estado === 'activo' ? S.miembros.find((m) => m.user_id === c.user_id && !m.quitado_en) : null);

export function puedeVerDoc(S, d, c) {
  if (c.estado === 'super_admin') return true;
  if (d.empresa_id !== c.empresa?.id) return false;
  if (d.visibilidad === 'todo_el_equipo') return true;
  if (c.rol === 'admin_cliente') return true;
  if (d.visibilidad === 'personas') {
    const m = miembroReal(S, c);
    return !!m && S.rd.docPermisos.some((p) => p.documento_id === d.id && p.miembro_id === m.id && !p.revocado_en);
  }
  return false;
}
const revVisible = (r, c) => c.estado === 'super_admin' || (r.empresa_id === c.empresa?.id && r.estado !== 'borrador');

export function leer(S, tabla, c, params, filtrar) {
  const rd = S.rd; const esSuper = c.estado === 'super_admin'; const eid = c.empresa?.id; const admin = c.rol === 'admin_cliente';
  const propia = (f) => esSuper || f.empresa_id === eid;
  switch (tabla) {
    case 'proyectos': return filtrar(rd.proyectos.filter(propia), params);
    case 'sprints': return filtrar(rd.sprints.filter(propia), params);
    case 'revisiones': return filtrar(rd.revisiones.filter((r) => revVisible(r, c)), params);
    case 'revision_versiones': {
      const vis = new Set(rd.revisiones.filter((r) => revVisible(r, c)).map((r) => r.id));
      return filtrar(rd.versiones.filter((v) => vis.has(v.revision_id) && (esSuper || v.publicada_en)), params);
    }
    case 'v_aprobaciones': {
      const vis = new Set(rd.revisiones.filter((r) => revVisible(r, c)).map((r) => r.id));
      return filtrar(rd.aprobaciones.filter((a) => vis.has(a.revision_id)), params).map(({ _user_id, _ip, _ua, empresa_id, miembro_id, ...pub }) => pub);
    }
    case 'documentos': return filtrar(rd.documentos.filter((d) => puedeVerDoc(S, d, c)), params);
    case 'documento_versiones': {
      const vis = new Set(rd.documentos.filter((d) => puedeVerDoc(S, d, c)).map((d) => d.id));
      return filtrar(rd.docVersiones.filter((v) => vis.has(v.documento_id)), params);
    }
    case 'documento_permisos': {
      const m = miembroReal(S, c);
      return filtrar(rd.docPermisos.filter((p) => esSuper || (p.empresa_id === eid && (admin || p.miembro_id === m?.id))), params);
    }
    case 'archivos_cliente': return filtrar(rd.archivos.filter((a) => esSuper || (a.empresa_id === eid && !a.borrado_en)), params);
    case 'registro_actividad': return esSuper ? filtrar(rd.registro, params) : [];
    case 'historial_proyecto': return filtrar(rd.historial.filter((h) => esSuper || (h.empresa_id === eid && h.visible_cliente)), params);
    default: return null;
  }
}

// ---------------- Funciones (RPC) ----------------
const NOMBRES = new Set([
  'reservar_subida', 'confirmar_archivo_cliente', 'borrar_archivo_cliente', 'marcar_archivo_recibido',
  'crear_documento', 'confirmar_version_documento', 'fijar_visibilidad_documento', 'anotar_descarga',
  'crear_revision', 'editar_borrador_revision', 'publicar_revision', 'nueva_version_revision', 'reabrir_revision',
  'bandeja_revisiones', 'responder_revision',
]);
export const esFuncionRevDocs = (n) => NOMBRES.has(n);

const https = (v) => v == null || v === '' || /^https:\/\/[^\s]+$/.test(v);

export function rpc(S, nombre, a, c, req, falla) {
  const rd = S.rd; const esSuper = c.estado === 'super_admin'; const enVerComo = c.estado === 'ver_como';
  const miembro = miembroReal(S, c);
  const puedeAprobar = !!miembro && (miembro.rol === 'admin_cliente' || miembro.aprobar);
  const puedeSubir = !!miembro && (miembro.rol === 'admin_cliente' || miembro.subir_archivos);
  if (enVerComo && nombre !== 'anotar_descarga') return falla('ver_como_solo_lectura');
  if (c.estado !== 'activo' && !esSuper && !enVerComo) return falla('no_autorizado');
  const anotar = (empresa, accion, entidad, entidad_id, detalle = {}) => rd.registro.push({ id: S.seqReg++, empresa_id: empresa, actor_id: c.user_id, actor_tipo: 'usuario', accion, entidad, entidad_id, detalle, ip: '190.24.10.5', creado_en: ahora() });
  const historia = (empresa, pid, tipo, detalle, visible) => rd.historial.push({ id: S.seqHist++, empresa_id: empresa, proyecto_id: pid, tipo, actor_tipo: 'equipo_websourcing', detalle, visible_cliente: visible, creado_en: ahora() });
  const rev = (rid) => rd.revisiones.find((r) => r.id === rid);
  const ultima = (rid) => rd.versiones.filter((v) => v.revision_id === rid).sort((x, y) => y.version - x.version)[0];
  const usarReserva = (rid, destino, empresa) => {
    const r = rd.reservas.find((x) => x.id === rid);
    if (!r || r.user_id !== c.user_id || r.destino !== destino || r.usada || (empresa && r.empresa_id !== empresa)) return { error: 'reserva_invalida' };
    if (new Date(r.vence_en) < new Date()) return { error: 'reserva_vencida' };
    const o = rd.storage[`${r.bucket}/${r.ruta}`];
    if (!o) return { error: 'archivo_no_subido' };
    return { r, o };
  };

  switch (nombre) {
    case 'reservar_subida': {
      const { p_destino: dest, p_empresa_id: emp, p_nombre: nom, p_mime: mime, p_tamano: tam } = a;
      if (!['documento', 'archivo_cliente', 'captura'].includes(dest)) return falla('datos_invalidos');
      if (dest === 'documento' ? !esSuper : dest === 'archivo_cliente' ? !(puedeSubir && miembro.empresa_id === emp) : !(puedeAprobar && miembro.empresa_id === emp)) return falla('no_autorizado');
      if (!S.empresas.some((e) => e.id === emp)) return falla('empresa_no_disponible');
      if (!(dest === 'captura' ? TIPOS_CAPTURA : TIPOS_PERMITIDOS).includes(mime)) return falla('tipo_no_permitido');
      if (tam > (dest === 'captura' ? MAX_CAPTURA : MAX_ARCHIVO)) return falla('archivo_demasiado_grande');
      if (!exigirCupo(S, c, emp, tam)) return falla('cupo_espacio_lleno');
      if (rd.reservas.filter((r) => r.user_id === c.user_id && Date.now() - new Date(r.creada_en) < 3600_000).length >= 60) return falla('demasiadas_subidas');
      const bucket = { documento: 'documentos', archivo_cliente: 'archivos-empresa', captura: 'capturas-revisiones' }[dest];
      const carpeta = { documento: 'documentos', archivo_cliente: 'archivos', captura: 'capturas' }[dest];
      const ext = (String(nom).split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
      const reserva = { id: uuid(), user_id: c.user_id, empresa_id: emp, destino: dest, bucket, ruta: `${emp}/${carpeta}/${uuid()}.${ext}`, nombre: nom, mime, tamano: tam, usada: false, creada_en: ahora(), vence_en: new Date(Date.now() + 1800_000).toISOString() };
      rd.reservas.push(reserva);
      return { reserva_id: reserva.id, bucket, ruta: reserva.ruta, vence_en: reserva.vence_en, tamano_maximo: dest === 'captura' ? MAX_CAPTURA : MAX_ARCHIVO };
    }
    case 'confirmar_archivo_cliente': {
      if (!puedeSubir) return falla('no_autorizado');
      const u = usarReserva(a.p_reserva_id, 'archivo_cliente', miembro.empresa_id); if (u.error) return falla(u.error);
      u.r.usada = true;
      const f = { id: uuid(), empresa_id: miembro.empresa_id, proyecto_id: a.p_proyecto_id ?? null, bucket_id: 'archivos-empresa', storage_path: u.r.ruta, nombre_original: u.r.nombre, mime_type: u.o.mime, tamano_bytes: u.r.tamano, nota: a.p_nota?.trim() || null, estado: 'nuevo', subido_por: c.user_id, subido_por_nombre: S.perfiles[c.user_id].nombre, creado_en: ahora(), recibido_en: null, borrado_en: null };
      rd.archivos.push(f); anotar(f.empresa_id, 'archivo_cliente_subido', 'archivos_cliente', f.id, { nombre: f.nombre_original });
      return { archivo_id: f.id };
    }
    case 'borrar_archivo_cliente': {
      if (!miembro) return falla('no_autorizado');
      const f = rd.archivos.find((x) => x.id === a.p_archivo_id && x.empresa_id === miembro.empresa_id && !x.borrado_en);
      if (!f) return falla('archivo_no_encontrado');
      if (f.subido_por !== c.user_id) return falla('no_autorizado');
      if (f.estado === 'recibido') return falla('archivo_ya_recibido');
      f.borrado_en = ahora(); anotar(f.empresa_id, 'archivo_cliente_borrado', 'archivos_cliente', f.id);
      return { bucket: f.bucket_id, ruta: f.storage_path };
    }
    case 'marcar_archivo_recibido': {
      if (!esSuper) return falla('no_autorizado');
      const f = rd.archivos.find((y) => y.id === a.p_archivo_id && !y.borrado_en); if (!f) return falla('archivo_no_encontrado');
      if (f.estado === 'recibido') return falla('archivo_ya_recibido');
      f.estado = 'recibido'; f.recibido_en = ahora(); return null;
    }
    case 'crear_documento': {
      if (!esSuper) return falla('no_autorizado');
      if (!CATEGORIAS.includes(a.p_categoria) || String(a.p_titulo ?? '').trim().length < 2 || !['todo_el_equipo', 'solo_admin', 'personas'].includes(a.p_visibilidad)) return falla('datos_invalidos');
      if (!S.empresas.some((e) => e.id === a.p_empresa_id)) return falla('empresa_no_disponible');
      if (a.p_proyecto_id && !rd.proyectos.some((p) => p.id === a.p_proyecto_id && p.empresa_id === a.p_empresa_id)) return falla('proyecto_no_encontrado');
      const ms = a.p_miembros ?? [];
      if (ms.some((mid) => !S.miembros.some((m) => m.id === mid && m.empresa_id === a.p_empresa_id && !m.quitado_en && !m.bloqueado))) return falla('miembro_invalido');
      const u = usarReserva(a.p_reserva_id, 'documento', a.p_empresa_id); if (u.error) return falla(u.error);
      u.r.usada = true;
      const d = { id: uuid(), empresa_id: a.p_empresa_id, proyecto_id: a.p_proyecto_id ?? null, categoria: a.p_categoria, titulo: a.p_titulo.trim(), descripcion: a.p_descripcion ?? null, visibilidad: a.p_visibilidad, version_actual: 1, creado_en: ahora(), actualizado_en: ahora() };
      rd.documentos.push(d);
      rd.docVersiones.push({ id: uuid(), empresa_id: d.empresa_id, documento_id: d.id, version: 1, bucket_id: 'documentos', storage_path: u.r.ruta, nombre_original: u.r.nombre, mime_type: u.o.mime, tamano_bytes: u.r.tamano, nota: null, creado_en: ahora() });
      if (d.visibilidad === 'personas') ms.forEach((mid) => rd.docPermisos.push({ id: uuid(), empresa_id: d.empresa_id, documento_id: d.id, miembro_id: mid, otorgado_en: ahora(), revocado_en: null }));
      anotar(d.empresa_id, 'documento_creado', 'documentos', d.id, { titulo: d.titulo });
      return { documento_id: d.id, version: 1 };
    }
    case 'confirmar_version_documento': {
      if (!esSuper) return falla('no_autorizado');
      const d = rd.documentos.find((x) => x.id === a.p_documento_id); if (!d) return falla('documento_no_encontrado');
      const u = usarReserva(a.p_reserva_id, 'documento', d.empresa_id); if (u.error) return falla(u.error);
      u.r.usada = true; d.version_actual += 1; d.actualizado_en = ahora();
      rd.docVersiones.push({ id: uuid(), empresa_id: d.empresa_id, documento_id: d.id, version: d.version_actual, bucket_id: 'documentos', storage_path: u.r.ruta, nombre_original: u.r.nombre, mime_type: u.o.mime, tamano_bytes: u.r.tamano, nota: a.p_nota?.trim() || null, creado_en: ahora() });
      return { documento_id: d.id, version: d.version_actual };
    }
    case 'fijar_visibilidad_documento': {
      if (!esSuper) return falla('no_autorizado');
      const d = rd.documentos.find((x) => x.id === a.p_documento_id); if (!d) return falla('documento_no_encontrado');
      if (!['todo_el_equipo', 'solo_admin', 'personas'].includes(a.p_visibilidad)) return falla('datos_invalidos');
      const ms = a.p_miembros ?? [];
      if (ms.some((mid) => !S.miembros.some((m) => m.id === mid && m.empresa_id === d.empresa_id && !m.quitado_en && !m.bloqueado))) return falla('miembro_invalido');
      d.visibilidad = a.p_visibilidad; d.actualizado_en = ahora();
      const activos = rd.docPermisos.filter((p) => p.documento_id === d.id && !p.revocado_en);
      const deseados = a.p_visibilidad === 'personas' ? new Set(ms) : new Set();
      activos.filter((p) => !deseados.has(p.miembro_id)).forEach((p) => { p.revocado_en = ahora(); });
      deseados.forEach((mid) => { if (!activos.some((p) => p.miembro_id === mid)) rd.docPermisos.push({ id: uuid(), empresa_id: d.empresa_id, documento_id: d.id, miembro_id: mid, otorgado_en: ahora(), revocado_en: null }); });
      anotar(d.empresa_id, 'documento_visibilidad_cambiada', 'documentos', d.id, { despues: d.visibilidad });
      return null;
    }
    case 'anotar_descarga': {
      anotar(c.empresa?.id ?? null, a.p_tipo === 'archivo' ? 'archivo_descargado' : 'documento_descargado', a.p_tipo, a.p_id);
      return null;
    }
    case 'crear_revision': {
      if (!esSuper) return falla('no_autorizado');
      if (!['diseno', 'sprint', 'documento'].includes(a.p_tipo) || String(a.p_titulo ?? '').trim().length < 3) return falla('datos_invalidos');
      const p = rd.proyectos.find((x) => x.id === a.p_proyecto_id); if (!p) return falla('proyecto_no_encontrado');
      if (!https(a.p_link_prueba) || !https(a.p_video_url)) return falla('enlace_invalido');
      if (a.p_acta_documento_id) { const d = rd.documentos.find((x) => x.id === a.p_acta_documento_id); if (!d || d.categoria !== 'acta' || d.empresa_id !== p.empresa_id) return falla('acta_invalida'); }
      if (a.p_tipo === 'diseno' && rd.revisiones.some((r) => r.proyecto_id === p.id && r.tipo === 'diseno')) return falla('revision_ya_existe');
      if (a.p_tipo === 'sprint') {
        const s = rd.sprints.find((x) => x.id === a.p_sprint_id && x.proyecto_id === p.id); if (!s) return falla('sprint_no_encontrado');
        if (s.estado === 'propuesto') return falla('sprint_no_revisable');
        if (s.estado === 'terminado') return falla('sprint_ya_terminado');
        if (rd.revisiones.some((r) => r.sprint_id === s.id)) return falla('revision_ya_existe');
      }
      if (a.p_tipo === 'documento' && !rd.documentos.some((x) => x.id === a.p_documento_id && x.empresa_id === p.empresa_id)) return falla('documento_no_encontrado');
      const r = { id: uuid(), empresa_id: p.empresa_id, proyecto_id: p.id, tipo: a.p_tipo, sprint_id: a.p_sprint_id ?? null, documento_id: a.p_documento_id ?? null, titulo: a.p_titulo.trim(), estado: 'borrador', version_actual: 1, creado_en: ahora(), actualizado_en: ahora() };
      rd.revisiones.push(r);
      rd.versiones.push({ id: uuid(), empresa_id: r.empresa_id, revision_id: r.id, version: 1, link_prueba: a.p_link_prueba || null, video_url: a.p_video_url || null, acta_documento_id: a.p_acta_documento_id ?? null, resumen: a.p_resumen?.trim() || null, creada_en: ahora(), publicada_en: null });
      anotar(r.empresa_id, 'revision_creada', 'revisiones', r.id, { titulo: r.titulo });
      return { revision_id: r.id, version: 1 };
    }
    case 'editar_borrador_revision': {
      if (!esSuper) return falla('no_autorizado');
      const r = rev(a.p_revision_id); if (!r) return falla('revision_no_encontrada');
      const v = ultima(r.id); if (v.publicada_en) return falla('sin_borrador');
      if (!https(a.p_link_prueba) || !https(a.p_video_url)) return falla('enlace_invalido');
      if (a.p_acta_documento_id) { const d = rd.documentos.find((x) => x.id === a.p_acta_documento_id); if (!d || d.categoria !== 'acta' || d.empresa_id !== r.empresa_id) return falla('acta_invalida'); }
      if (a.p_titulo !== undefined) r.titulo = a.p_titulo.trim();
      if (a.p_link_prueba !== undefined) v.link_prueba = a.p_link_prueba || null;
      if (a.p_video_url !== undefined) v.video_url = a.p_video_url || null;
      if (a.p_acta_documento_id !== undefined) v.acta_documento_id = a.p_acta_documento_id || null;
      if (a.p_resumen !== undefined) v.resumen = a.p_resumen?.trim() || null;
      r.actualizado_en = ahora(); return null;
    }
    case 'publicar_revision': {
      if (!esSuper) return falla('no_autorizado');
      const r = rev(a.p_revision_id); if (!r) return falla('revision_no_encontrada');
      const v = ultima(r.id); if (v.publicada_en) return falla(r.estado === 'publicada' ? 'revision_ya_publicada' : 'sin_borrador');
      if (r.tipo !== 'documento' && !v.link_prueba && !v.video_url) return falla('revision_sin_contenido');
      v.publicada_en = ahora(); r.estado = 'publicada'; r.version_actual = v.version; r.actualizado_en = ahora();
      const s = rd.sprints.find((x) => x.id === r.sprint_id); if (s) s.estado = 'en_revision';
      historia(r.empresa_id, r.proyecto_id, 'revision_publicada', { revision_id: r.id, titulo: r.titulo, version: v.version }, r.tipo !== 'documento');
      anotar(r.empresa_id, 'revision_estado_cambiado', 'revisiones', r.id, { despues: 'publicada' });
      return { revision_id: r.id, version: v.version };
    }
    case 'nueva_version_revision': {
      if (!esSuper) return falla('no_autorizado');
      const r = rev(a.p_revision_id); if (!r) return falla('revision_no_encontrada');
      if (!['cambios_pedidos', 'reabierta'].includes(r.estado)) return falla('revision_no_editable');
      const u = ultima(r.id); if (!u.publicada_en) return falla('ya_hay_borrador');
      rd.versiones.push({ ...u, id: uuid(), version: u.version + 1, creada_en: ahora(), publicada_en: null });
      return { revision_id: r.id, version: u.version + 1 };
    }
    case 'reabrir_revision': {
      if (!esSuper) return falla('no_autorizado');
      const r = rev(a.p_revision_id); if (!r) return falla('revision_no_encontrada');
      if (r.estado !== 'aprobada') return falla('revision_no_aprobada');
      if (String(a.p_motivo ?? '').trim().length < 5) return falla('datos_invalidos');
      r.estado = 'reabierta'; r.actualizado_en = ahora();
      const s = rd.sprints.find((x) => x.id === r.sprint_id); if (s) { s.estado = 'en_curso'; s.terminado_en = null; }
      historia(r.empresa_id, r.proyecto_id, 'revision_reabierta', { revision_id: r.id, titulo: r.titulo, version: r.version_actual, motivo: a.p_motivo.trim() }, r.tipo !== 'documento');
      anotar(r.empresa_id, 'revision_estado_cambiado', 'revisiones', r.id, { despues: 'reabierta', motivo: a.p_motivo.trim() });
      return null;
    }
    case 'bandeja_revisiones': {
      if (!esSuper) return falla('no_autorizado');
      const items = rd.revisiones.filter((r) => !a.p_empresa_id || r.empresa_id === a.p_empresa_id).map((r) => ({
        revision_id: r.id, empresa_id: r.empresa_id, empresa_nombre: S.empresas.find((e) => e.id === r.empresa_id)?.nombre ?? '',
        proyecto_id: r.proyecto_id, proyecto_nombre: rd.proyectos.find((p) => p.id === r.proyecto_id)?.nombre ?? '',
        tipo: r.tipo, titulo: r.titulo, estado: r.estado, version: r.version_actual, actualizado_en: r.actualizado_en,
      }));
      const de = (...es) => items.filter((i) => es.includes(i.estado));
      return { aprobado: de('aprobada'), cambios_pedidos: de('cambios_pedidos'), esperando_a_websourcing: de('borrador', 'reabierta'), esperando_al_cliente: de('publicada') };
    }
    case 'responder_revision': {
      if (esSuper) return falla('no_autorizado');
      if (!miembro) return falla('no_autorizado');
      if (!puedeAprobar) return falla('sin_permiso_aprobar');
      const r = rev(a.p_revision_id);
      if (!r || r.empresa_id !== miembro.empresa_id || r.estado === 'borrador') return falla('revision_no_encontrada');
      if (r.estado !== 'publicada') return falla('revision_no_pendiente');
      if (a.p_version !== r.version_actual) return falla('version_desactualizada');
      if (!['apruebo', 'pido_cambios'].includes(a.p_decision)) return falla('datos_invalidos');
      const texto = String(a.p_comentario ?? '').trim();
      if (a.p_decision === 'pido_cambios' && texto.length < 5) return falla('cambios_requiere_comentario');
      let captura = null;
      if (a.p_captura_reserva_id) {
        if (a.p_decision !== 'pido_cambios') return falla('datos_invalidos');
        const u = usarReserva(a.p_captura_reserva_id, 'captura', r.empresa_id); if (u.error) return falla(u.error);
        u.r.usada = true; captura = u.r.ruta;
      }
      const aid = uuid(); const ua = String(req?.headers?.['user-agent'] ?? '').slice(0, 300); const ip = '190.24.10.5';
      rd.aprobaciones.push({ id: aid, empresa_id: r.empresa_id, revision_id: r.id, version: a.p_version, decision: a.p_decision, comentario: texto || null, captura_path: captura, miembro_id: miembro.id, persona: S.perfiles[c.user_id].nombre, creado_en: ahora(), _user_id: c.user_id, _ip: ip, _ua: ua });
      rd.registro.push({ id: S.seqReg++, empresa_id: r.empresa_id, actor_id: c.user_id, actor_tipo: 'usuario', accion: 'revision_respondida', entidad: 'revisiones', entidad_id: r.id, detalle: { version: a.p_version, decision: a.p_decision, aprobacion_id: aid, miembro_id: miembro.id, user_agent: ua }, ip, creado_en: ahora() });
      r.estado = a.p_decision === 'apruebo' ? 'aprobada' : 'cambios_pedidos'; r.actualizado_en = ahora();
      const s = rd.sprints.find((x) => x.id === r.sprint_id);
      if (s) { s.estado = r.estado === 'aprobada' ? 'terminado' : 'en_curso'; s.terminado_en = r.estado === 'aprobada' ? ahora() : null; }
      historia(r.empresa_id, r.proyecto_id, a.p_decision === 'apruebo' ? 'revision_aprobada' : 'revision_cambios_pedidos', { revision_id: r.id, titulo: r.titulo, version: a.p_version }, r.tipo !== 'documento');
      return { aprobacion_id: aid, estado: r.estado };
    }
    default: return undefined;
  }
}

// ---------------- Storage ----------------
/** Quién puede leer un objeto (misma idea que las reglas de storage.objects). */
function puedeLeerObjeto(S, o, c) {
  if (!c) return false;
  if (c.estado === 'super_admin') return true;
  const eid = c.empresa?.id; if (o.ruta.split('/')[0] !== eid) return false;
  if (o.bucket === 'documentos') {
    const v = S.rd.docVersiones.find((x) => x.storage_path === o.ruta);
    const d = v && S.rd.documentos.find((x) => x.id === v.documento_id);
    return !!d && puedeVerDoc(S, d, c);
  }
  if (o.bucket === 'archivos-empresa') { const f = S.rd.archivos.find((x) => x.storage_path === o.ruta); return !!f && !f.borrado_en; }
  if (o.bucket === 'capturas-revisiones') return S.rd.aprobaciones.some((x) => x.captura_path === o.ruta);
  return false;
}

/** Devuelve true si atendió la ruta. `c` es el contexto activo de quien llama (o null). */
export function almacenamiento(S, req, res, url, raw, body, c, json, error) {
  const m = url.pathname.match(/^\/storage\/v1\/object(?:\/(sign|authenticated))?\/([^/]+)(?:\/(.+))?$/);
  if (!m) return false;
  const [, modo, bucket, rutaCod] = m; const ruta = rutaCod ? decodeURIComponent(rutaCod) : '';
  const rd = S.rd; const clave = `${bucket}/${ruta}`;
  const sinPermiso = () => error(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
  // Descargar con el enlace firmado
  if (req.method === 'GET' && modo === 'sign') {
    const t = rd.firmas?.[url.searchParams.get('token')];
    const o = rd.storage[clave];
    if (!t || !o || t.clave !== clave || t.vence < Date.now()) return error(res, 400, { statusCode: '400', error: 'InvalidJWT', message: 'invalid or expired token' }), true;
    const nombre = url.searchParams.get('download');
    res.writeHead(200, { 'content-type': o.mime, 'content-disposition': `attachment; filename="${(nombre && nombre !== 'true' ? nombre : ruta.split('/').pop())}"` });
    res.end('contenido de prueba');
    return true;
  }
  // Pedir un enlace firmado
  if (req.method === 'POST' && modo === 'sign') {
    const o = rd.storage[clave];
    if (!o || !puedeLeerObjeto(S, o, c)) return error(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' }), true;
    rd.firmas ??= {}; const token = crypto.randomBytes(16).toString('hex');
    rd.firmas[token] = { clave, vence: Date.now() + (Number(body.expiresIn) || 600) * 1000 };
    json(res, 200, { signedURL: `/object/sign/${bucket}/${ruta}?token=${token}` });
    return true;
  }
  // Subir
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!c) return sinPermiso(), true;
    const r = rd.reservas.find((x) => x.bucket === bucket && x.ruta === ruta && x.user_id === c.user_id && !x.usada);
    if (!r || new Date(r.vence_en) < new Date() || rd.storage[clave]) return sinPermiso(), true;
    rd.storage[clave] = { bucket, ruta, size: raw.length, mime: r.mime };
    json(res, 200, { Id: uuid(), Key: clave });
    return true;
  }
  // Borrar (el cliente borra lo suyo después de borrar_archivo_cliente)
  if (req.method === 'DELETE' && !ruta) {
    const quitados = [];
    for (const p of body.prefixes ?? []) {
      const f = rd.archivos.find((x) => x.storage_path === p && x.bucket_id === bucket);
      if (!c || !f || !f.borrado_en || f.subido_por !== c.user_id) continue;
      delete rd.storage[`${bucket}/${p}`]; quitados.push({ name: p });
    }
    json(res, 200, quitados);
    return true;
  }
  return false;
}
