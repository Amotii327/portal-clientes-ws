/**
 * DATOS DE EJEMPLO del prototipo. Todo vive en memoria (se reinicia al recargar).
 * Los montos en COP son de ejemplo, no son valores reales ni precios de Websourcing.
 * No hay personas con nombre: se usan áreas o cargos genéricos.
 */

export type Rol = 'super' | 'admin' | 'equipo';
export type HitoEstado = 'pendiente' | 'en_curso' | 'esperando' | 'terminado';
export type Lado = 'websourcing' | 'cliente';
export type Area = 'Producto' | 'Arquitectura' | 'Diseño' | 'Desarrollo' | 'Calidad' | 'Operaciones';

export interface Hito {
  n: number;
  nombre: string;
  estado: HitoEstado;
  planeada: string;
  real?: string;
  pagoId?: string; // pago asociado (se oculta si no se puede ver dinero)
  detalle?: string;
  retraso?: { anterior: string; nueva: string; motivo: string; lado: Lado; falta?: string };
  sprint?: { actual: number; total: number };
  soloMantenimiento?: boolean; // hito 13: invisible si el mantenimiento está apagado
}
export interface Proyecto {
  id: string;
  nombre: string;
  sprintsTotal: number;
  sprintsHechos: number;
  sprintActual?: number;
  proximaDemo?: string;
  hitos: Hito[];
  historial: { cuando: string; texto: string }[];
}
export type RevEstado = 'borrador' | 'publicada' | 'aprobada' | 'cambios_pedidos';
export interface Revision {
  id: string; proyectoId: string; titulo: string; tipo: 'Sprint' | 'Diseño'; version: number;
  estado: RevEstado; publicada?: string; link: string; video?: string; acta: string; resumen: string;
  decision?: { quien: string; cuando: string; comentario: string; version: number };
}
export type PagoEstado = 'pagado' | 'proximo' | 'vencido' | 'en_revision' | 'pendiente';
export interface Pago { id: string; concepto: string; hito?: string; valor: number; vence: string; estado: PagoEstado; origen?: 'contrato' | 'mantenimiento'; rechazo?: string }
export interface Abono { id: string; pagoId: string; valor: number; fecha: string; medio: string }
export interface Factura { id: string; numero: string; valor: number; fecha: string; concepto: string }
export interface Comprobante { id: string; pagoId: string; archivo: string; subidoPor: string; fecha: string; estado: 'en_revision' | 'confirmado' | 'rechazado'; motivo?: string }
export interface Contrato { proyectoId: string; nombre: string; valor: number; firma: string }

export type TicketTipo = 'Error' | 'Solicitud de cambio' | 'Pregunta' | 'Acceso';
export type Prioridad = 'Urgente' | 'Alta' | 'Normal' | 'Baja';
export type TicketEstado = 'Nuevo' | 'Clasificado' | 'En progreso' | 'Esperando al cliente' | 'Resuelto' | 'Cerrado';
export interface Mensaje { de: 'cliente' | 'websourcing' | 'nota'; quien: string; texto: string; cuando: string; adjuntos?: string[] }
export interface Ticket {
  id: string; titulo: string; tipo: TicketTipo; propuesta: Prioridad; prioridad: Prioridad; estado: TicketEstado;
  creadoPor: string; creadorId: string; fecha: string; proyecto?: string; empresaId: string;
  respuesta: { totalH: number; restanteH: number | null }; // restanteH null = ya se respondió
  mensajes: Mensaje[]; fueraDePlan?: boolean; cambio?: { valor: number; decision: 'pendiente' | 'cobrar' | 'regalar' | 'rechazar'; aceptada?: boolean };
  calificacion?: number; horas?: number;
}
export type Categoria = 'Contrato' | 'Propuesta' | 'Requerimientos' | 'Arquitectura' | 'Acta' | 'Manual' | 'Entregable' | 'Otro';
export interface Documento { id: string; nombre: string; categoria: Categoria; visibilidad: 'todo' | 'admin'; versiones: { v: number; fecha: string; tamano: string; nota: string }[] }
export interface ArchivoEmpresa { id: string; nombre: string; nota: string; subidoPor: string; fecha: string; tamano: string; estado: 'nuevo' | 'recibido' }
export interface Permisos { aprobar: boolean; verDinero: boolean; verTodosTickets: boolean; subirArchivos: boolean }
export interface Miembro { id: string; cargo: string; correo: string; rol: 'admin' | 'equipo'; permisos: Permisos; estado: 'activo' | 'invitado' | 'bloqueado'; ultimoAcceso?: string }
export interface Mantenimiento {
  activo: boolean; plan: 'Básico' | 'Estándar' | 'Premium' | 'A la medida'; inicio: string; fin: string; renovacion: boolean;
  cuota: number; horasMes: number; horasUsadas: number; acumular: boolean; revisionesSemana: number; dias: string; horario: string;
  tiempos: Record<Prioridad, string>; incluye: Record<string, boolean>; otros: string; horaExtra: number; proximaRevision: string;
  historial: { cuando: string; parametro: string; antes: string; despues: string; efectivo: string; motivo: string }[];
  horasRegistradas: { ticket: string; horas: number; estado: 'pendiente_dueno' | 'aprobada' | 'extra_pendiente_cliente'; fecha: string }[];
}
export interface Empresa {
  id: string; nombre: string; razonSocial: string; nit: string; correoFacturas: string; estado: 'activa' | 'pausada';
  proyectos: Proyecto[]; revisiones: Revision[]; contratos: Contrato[]; pagos: Pago[]; abonos: Abono[]; facturas: Factura[];
  comprobantes: Comprobante[]; tickets: Ticket[]; documentos: Documento[]; archivos: ArchivoEmpresa[]; miembros: Miembro[];
  mantenimiento: Mantenimiento;
}
export interface Actividad { cuando: string; quien: string; accion: string; empresa: string; ip: string }

