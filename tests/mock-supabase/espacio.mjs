// Parte del Supabase SIMULADO para la solicitud de cambio 5 (ahorro de espacio): cupo por empresa, enlaces de video de tickets
// y registro de archivos archivados. Imita supabase/migrations/20270120000400_ahorro_de_espacio.sql. Todos los datos son inventados.
import crypto from 'node:crypto';

export const NO_ES_ESPACIO = Symbol('no_es_espacio');
const MB = 1024 * 1024;
const GB = 1024 * MB;
const CUPO_POR_DEFECTO = GB;
const URL_OK = /^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{2,5})?(\/[^\s\x00-\x1f]*)?$/;
const uuid = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();
const dias = (n) => new Date(Date.now() - n * 86400000).toISOString();

export function sembrar(S) {
  const A = S.E.A; const B = S.E.B;
  const arch = (empresa, nombre, bytes, estado, marcado) => ({
    id: uuid(), empresa_id: empresa, proyecto_id: null, origen_tabla: 'documento_versiones', origen_id: uuid(), bucket_id: 'documentos', storage_path: `${empresa}/documentos/${uuid()}.pdf`,
    nombre_original: nombre, tamano_bytes: bytes, estado, ubicacion_externa: estado === 'marcado' ? null : `hostinger:/archivo/${empresa}/${nombre}`, marcado_en: marcado,
    trasladado_en: estado === 'marcado' ? null : dias(20), borrado_supabase_en: estado === 'borrado_de_supabase' ? dias(19) : null, recuperacion_pedida_en: null, recuperado_en: null,
  });
  S.esp = {
    cupos: {}, // empresa -> bytes (si no hay, 1 GB)
    usado: { [A]: 380 * MB, [B]: 24 * MB, [S.E.C ?? 'c']: 5 * MB },
    enlaces: [],
    archivados: [
      arch(A, 'planos-bodega-v1.pdf', 48 * MB, 'borrado_de_supabase', dias(60)),
      arch(A, 'video-demo-sprint-1.mp4', 19 * MB, 'trasladado', dias(45)),
      arch(A, 'manual-anterior.pdf', 6 * MB, 'marcado', dias(2)),
      arch(B, 'contrato-anterior.pdf', 3 * MB, 'borrado_de_supabase', dias(90)),
    ],
  };
}

export const cupoDe = (S, empresa) => S.esp.cupos[empresa] ?? CUPO_POR_DEFECTO;
const estadoDe = (usado, cupo) => (usado >= cupo ? 'lleno' : usado * 100 >= cupo * 80 ? 'aviso' : 'ok');
const pct = (usado, cupo) => Math.round((usado * 1000) / cupo) / 10;

/** Igual que private.exigir_cupo: quien no es super admin no sube si se pasa del cupo. Suma lo subido. */
export function exigirCupo(S, c, empresa, bytes) {
  if (c.estado === 'super_admin' || !S.esp) return true;
  const usado = S.esp.usado[empresa] ?? 0;
  if (usado + Math.max(bytes ?? 0, 0) > cupoDe(S, empresa)) return false;
  S.esp.usado[empresa] = usado + Math.max(bytes ?? 0, 0);
  return true;
}

export function leer(S, tabla, c) {
  const esSuper = c.estado === 'super_admin';
  if (tabla === 'archivos_archivados') {
    if (esSuper) return S.esp.archivados;
    return c.rol === 'admin_cliente' ? S.esp.archivados.filter((x) => x.empresa_id === c.empresa?.id) : [];
  }
  if (tabla === 'ticket_enlaces_video') {
    const ids = new Set(S.tm.tickets.filter((t) => esSuper || (t.empresa_id === c.empresa?.id && (c.rol === 'admin_cliente' || c.permisos?.ver_todos_tickets || t.creado_por === c.user_id))).map((t) => t.id));
    return S.esp.enlaces.filter((e) => ids.has(e.ticket_id));
  }
  return undefined;
}

export function rpc(S, nombre, a, c, falla) {
  const esSuper = c.estado === 'super_admin';
  const esp = S.esp;
  switch (nombre) {
    case 'espacio_de_empresa': {
      let emp;
      if (esSuper) emp = a.p_empresa_id; else if (c.estado === 'activo' && c.rol === 'admin_cliente') emp = c.empresa.id; else if (c.estado === 'ver_como' && c.rol === 'admin_cliente') emp = c.empresa.id; else return falla('no_autorizado');
      if (!emp || !S.empresas.some((e) => e.id === emp)) return falla('empresa_no_encontrada');
      const usado = esp.usado[emp] ?? 0; const cupo = cupoDe(S, emp);
      return { empresa_id: emp, usado_bytes: usado, cupo_bytes: cupo, porcentaje: pct(usado, cupo), estado: estadoDe(usado, cupo) };
    }
    case 'espacio_por_empresas': {
      if (!esSuper) return falla('no_autorizado');
      return S.empresas.map((e) => ({ empresa_id: e.id, nombre: e.nombre, usado_bytes: esp.usado[e.id] ?? 0, cupo_bytes: cupoDe(S, e.id), porcentaje: pct(esp.usado[e.id] ?? 0, cupoDe(S, e.id)) }))
        .sort((x, y) => y.porcentaje - x.porcentaje || x.nombre.localeCompare(y.nombre));
    }
    case 'fijar_cupo_espacio': {
      if (!esSuper) return falla('no_autorizado');
      if (!S.empresas.some((e) => e.id === a.p_empresa_id)) return falla('empresa_no_encontrada');
      if (a.p_cupo_bytes === null || a.p_cupo_bytes === undefined) delete esp.cupos[a.p_empresa_id];
      else { if (!(a.p_cupo_bytes >= 10 * MB && a.p_cupo_bytes <= 1024 * GB)) return falla('datos_invalidos'); esp.cupos[a.p_empresa_id] = Number(a.p_cupo_bytes); }
      return { empresa_id: a.p_empresa_id, cupo_bytes: cupoDe(S, a.p_empresa_id) };
    }
    case 'agregar_enlace_video_ticket': {
      const t = S.tm.tickets.find((x) => x.id === a.p_ticket_id && (esSuper || (x.empresa_id === c.empresa?.id && (c.rol === 'admin_cliente' || c.permisos?.ver_todos_tickets || x.creado_por === c.user_id))));
      if (!t) return falla('ticket_no_encontrado');
      if (t.estado === 'cerrado') return falla('ticket_cerrado');
      const url = String(a.p_url ?? '').trim();
      if (!URL_OK.test(url) || url.length < 12 || url.length > 500) return falla('enlace_invalido');
      if (esp.enlaces.filter((e) => e.ticket_id === t.id).length >= 10) return falla('demasiados_enlaces');
      const e = { id: uuid(), empresa_id: t.empresa_id, ticket_id: t.id, mensaje_id: a.p_mensaje_id ?? null, subido_por: c.user_id, url, creado_en: ahora() };
      esp.enlaces.push(e);
      return { enlace_id: e.id };
    }
    case 'pedir_recuperar_archivo': {
      const x = esp.archivados.find((y) => y.id === a.p_id && (esSuper || (y.empresa_id === c.empresa?.id && c.rol === 'admin_cliente')));
      if (!x) return falla('archivo_no_encontrado');
      if (!['trasladado', 'borrado_de_supabase'].includes(x.estado)) return falla('archivo_no_archivado');
      x.estado = 'recuperacion_pedida'; x.recuperacion_pedida_en = ahora();
      return { archivo_id: x.id, estado: 'recuperacion_pedida' };
    }
    default: return NO_ES_ESPACIO;
  }
}
