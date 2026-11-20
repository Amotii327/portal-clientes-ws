/**
 * Tipos de los módulos 5 (Tickets) y 10 (Mantenimiento por empresa). ESCRITOS A MANO con el formato de
 * `supabase gen types`; cuando exista el proyecto de Supabase se pueden fusionar en database.types.ts.
 * Todas las tablas son de solo lectura desde la API: se escribe con las funciones RPC (`FuncionesTicketsMant`),
 * salvo `garantias` y `planes_base_mantenimiento` (solo super admin).
 */
import type { Json } from '@/lib/supabase/database.types';

export type TipoTicket = 'error' | 'solicitud_cambio' | 'pregunta' | 'acceso';
export type PrioridadTicket = 'urgente' | 'alta' | 'normal' | 'baja';
export type EstadoTicket = 'nuevo' | 'clasificado' | 'en_progreso' | 'esperando_cliente' | 'resuelto' | 'cerrado';
export type AreaEquipo = 'Producto' | 'Arquitectura' | 'Diseño' | 'Desarrollo' | 'Calidad' | 'Operaciones';
export type DecisionDueno = 'cobrar' | 'regalar' | 'rechazar';
export type MotivoFueraDePlan = 'sin_mantenimiento' | 'mantenimiento_vencido' | 'sin_cobertura_errores';
export type CierreMotivo = 'confirmado_cliente' | 'automatico' | 'cerrado_por_websourcing' | 'rechazado' | 'cobro_rechazado';
export type Moneda = 'COP' | 'USD';
/** Semáforo del tiempo de primera respuesta. */
export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'cumplido' | 'incumplido' | 'cerrado' | 'sin_plazo';
export type PlanBase = 'basico' | 'estandar' | 'premium' | 'personalizado';
export type EstadoHora = 'pendiente_dueno' | 'aprobada' | 'rechazada' | 'extra_pendiente_cliente' | 'extra_aprobada' | 'extra_rechazada';
export type IncluyePlan = 'correccion_errores' | 'copias_seguridad' | 'monitoreo' | 'actualizaciones_seguridad' | 'auditoria_trimestral' | 'pequenos_ajustes';