export const NOMBRES_HITOS = [
  'Inicio del proyecto', 'Descubrimiento', 'Requerimientos aprobados', 'Arquitectura', 'Diseño y prototipo', 'Sprints',
  'Pruebas finales', 'Pruebas del cliente', 'Capacitación', 'Salida a producción', 'Entrega final', 'Garantía (30 días)', 'Mantenimiento',
];

const h = (n: number, estado: HitoEstado, planeada: string, extra: Partial<Hito> = {}): Hito => ({ n, nombre: NOMBRES_HITOS[n - 1], estado, planeada, ...extra });

/** Avance (D-013): hitos 1-5 y 7-12 pesan igual; el 6 se reparte por sprint; el 13 no cuenta. */
export function avance(p: Proyecto) {
  const partes = 11 + p.sprintsTotal;
  const hechos = p.hitos.filter((x) => x.n !== 6 && x.n !== 13 && x.estado === 'terminado').length + p.sprintsHechos;
  return { partes, hechos, pct: Math.round((hechos / partes) * 100) };
}

const noIncluye = { 'Corrección de errores': false, 'Copias de seguridad': false, Monitoreo: false, 'Actualizaciones de seguridad': false, 'Auditoría trimestral': false, 'Pequeños ajustes': false };

// ---------------------------------------------------------------- Websourcing
const ws: Empresa = {
  id: 'websourcing', nombre: 'Websourcing', razonSocial: 'Amotii (proyecto interno)', nit: '000.000.000-0 (ejemplo)', correoFacturas: 'facturas@ejemplo.co', estado: 'activa',
  proyectos: [{
    id: 'portal', nombre: 'Portal de clientes', sprintsTotal: 3, sprintsHechos: 0, proximaDemo: '2026-12-11',
    hitos: [
      h(1, 'terminado', '2026-11-12', { real: '2026-11-12', pagoId: 'w-p1' }),
      h(2, 'terminado', '2026-11-17', { real: '2026-11-17' }),
      h(3, 'terminado', '2026-11-19', { real: '2026-11-19' }),
      h(4, 'terminado', '2026-11-20', { real: '2026-11-19' }),
      h(5, 'esperando', '2026-11-27', { pagoId: 'w-p2', detalle: 'Prototipo navegable listo para tu revisión.' }),
      h(6, 'pendiente', '2027-01-22', { pagoId: 'w-p3', sprint: { actual: 1, total: 3 }, retraso: { anterior: '2026-12-04', nueva: '2026-12-11', motivo: 'El diseño llegó a revisión una semana después de lo previsto por ajustes de marca.', lado: 'websourcing' } }),
      h(7, 'pendiente', '2027-02-05'), h(8, 'pendiente', '2027-02-12'), h(9, 'pendiente', '2027-02-19'), h(10, 'pendiente', '2027-02-26'),
      h(11, 'pendiente', '2027-03-05', { pagoId: 'w-p4' }), h(12, 'pendiente', '2027-04-04'), h(13, 'pendiente', '2027-04-05', { soloMantenimiento: true }),
    ],
    historial: [
      { cuando: '2026-11-20', texto: 'Diseño y prototipo publicado para tu revisión (versión 1).' },
      { cuando: '2026-11-19', texto: 'Requerimientos y arquitectura aprobados.' },
      { cuando: '2026-11-12', texto: 'Proyecto iniciado y anticipo registrado.' },
    ],
  }],
  revisiones: [{
    id: 'w-r1', proyectoId: 'portal', titulo: 'Diseño y prototipo', tipo: 'Diseño', version: 1, estado: 'publicada', publicada: '2026-11-20',
    link: 'https://demo.portal.websourcing.com.co/prototipo', acta: 'Acta de diseño v1', resumen: 'Mapa de pantallas, sistema de diseño y prototipo navegable de todas las pantallas, con sus estados especiales.',
  }],
  contratos: [{ proyectoId: 'portal', nombre: 'Portal de clientes', valor: 36000000, firma: '2026-11-10' }],
  pagos: [
    { id: 'w-p1', concepto: 'Anticipo (40 %)', hito: '1 · Inicio del proyecto', valor: 14400000, vence: '2026-11-12', estado: 'pagado', origen: 'contrato' },
    { id: 'w-p2', concepto: 'Segundo pago (20 %)', hito: '5 · Diseño y prototipo', valor: 7200000, vence: '2026-11-30', estado: 'proximo', origen: 'contrato' },
    { id: 'w-p3', concepto: 'Pago por sprints (20 %)', hito: '6 · Sprints', valor: 7200000, vence: '2027-01-22', estado: 'pendiente', origen: 'contrato' },
    { id: 'w-p4', concepto: 'Saldo final (20 %)', hito: '11 · Entrega final', valor: 7200000, vence: '2027-03-05', estado: 'pendiente', origen: 'contrato' },
  ],
  abonos: [{ id: 'w-a1', pagoId: 'w-p1', valor: 14400000, fecha: '2026-11-12', medio: 'Transferencia' }],
  facturas: [{ id: 'w-f1', numero: 'Factura 0101 (ejemplo)', valor: 14400000, fecha: '2026-11-12', concepto: 'Anticipo · Portal de clientes' }],
  comprobantes: [],
  tickets: [{
    id: 'T-0001', titulo: '¿Dónde se publicarán las demos de cada sprint?', tipo: 'Pregunta', propuesta: 'Normal', prioridad: 'Normal', estado: 'Resuelto', creadoPor: 'Administrador', creadorId: 'w-m1', fecha: '2026-11-18', proyecto: 'Portal de clientes', empresaId: 'websourcing',
    respuesta: { totalH: 16, restanteH: null },
    mensajes: [
      { de: 'cliente', quien: 'Administrador', texto: 'Quiero saber en qué dirección veré las demos de cada sprint.', cuando: '2026-11-18 09:12' },
      { de: 'websourcing', quien: 'Equipo Websourcing · Operaciones', texto: 'Cada demo se publica en una dirección de prueba propia. Te llegará un aviso por correo con el enlace y el acta.', cuando: '2026-11-18 11:40' },
    ],
  }],
  documentos: [
    { id: 'w-d1', nombre: 'Propuesta y cotización', categoria: 'Propuesta', visibilidad: 'todo', versiones: [{ v: 1, fecha: '2026-11-08', tamano: '420 KB', nota: 'Versión enviada' }] },
    { id: 'w-d2', nombre: 'Requerimientos del portal', categoria: 'Requerimientos', visibilidad: 'todo', versiones: [{ v: 1, fecha: '2026-11-16', tamano: '180 KB', nota: 'Primera versión' }, { v: 2, fecha: '2026-11-18', tamano: '196 KB', nota: 'Se agrega mantenimiento' }, { v: 3, fecha: '2026-11-19', tamano: '210 KB', nota: 'Aprobada' }] },
    { id: 'w-d3', nombre: 'Arquitectura (resumen para el cliente)', categoria: 'Arquitectura', visibilidad: 'todo', versiones: [{ v: 4, fecha: '2026-11-19', tamano: '260 KB', nota: 'Aprobada' }] },
  ],
  archivos: [],
  miembros: [
    { id: 'w-m1', cargo: 'Administrador', correo: 'administrador@ejemplo.co', rol: 'admin', estado: 'activo', ultimoAcceso: '2026-11-20 08:30', permisos: { aprobar: true, verDinero: true, verTodosTickets: true, subirArchivos: true } },
    { id: 'w-m2', cargo: 'Producto', correo: 'producto@ejemplo.co', rol: 'equipo', estado: 'activo', ultimoAcceso: '2026-11-19 17:02', permisos: { aprobar: false, verDinero: false, verTodosTickets: false, subirArchivos: false } },
  ],
  mantenimiento: { activo: false, plan: 'Estándar', inicio: '2027-04-05', fin: '', renovacion: true, cuota: 0, horasMes: 0, horasUsadas: 0, acumular: false, revisionesSemana: 1, dias: 'Lunes a viernes', horario: '8 a. m. a 6 p. m.', tiempos: { Urgente: '2 horas hábiles', Alta: '1 día hábil', Normal: '2 días hábiles', Baja: 'Siguiente planeación' }, incluye: { ...noIncluye }, otros: '', horaExtra: 0, proximaRevision: '', historial: [], horasRegistradas: [] },
};

// ---------------------------------------------------------------- Empresa Ejemplo
const ej: Empresa = {
  id: 'ejemplo', nombre: 'Comercial Ejemplo S.A.S.', razonSocial: 'Comercial Ejemplo S.A.S. (ficticia)', nit: '900.000.000-0 (ejemplo)', correoFacturas: 'contabilidad@empresa-ejemplo.co', estado: 'activa',
  proyectos: [
    {
      id: 'pedidos', nombre: 'App de pedidos', sprintsTotal: 3, sprintsHechos: 1, sprintActual: 2, proximaDemo: '2026-11-27',
      hitos: [
        h(1, 'terminado', '2026-09-01', { real: '2026-09-04', pagoId: 'e-p1' }),
        h(2, 'terminado', '2026-09-15', { real: '2026-09-15' }),
        h(3, 'terminado', '2026-09-25', { real: '2026-09-26' }),
        h(4, 'terminado', '2026-10-02', { real: '2026-10-05', retraso: { anterior: '2026-10-02', nueva: '2026-10-05', motivo: 'Se necesitó un día más para revisar la seguridad de la arquitectura.', lado: 'websourcing' } }),
        h(5, 'terminado', '2026-10-30', { real: '2026-10-30', pagoId: 'e-p2' }),
        h(6, 'en_curso', '2026-12-18', { pagoId: 'e-p3', sprint: { actual: 2, total: 3 }, retraso: { anterior: '2026-12-04', nueva: '2026-12-18', motivo: 'Faltan el catálogo de productos y las fotos que debe entregar la empresa.', lado: 'cliente', falta: 'Subir el catálogo de productos y las fotos en "Archivos de la empresa".' } }),
        h(7, 'pendiente', '2027-01-15'), h(8, 'pendiente', '2027-01-22'), h(9, 'pendiente', '2027-01-29'), h(10, 'pendiente', '2027-02-05'),
        h(11, 'pendiente', '2027-02-12', { pagoId: 'e-p4' }), h(12, 'pendiente', '2027-03-14'), h(13, 'pendiente', '2027-03-15', { soloMantenimiento: true }),
      ],
      historial: [
        { cuando: '2026-11-18', texto: 'Sprint 2 publicado para tu aprobación.' },
        { cuando: '2026-11-12', texto: 'Fecha del hito Sprints movida al 18 dic. Motivo: faltan archivos de la empresa.' },
        { cuando: '2026-11-02', texto: 'Sprint 1 aprobado por Administrador (versión 1).' },
        { cuando: '2026-10-30', texto: 'Diseño y prototipo aprobado por Administrador (versión 2).' },
      ],
    },
    {
      id: 'tienda', nombre: 'Tienda en línea', sprintsTotal: 2, sprintsHechos: 2, proximaDemo: undefined,
      hitos: [
        ...['2026-03-02', '2026-03-16', '2026-03-30', '2026-04-13', '2026-05-04', '2026-06-15', '2026-07-13', '2026-07-27', '2026-08-10', '2026-08-20', '2026-08-30', '2026-09-29'].map((d, i) =>
          h(i + 1, 'terminado', d, { real: d, ...(i === 5 ? { sprint: { actual: 2, total: 2 } } : {}) })),
        h(13, 'en_curso', '2026-10-01', { pagoId: 'e-pm', soloMantenimiento: true, detalle: 'Plan Estándar activo desde el 1 oct 2026.' }),
      ],
      historial: [{ cuando: '2026-09-29', texto: 'Garantía terminada. Comienza el mantenimiento.' }, { cuando: '2026-08-30', texto: 'Entrega final firmada.' }],
    },
  ],
  revisiones: [
    { id: 'e-r0', proyectoId: 'pedidos', titulo: 'Diseño y prototipo', tipo: 'Diseño', version: 2, estado: 'aprobada', publicada: '2026-10-27', link: 'https://demo.portal.websourcing.com.co/ejemplo/diseno', acta: 'Acta de diseño v2', resumen: 'Pantallas de pedidos, clientes y reportes.', decision: { quien: 'Administrador', cuando: '2026-10-30 15:20', comentario: 'Aprobado con la nueva paleta.', version: 2 } },
    { id: 'e-r1', proyectoId: 'pedidos', titulo: 'Sprint 1', tipo: 'Sprint', version: 1, estado: 'aprobada', publicada: '2026-10-30', link: 'https://demo.portal.websourcing.com.co/ejemplo/sprint-1', acta: 'Acta del sprint 1', resumen: 'Ingreso de usuarios y creación de pedidos.', decision: { quien: 'Administrador', cuando: '2026-11-02 10:05', comentario: 'Todo bien.', version: 1 } },
    { id: 'e-r2', proyectoId: 'pedidos', titulo: 'Sprint 2', tipo: 'Sprint', version: 1, estado: 'publicada', publicada: '2026-11-18', link: 'https://demo.portal.websourcing.com.co/ejemplo/sprint-2', video: 'Video de la demo (6 min)', acta: 'Acta del sprint 2', resumen: 'Seguimiento de pedidos, cambio de estado y avisos por correo a los clientes.' },
    { id: 'e-r3', proyectoId: 'pedidos', titulo: 'Sprint 3', tipo: 'Sprint', version: 1, estado: 'borrador', link: 'https://demo.portal.websourcing.com.co/ejemplo/sprint-3', acta: 'Acta del sprint 3', resumen: 'Reportes y exportación a hoja de cálculo.' },
    { id: 'e-r4', proyectoId: 'pedidos', titulo: 'Ajustes de diseño (tarjetas de pedido)', tipo: 'Diseño', version: 1, estado: 'cambios_pedidos', publicada: '2026-10-20', link: 'https://demo.portal.websourcing.com.co/ejemplo/diseno-v1', acta: 'Acta de diseño v1', resumen: 'Primera propuesta de pantallas.', decision: { quien: 'Administrador', cuando: '2026-10-22 09:41', comentario: 'Cambiar los colores de los estados y agrandar el botón de nuevo pedido.', version: 1 } },
  ],
  contratos: [{ proyectoId: 'pedidos', nombre: 'App de pedidos', valor: 48000000, firma: '2026-08-28' }],
  pagos: [
    { id: 'e-p1', concepto: 'Anticipo (40 %)', hito: '1 · Inicio del proyecto', valor: 19200000, vence: '2026-09-04', estado: 'pagado', origen: 'contrato' },
    { id: 'e-p2', concepto: 'Segundo pago (20 %)', hito: '5 · Diseño y prototipo', valor: 9600000, vence: '2026-10-30', estado: 'pagado', origen: 'contrato' },
    { id: 'e-p3', concepto: 'Pago por sprints (20 %)', hito: '6 · Sprints', valor: 9600000, vence: '2026-11-15', estado: 'vencido', origen: 'contrato' },
    { id: 'e-p4', concepto: 'Saldo final (20 %)', hito: '11 · Entrega final', valor: 9600000, vence: '2027-02-12', estado: 'pendiente', origen: 'contrato' },
    { id: 'e-pm', concepto: 'Cuota de mantenimiento · noviembre', hito: '13 · Mantenimiento', valor: 1020000, vence: '2026-11-25', estado: 'en_revision', origen: 'mantenimiento' },
  ],
  abonos: [
    { id: 'e-a1', pagoId: 'e-p1', valor: 19200000, fecha: '2026-09-04', medio: 'Transferencia' },
    { id: 'e-a2', pagoId: 'e-p2', valor: 9600000, fecha: '2026-10-30', medio: 'Transferencia' },
  ],
  facturas: [
    { id: 'e-f1', numero: 'Factura 0143 (ejemplo)', valor: 19200000, fecha: '2026-09-04', concepto: 'Anticipo · App de pedidos' },
    { id: 'e-f2', numero: 'Factura 0151 (ejemplo)', valor: 9600000, fecha: '2026-10-30', concepto: 'Segundo pago · App de pedidos' },
  ],
  comprobantes: [{ id: 'e-c1', pagoId: 'e-pm', archivo: 'comprobante-transferencia.pdf', subidoPor: 'Administrador', fecha: '2026-11-19', estado: 'en_revision' }],
  tickets: [
    {
      id: 'T-0014', titulo: 'No puedo entrar a la app desde el celular', tipo: 'Error', propuesta: 'Urgente', prioridad: 'Urgente', estado: 'En progreso', creadoPor: 'Operaciones', creadorId: 'e-m3', fecha: '2026-11-20', proyecto: 'Tienda en línea', empresaId: 'ejemplo',
      respuesta: { totalH: 2, restanteH: 0.5 },
      mensajes: [{ de: 'cliente', quien: 'Operaciones', texto: 'Desde esta mañana la app no deja iniciar sesión en el celular. En el computador sí funciona.', cuando: '2026-11-20 08:10', adjuntos: ['pantallazo-error.png'] }],
    },
    {
      id: 'T-0013', titulo: 'Cambiar el orden de las columnas del reporte', tipo: 'Solicitud de cambio', propuesta: 'Baja', prioridad: 'Baja', estado: 'Esperando al cliente', creadoPor: 'Administrador', creadorId: 'e-m1', fecha: '2026-11-17', proyecto: 'App de pedidos', empresaId: 'ejemplo',
      respuesta: { totalH: 0, restanteH: null }, cambio: { valor: 450000, decision: 'cobrar' },
      mensajes: [
        { de: 'cliente', quien: 'Administrador', texto: 'Queremos que el reporte muestre primero el cliente y luego el valor.', cuando: '2026-11-17 14:00' },
        { de: 'websourcing', quien: 'Equipo Websourcing · Producto', texto: 'Esto es una solicitud de cambio fuera del alcance aprobado. La mini cotización es de $ 450.000 COP (ejemplo). Si estás de acuerdo, acéptala para que la programemos.', cuando: '2026-11-18 09:30' },
      ],
    },
    {
      id: 'T-0012', titulo: 'El correo de aviso llega sin el logo', tipo: 'Error', propuesta: 'Normal', prioridad: 'Normal', estado: 'Resuelto', creadoPor: 'Administrador', creadorId: 'e-m1', fecha: '2026-11-10', proyecto: 'Tienda en línea', empresaId: 'ejemplo',
      respuesta: { totalH: 16, restanteH: null }, horas: 1.5,
      mensajes: [
        { de: 'cliente', quien: 'Administrador', texto: 'Los correos de confirmación llegan sin el logo.', cuando: '2026-11-10 10:00' },
        { de: 'websourcing', quien: 'Equipo Websourcing · Desarrollo', texto: 'Corregido. El logo ahora va incrustado y se ve en todos los programas de correo. Confírmanos si lo ves bien.', cuando: '2026-11-11 16:20' },
      ],
    },
    {
      id: 'T-0011', titulo: 'Necesito un usuario nuevo para el área de ventas', tipo: 'Acceso', propuesta: 'Normal', prioridad: 'Normal', estado: 'Cerrado', creadoPor: 'Administrador', creadorId: 'e-m1', fecha: '2026-10-28', proyecto: 'Tienda en línea', empresaId: 'ejemplo',
      respuesta: { totalH: 16, restanteH: null }, calificacion: 5,
      mensajes: [
        { de: 'cliente', quien: 'Administrador', texto: 'Necesito un acceso para una persona de ventas.', cuando: '2026-10-28 09:00' },
        { de: 'websourcing', quien: 'Equipo Websourcing · Operaciones', texto: 'Listo, ya quedó creado. Te enviamos las instrucciones de entrega por un canal seguro.', cuando: '2026-10-28 15:10' },
      ],
    },
    {
      id: 'T-0010', titulo: 'Dudas sobre la capacitación', tipo: 'Pregunta', propuesta: 'Normal', prioridad: 'Normal', estado: 'Nuevo', creadoPor: 'Operaciones', creadorId: 'e-m3', fecha: '2026-11-19', proyecto: 'App de pedidos', empresaId: 'ejemplo',
      respuesta: { totalH: 16, restanteH: -3 },
      mensajes: [{ de: 'cliente', quien: 'Operaciones', texto: '¿La capacitación se hace por video o presencial? ¿Cuánto dura?', cuando: '2026-11-19 09:20' }],
    },
    {
      id: 'T-0009', titulo: 'Error al exportar pedidos (ya no cubierto por garantía)', tipo: 'Error', propuesta: 'Alta', prioridad: 'Alta', estado: 'Clasificado', creadoPor: 'Administrador', creadorId: 'e-m1', fecha: '2026-11-19', proyecto: 'Tienda en línea', empresaId: 'ejemplo',
      respuesta: { totalH: 8, restanteH: 5 }, horas: 2,
      mensajes: [{ de: 'cliente', quien: 'Administrador', texto: 'Al exportar a hoja de cálculo se pierden las tildes.', cuando: '2026-11-19 16:40' }, { de: 'nota', quien: 'Nota interna', texto: 'Cubierto por el plan de mantenimiento. Registrar 2 h cuando se cierre.', cuando: '2026-11-19 17:05' }],
    },
  ],
  documentos: [
    { id: 'e-d1', nombre: 'Contrato de desarrollo', categoria: 'Contrato', visibilidad: 'admin', versiones: [{ v: 1, fecha: '2026-08-28', tamano: '610 KB', nota: 'Firmado' }] },
    { id: 'e-d2', nombre: 'Propuesta y cotización', categoria: 'Propuesta', visibilidad: 'todo', versiones: [{ v: 1, fecha: '2026-08-20', tamano: '380 KB', nota: 'Enviada' }, { v: 2, fecha: '2026-08-25', tamano: '395 KB', nota: 'Con ajuste de alcance' }] },
    { id: 'e-d3', nombre: 'Requerimientos aprobados', categoria: 'Requerimientos', visibilidad: 'todo', versiones: [{ v: 1, fecha: '2026-09-20', tamano: '150 KB', nota: 'Primera versión' }, { v: 2, fecha: '2026-09-26', tamano: '158 KB', nota: 'Aprobada' }] },
    { id: 'e-d4', nombre: 'Acta del sprint 1', categoria: 'Acta', visibilidad: 'todo', versiones: [{ v: 1, fecha: '2026-10-30', tamano: '90 KB', nota: 'Acta de demo' }] },
    { id: 'e-d5', nombre: 'Manual de usuario · Tienda en línea', categoria: 'Manual', visibilidad: 'todo', versiones: [{ v: 1, fecha: '2026-08-30', tamano: '2,4 MB', nota: 'Entrega final' }] },
  ],
  archivos: [
    { id: 'e-u1', nombre: 'logo-empresa.png', nota: 'Logo en fondo transparente', subidoPor: 'Administrador', fecha: '2026-11-05', tamano: '340 KB', estado: 'recibido' },
    { id: 'e-u2', nombre: 'textos-inicio.docx', nota: 'Textos para la pantalla de inicio', subidoPor: 'Administrador', fecha: '2026-11-14', tamano: '58 KB', estado: 'nuevo' },
  ],
  miembros: [
    { id: 'e-m1', cargo: 'Administrador', correo: 'administrador@empresa-ejemplo.co', rol: 'admin', estado: 'activo', ultimoAcceso: '2026-11-20 08:05', permisos: { aprobar: true, verDinero: true, verTodosTickets: true, subirArchivos: true } },
    { id: 'e-m2', cargo: 'Contabilidad', correo: 'contabilidad@empresa-ejemplo.co', rol: 'equipo', estado: 'activo', ultimoAcceso: '2026-11-19 16:30', permisos: { aprobar: false, verDinero: true, verTodosTickets: false, subirArchivos: true } },
    { id: 'e-m3', cargo: 'Operaciones', correo: 'operaciones@empresa-ejemplo.co', rol: 'equipo', estado: 'activo', ultimoAcceso: '2026-11-20 07:48', permisos: { aprobar: false, verDinero: false, verTodosTickets: false, subirArchivos: false } },
    { id: 'e-m4', cargo: 'Ventas', correo: 'ventas@empresa-ejemplo.co', rol: 'equipo', estado: 'invitado', permisos: { aprobar: false, verDinero: false, verTodosTickets: false, subirArchivos: false } },
  ],
  mantenimiento: {
    activo: true, plan: 'Estándar', inicio: '2026-10-01', fin: '', renovacion: true, cuota: 1020000, horasMes: 8, horasUsadas: 6.5, acumular: false,
    revisionesSemana: 1, dias: 'Lunes a viernes', horario: '8 a. m. a 6 p. m. (hora Colombia)',
    tiempos: { Urgente: '2 horas hábiles', Alta: '1 día hábil', Normal: '2 días hábiles', Baja: 'Siguiente planeación' },
    incluye: { 'Corrección de errores': true, 'Copias de seguridad': true, Monitoreo: true, 'Actualizaciones de seguridad': true, 'Auditoría trimestral': false, 'Pequeños ajustes': true },
    otros: 'Una reunión de seguimiento al mes.', horaExtra: 120000, proximaRevision: '2026-11-27',
    historial: [
      { cuando: '2026-10-01', parametro: 'Plan', antes: '—', despues: 'Estándar', efectivo: '2026-10-01', motivo: 'Activación al terminar la garantía' },
      { cuando: '2026-10-15', parametro: 'Bolsa de horas al mes', antes: '6 h', despues: '8 h', efectivo: '2026-11-01', motivo: 'Acuerdo con la empresa tras una reunión de seguimiento' },
    ],
    horasRegistradas: [
      { ticket: 'T-0012', horas: 1.5, estado: 'pendiente_dueno', fecha: '2026-11-11' },
      { ticket: 'T-0009', horas: 2, estado: 'pendiente_dueno', fecha: '2026-11-19' },
      { ticket: 'T-0008', horas: 3.5, estado: 'aprobada', fecha: '2026-11-05' },
      { ticket: 'T-0007', horas: 3, estado: 'aprobada', fecha: '2026-11-03' },
    ],
  },
};