export interface TicketFila {
  id: string; empresa_id: string; numero: number; proyecto_id: string | null;
  tipo: TipoTicket; tipo_original: TipoTicket | null; titulo: string; detalle: string;
  prioridad_propuesta: PrioridadTicket; prioridad: PrioridadTicket | null; estado: EstadoTicket;
  creado_por: string; miembro_id: string; fuera_de_plan: boolean; motivo_fuera_de_plan: MotivoFueraDePlan | null;
  sla_origen: 'predeterminado' | 'mantenimiento'; plazo_habil_minutos: number | null;
  vence_primera_respuesta: string | null; primera_respuesta_en: string | null; clasificado_en: string | null;
  resuelto_en: string | null; cerrado_en: string | null; resolucion: string | null; cierre_motivo: CierreMotivo | null;
  decision_dueno: DecisionDueno | null; decision_motivo: string | null; decision_en: string | null; decision_por: string | null;
  cobro_valor: number | null; cobro_moneda: Moneda | null; cobro_aceptado_en: string | null; cobro_aceptado_por: string | null;
  cobro_rechazado_en: string | null; calificacion: number | null; calificacion_comentario: string | null;
  calificado_en: string | null; creado_en: string; actualizado_en: string;
}
export interface TicketMensajeFila {
  id: string; empresa_id: string; ticket_id: string; autor_id: string | null; autor_tipo: 'cliente' | 'websourcing';
  area: AreaEquipo | null; texto: string; interno: boolean; retirado_en: string | null; retirado_por: string | null; creado_en: string;
}
export interface TicketAdjuntoFila {
  id: string; empresa_id: string; ticket_id: string; mensaje_id: string | null; subido_por: string; nombre_original: string;
  mime: string; tamano_bytes: number; storage_path: string; creado_en: string;
}
export interface GarantiaFila {
  id: string; empresa_id: string; proyecto_id: string | null; inicia_en: string; vence_en: string; nota: string | null;
  creado_por: string | null; creado_en: string; actualizado_en: string;
}
export interface PlanMantenimientoFila {
  id: string; empresa_id: string; activo: boolean; plan_base: PlanBase; fecha_inicio: string | null; fecha_fin: string | null;
  renovacion_automatica: boolean; moneda: Moneda; cuota_mensual: number | null; horas_mes: number; acumular_horas: boolean;
  revisiones_por_semana: number; dias_atencion: number[]; horario_desde: string; horario_hasta: string; zona_horaria: string;
  tiempos_respuesta: Json | null; copias_frecuencia: 'diaria' | 'semanal' | 'mensual' | 'ninguna';
  parches_frecuencia: 'semanal' | 'quincenal' | 'mensual' | 'trimestral' | 'ninguna';
  auditoria: boolean; auditoria_cada_meses: 1 | 3 | 6 | 12 | null; reuniones_por_mes: number;
  reporte_tipo: 'ninguno' | 'resumido' | 'detallado'; servidores_incluidos: boolean; servidores_costo_mensual: number | null;
  incluye: IncluyePlan[]; incluye_otros: string | null; valor_hora_extra: number | null; proxima_revision: string | null;
  activado_en: string | null; activado_por: string | null; apagado_en: string | null; apagado_por: string | null;
  creado_en: string; actualizado_en: string;
}
export interface PlanBaseFila { plan: 'basico' | 'estandar' | 'premium'; parametros: Json; nota: string | null; actualizado_en: string; actualizado_por: string | null }
export interface PlanHistorialFila {
  id: string; empresa_id: string; plan_id: string; tipo: 'activacion' | 'apagado' | 'parametros'; parametros_anteriores: Json;
  parametros_nuevos: Json; motivo: string; efectivo_desde: string; aplicado_en: string | null; error_aplicacion: string | null;
  creado_por: string | null; creado_en: string;
}
export interface BolsaFila {
  id: string; empresa_id: string; plan_id: string; mes: string; horas_incluidas: number; horas_arrastradas: number;
  horas_usadas: number; horas_extra: number; extra_autorizado: boolean; extra_autorizado_por: string | null;
  extra_autorizado_en: string | null; aviso_80_en: string | null; aviso_100_en: string | null; cerrada_en: string | null;
  horas_perdidas: number | null; horas_acumuladas: number | null; creado_en: string; actualizado_en: string;
}
export interface BolsaAvisoFila {
  id: string; empresa_id: string; bolsa_id: string; tipo: '80_por_ciento' | '100_por_ciento'; porcentaje: number;
  horas_usadas: number; horas_disponibles: number; creado_en: string;
}
export interface HoraRegistradaFila {
  id: string; empresa_id: string; ticket_id: string; bolsa_id: string; origen_id: string | null; mes: string; fecha_trabajo: string;
  horas: number; estado: EstadoHora; registrado_por: string; registrado_en: string; revisado_por: string | null;
  revisado_en: string | null; motivo_revision: string | null; decidido_cliente_por: string | null; decidido_cliente_en: string | null;
  actualizado_en: string;
}
/** Solo super admin. */
export interface HoraNotaInternaFila { hora_id: string; empresa_id: string; nota: string; creado_en: string }

export interface TicketSemaforoFila {
  ticket_id: string; empresa_id: string; numero: number; estado: EstadoTicket; prioridad: PrioridadTicket | null;
  prioridad_propuesta: PrioridadTicket; vence_primera_respuesta: string | null; primera_respuesta_en: string | null;
  sla_origen: 'predeterminado' | 'mantenimiento'; semaforo: Semaforo; minutos_habiles_restantes: number | null;
}
export interface BolsaResumenFila {
  bolsa_id: string; empresa_id: string; plan_id: string; mes: string; horas_incluidas: number; horas_arrastradas: number;
  horas_usadas: number; horas_extra: number; horas_disponibles: number; porcentaje_usado: number; extra_autorizado: boolean;
  aviso_80_en: string | null; aviso_100_en: string | null; cerrada_en: string | null; horas_perdidas: number | null; horas_acumuladas: number | null;
}