// Tercera empresa, solo para el listado de clientes del super administrador (pausada).
const ej2: Empresa = {
  ...structuredCloneSafe(ej), id: 'demo', nombre: 'Servicios Demo Ltda.', razonSocial: 'Servicios Demo Ltda. (ficticia)', estado: 'pausada',
  proyectos: [{ id: 'sitio', nombre: 'Sitio web corporativo', sprintsTotal: 1, sprintsHechos: 0, hitos: [h(1, 'terminado', '2026-10-01', { real: '2026-10-01', pagoId: 'd-p1' }), ...NOMBRES_HITOS.slice(1).map((_, i) => h(i + 2, 'pendiente', '2027-01-15', i + 2 === 13 ? { soloMantenimiento: true } : {}))], historial: [] }],
  revisiones: [], tickets: [], pagos: [{ id: 'd-p1', concepto: 'Anticipo', valor: 6000000, vence: '2026-10-01', estado: 'vencido', origen: 'contrato' }], abonos: [], facturas: [], comprobantes: [], archivos: [],
  contratos: [{ proyectoId: 'sitio', nombre: 'Sitio web corporativo', valor: 15000000, firma: '2026-09-28' }],
  miembros: [{ id: 'd-m1', cargo: 'Administrador', correo: 'administrador@servicios-demo.co', rol: 'admin', estado: 'activo', ultimoAcceso: '2026-10-30 10:00', permisos: { aprobar: true, verDinero: true, verTodosTickets: true, subirArchivos: true } }],
  mantenimiento: { ...structuredCloneSafe(ej.mantenimiento), activo: false, cuota: 0, horasMes: 0, horasUsadas: 0, historial: [], horasRegistradas: [], incluye: { ...noIncluye } },
};
function structuredCloneSafe<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

export const EMPRESAS_INICIALES: Empresa[] = [ws, ej, ej2];

export const ACTIVIDAD_INICIAL: Actividad[] = [
  { cuando: '2026-11-20 10:02', quien: 'Super administrador', accion: 'Publicó la revisión "Diseño y prototipo" (v1)', empresa: 'Websourcing', ip: '190.0.2.10' },
  { cuando: '2026-11-20 08:05', quien: 'Administrador (Comercial Ejemplo)', accion: 'Inició sesión con código adicional', empresa: 'Comercial Ejemplo S.A.S.', ip: '190.0.2.44' },
  { cuando: '2026-11-19 16:41', quien: 'Administrador (Comercial Ejemplo)', accion: 'Subió el comprobante de la cuota de noviembre', empresa: 'Comercial Ejemplo S.A.S.', ip: '190.0.2.44' },
  { cuando: '2026-11-19 12:00', quien: 'Sistema', accion: 'Recordatorio de pago enviado (3 días antes)', empresa: 'Comercial Ejemplo S.A.S.', ip: '—' },
  { cuando: '2026-11-18 17:30', quien: 'Super administrador', accion: 'Publicó la revisión "Sprint 2"', empresa: 'Comercial Ejemplo S.A.S.', ip: '190.0.2.10' },
  { cuando: '2026-11-18 11:40', quien: 'Super administrador', accion: 'Respondió el ticket T-0001 como "Operaciones"', empresa: 'Websourcing', ip: '190.0.2.10' },
  { cuando: '2026-11-15 00:05', quien: 'Sistema', accion: 'Marcó como vencido el pago "Pago por sprints (20 %)"', empresa: 'Comercial Ejemplo S.A.S.', ip: '—' },
  { cuando: '2026-11-12 09:15', quien: 'Super administrador', accion: 'Movió la fecha del hito 6 (motivo: esperando al cliente)', empresa: 'Comercial Ejemplo S.A.S.', ip: '190.0.2.10' },
  { cuando: '2026-11-10 14:20', quien: 'Super administrador', accion: 'Pausó la empresa', empresa: 'Servicios Demo Ltda.', ip: '190.0.2.10' },
  { cuando: '2026-11-05 10:11', quien: 'Super administrador', accion: 'Cambió el plan de mantenimiento (bolsa 6 h → 8 h)', empresa: 'Comercial Ejemplo S.A.S.', ip: '190.0.2.10' },
  { cuando: '2026-11-02 10:05', quien: 'Administrador (Comercial Ejemplo)', accion: 'Aprobó el Sprint 1 (v1)', empresa: 'Comercial Ejemplo S.A.S.', ip: '190.0.2.44' },
  { cuando: '2026-10-28 15:10', quien: 'Super administrador', accion: 'Modo "ver como el cliente" (solo lectura)', empresa: 'Comercial Ejemplo S.A.S.', ip: '190.0.2.10' },
];

export const TIEMPOS_POR_DEFECTO: Record<Prioridad, string> = { Urgente: '2 horas hábiles', Alta: '1 día hábil', Normal: '2 días hábiles', Baja: 'Siguiente planeación' };