/** Parámetros editables del plan (los que mandan; los planes base son solo un punto de partida). */
export type ParametrosMantenimiento = Partial<{
  fecha_inicio: string; fecha_fin: string | null; renovacion_automatica: boolean; moneda: Moneda; cuota_mensual: number;
  horas_mes: number; acumular_horas: boolean; revisiones_por_semana: number; dias_atencion: number[];
  horario_desde: string; horario_hasta: string; zona_horaria: string; tiempos_respuesta: Json | null;
  copias_frecuencia: PlanMantenimientoFila['copias_frecuencia']; parches_frecuencia: PlanMantenimientoFila['parches_frecuencia'];
  auditoria: boolean; auditoria_cada_meses: 1 | 3 | 6 | 12 | null; reuniones_por_mes: number;
  reporte_tipo: PlanMantenimientoFila['reporte_tipo']; servidores_incluidos: boolean; servidores_costo_mensual: number | null;
  incluye: IncluyePlan[]; incluye_otros: string | null; valor_hora_extra: number | null;
}>;

export interface RespuestaCrearTicket { ticket_id: string; numero: number; fuera_de_plan: boolean; vence_primera_respuesta: string | null }
export interface RespuestaAdjunto { adjunto_id: string; bucket: 'portal-tickets'; ruta: string }

type Fn<A, R = Json> = { Args: A; Returns: R };
export interface FuncionesTicketsMant {
  crear_ticket: Fn<{ p_tipo: TipoTicket; p_titulo: string; p_detalle: string; p_prioridad?: PrioridadTicket; p_proyecto_id?: string | null }, RespuestaCrearTicket>;
  responder_ticket: Fn<{ p_ticket_id: string; p_texto: string; p_interno?: boolean; p_area?: AreaEquipo | null }>;
  retirar_texto_mensaje: Fn<{ p_mensaje_id: string }, void>;
  preparar_adjunto_ticket: Fn<{ p_ticket_id: string; p_nombre: string; p_mime: string; p_tamano_bytes: number; p_mensaje_id?: string | null }, RespuestaAdjunto>;
  clasificar_ticket: Fn<{ p_ticket_id: string; p_prioridad: PrioridadTicket; p_tipo?: TipoTicket | null }>;
  cambiar_estado_ticket: Fn<{ p_ticket_id: string; p_estado: EstadoTicket; p_resolucion?: string | null }>;
  marcar_solicitud_cambio: Fn<{ p_ticket_id: string; p_motivo?: string | null }>;
  decidir_ticket: Fn<{ p_ticket_id: string; p_decision: DecisionDueno; p_motivo?: string | null; p_valor?: number | null; p_moneda?: Moneda }>;
  aceptar_cobro_ticket: Fn<{ p_ticket_id: string }>;
  rechazar_cobro_ticket: Fn<{ p_ticket_id: string }>;
  confirmar_resolucion: Fn<{ p_ticket_id: string }>;
  calificar_ticket: Fn<{ p_ticket_id: string; p_estrellas: number; p_comentario?: string | null }>;
  activar_mantenimiento: Fn<{ p_empresa_id: string; p_plan_base: PlanBase; p_parametros?: ParametrosMantenimiento; p_motivo?: string | null }>;
  apagar_mantenimiento: Fn<{ p_empresa_id: string; p_motivo: string }>;
  configurar_mantenimiento: Fn<{ p_empresa_id: string; p_parametros: ParametrosMantenimiento; p_motivo: string; p_aplicar_desde?: 'hoy' | 'proximo_mes' }>;
  anotar_horas_ticket: Fn<{ p_ticket_id: string; p_horas: number; p_nota?: string | null; p_fecha?: string | null }>;
  revisar_horas: Fn<{ p_hora_id: string; p_aprobar: boolean; p_motivo?: string | null }>;
  decidir_horas_extra: Fn<{ p_hora_id: string; p_aprobar: boolean }>;
  autorizar_horas_extra: Fn<{ p_bolsa_id: string }>;
  mi_mantenimiento_activo: Fn<Record<string, never>, boolean>;
}
