/**
 * Tipos de la base de datos, sprints 1 y 2. ESCRITOS A MANO con el formato de `supabase gen types`.
 * Cuando exista el proyecto de Supabase, se regeneran con:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 * Ojo: la API solo deja INSERT/UPDATE en las columnas que concede la matriz (docs/matriz-permisos.md);
 * aquí `Insert` y `Update` ya reflejan eso. Todo lo demás se hace con las funciones RPC (`Functions`).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Rol = 'admin_cliente' | 'equipo';
export type Tema = 'clara' | 'oscura';
export type EstadoEmpresa = 'activa' | 'pausada';
export type EstadoProyecto = 'activo' | 'pausado' | 'terminado' | 'cancelado';
export type EstadoPlan = 'propuesta' | 'aprobado';
export type EstadoHito = 'pendiente' | 'en_curso' | 'esperando_aprobacion' | 'terminado';
export type EstadoSprint = 'propuesto' | 'aprobado' | 'en_curso' | 'en_revision' | 'terminado';
export type LadoRetraso = 'websourcing' | 'cliente';
export type TipoCambioPlan = 'sprint_agregado' | 'sprint_quitado' | 'sprint_editado' | 'sprints_reordenados' | 'fechas_corridas';

type SinEscritura = Record<string, never>;

export interface Database {
  public: {
    Tables: {
      empresas: {
        Row: {
          id: string; nombre: string; nit_registro: string; logo_path: string | null; estado: EstadoEmpresa;
          motivo_pausa: string | null; pausada_en: string | null; pausada_por: string | null;
          creada_en: string; actualizado_en: string;
        };
        Insert: SinEscritura;
        Update: { nombre?: string; logo_path?: string | null };
        Relationships: [];
      };
      datos_facturacion: {
        Row: { empresa_id: string; razon_social: string; nit: string; correo_facturas: string; actualizado_en: string; actualizado_por: string | null };
        Insert: SinEscritura;
        Update: { razon_social?: string; nit?: string; correo_facturas?: string };
        Relationships: [];
      };
      perfiles: {
        Row: {
          user_id: string; nombre: string; correo: string; celular: string | null;
          bloqueado: boolean; bloqueado_en: string | null; creado_en: string; actualizado_en: string;
        };
        Insert: SinEscritura;
        Update: { nombre?: string; celular?: string | null };
        Relationships: [];
      };
      miembros: {
        Row: {
          id: string; empresa_id: string; user_id: string; rol: Rol;
          aprobar: boolean; ver_dinero: boolean; ver_todos_tickets: boolean; subir_archivos: boolean;
          bloqueado: boolean; bloqueado_en: string | null; quitado_en: string | null; creado_en: string; actualizado_en: string;
        };
        Insert: SinEscritura;
        Update: { aprobar?: boolean; ver_dinero?: boolean; ver_todos_tickets?: boolean; subir_archivos?: boolean };
        Relationships: [];
      };
      /** `select *` NO funciona aquí: token_hash no se puede leer. Pide las columnas de Row por nombre. */
      invitaciones: {
        Row: {
          id: string; empresa_id: string; correo: string; rol: Rol;
          aprobar: boolean; ver_dinero: boolean; ver_todos_tickets: boolean; subir_archivos: boolean;
          creada_en: string; vence_en: string; usada_en: string | null; usada_por: string | null;
          miembro_id: string | null; revocada_en: string | null; invitada_por: string | null;
        };
        Insert: SinEscritura;
        Update: SinEscritura;
        Relationships: [];
      };
      aceptaciones_politica: {
        Row: { id: string; user_id: string; version: string; aceptada_en: string; ip: string | null };
        Insert: SinEscritura;
        Update: SinEscritura;
        Relationships: [];
      };
      registro_actividad: {
        Row: {
          id: number; empresa_id: string | null; actor_id: string | null; actor_tipo: 'usuario' | 'sistema';
          accion: string; entidad: string; entidad_id: string | null; detalle: Json; ip: string | null; creado_en: string;
        };
        Insert: SinEscritura;
        Update: SinEscritura;
        Relationships: [];
      };
      configuracion: {
        Row: { clave: string; valor: Json; actualizado_en: string; actualizado_por: string | null };
        Insert: { clave: string; valor: Json };
        Update: { valor?: Json };
        Relationships: [];
      };
      preferencias_usuario: {
        Row: { user_id: string; tema: Tema; actualizado_en: string };
        Insert: { user_id: string; tema?: Tema };
        Update: { tema?: Tema };
        Relationships: [];
      };
      // ---- Sprint 2: solo lectura desde la API; toda escritura pasa por las funciones (Functions) ----
      proyectos: {
        Row: {
          id: string; empresa_id: string; nombre: string; descripcion: string | null; estado: EstadoProyecto;
          fecha_inicio: string | null; fecha_fin_planeada: string | null; fecha_fin_real: string | null;
          plan_estado: EstadoPlan; plan_aprobado_en: string | null;
          avance_pct: number; avance_partes_hechas: number; avance_partes_total: number;
          creado_en: string; actualizado_en: string;
        };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      hitos: {
        Row: {
          id: string; empresa_id: string; proyecto_id: string; numero: number; nombre: string; estado: EstadoHito;
          fecha_planeada: string | null; fecha_real: string | null; visible: boolean; creado_en: string; actualizado_en: string;
        };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      /** Solo lo ve el super admin, el admin del cliente y quien tenga ver_dinero. */
      hitos_pago_asociado: {
        Row: { hito_id: string; empresa_id: string; concepto: string; actualizado_en: string };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      /** El cliente solo recibe filas cuando el plan del proyecto esta aprobado. */
      sprints: {
        Row: {
          id: string; empresa_id: string; proyecto_id: string; numero: number; nombre: string; estado: EstadoSprint;
          fecha_inicio: string; fecha_fin: string; fecha_demo: string | null; incluye: string[]; terminado_en: string | null;
          creado_en: string; actualizado_en: string;
        };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      retrasos: {
        Row: {
          id: string; empresa_id: string; proyecto_id: string; hito_id: string; fecha_anterior: string; fecha_nueva: string;
          motivo: string; lado: LadoRetraso; que_falta: string | null; creado_en: string;
        };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      cambios_plan: {
        Row: { id: string; empresa_id: string; proyecto_id: string; tipo: TipoCambioPlan; motivo: string; detalle: Json; creado_en: string };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      /** Historial apto para el cliente (sin IP ni autor). El super admin ve tambien las filas con visible_cliente = false. */
      historial_proyecto: {
        Row: {
          id: number; empresa_id: string; proyecto_id: string; tipo: TipoHistorial;
          actor_tipo: 'equipo_websourcing' | 'cliente' | 'sistema'; detalle: Json; visible_cliente: boolean; creado_en: string;
        };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      /** Solo el super admin (con 2FA) las lee. */
      sesiones_ver_como: {
        Row: {
          id: string; user_id: string; empresa_id: string; rol: Rol; aprobar: boolean; ver_dinero: boolean;
          ver_todos_tickets: boolean; subir_archivos: boolean; iniciada_en: string; vence_en: string;
          terminada_en: string | null; motivo_cierre: 'manual' | 'vencida' | 'reemplazada' | null;
        };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      /** INTERNA: solo el super admin (2FA) la lee. El cliente y su equipo nunca reciben filas. */
      consumo_equipo_proyecto: {
        Row: { proyecto_id: string; empresa_id: string; estimado_inicial_pct: number | null; tope_pct: number | null; aviso_80_en: string | null; actualizado_en: string };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      /** INTERNA, igual que la anterior. */
      consumo_equipo_sprint: {
        Row: { sprint_id: string; empresa_id: string; proyecto_id: string; estimado_pct: number | null; real_pct: number | null; actualizado_en: string };
        Insert: SinEscritura; Update: SinEscritura; Relationships: [];
      };
      // super_admins: sin acceso desde la API, a propósito.
    };
    Views: {
      v_proyectos_resumen: { Row: ResumenProyecto; Relationships: [] };
    };
    Functions: {
      crear_empresa: {
        Args: { p_nombre: string; p_razon_social: string; p_nit: string; p_correo_facturas: string; p_correo_admin: string; p_logo_path?: string | null };
        Returns: ResultadoInvitacion & { empresa_id: string };
      };
      invitar_miembro: {
        Args: {
          p_empresa_id: string; p_correo: string; p_rol?: Rol; p_aprobar?: boolean; p_ver_dinero?: boolean;
          p_ver_todos_tickets?: boolean; p_subir_archivos?: boolean;
        };
        Returns: ResultadoInvitacion;
      };
      aceptar_invitacion: {
        Args: { p_token: string; p_version_politica: string; p_nombre?: string | null; p_celular?: string | null };
        Returns: { empresa_id: string; miembro_id: string; rol: Rol };
      };
      revocar_invitacion: { Args: { p_invitacion_id: string }; Returns: undefined };
      quitar_miembro: { Args: { p_miembro_id: string }; Returns: undefined };
      bloquear_miembro: { Args: { p_miembro_id: string; p_bloqueado?: boolean }; Returns: undefined };
      pausar_empresa: { Args: { p_empresa_id: string; p_motivo?: string | null }; Returns: undefined };
      reactivar_empresa: { Args: { p_empresa_id: string }; Returns: undefined };
      bloquear_usuario: { Args: { p_user_id: string; p_bloqueado?: boolean }; Returns: undefined };
      politica_vigente: { Args: Record<PropertyKey, never>; Returns: string };
      mi_contexto: { Args: Record<PropertyKey, never>; Returns: MiContexto };
      // ---- Sprint 2 ----
      crear_proyecto: {
        Args: { p_empresa_id: string; p_nombre: string; p_descripcion?: string | null; p_fecha_inicio?: string | null; p_fecha_fin_planeada?: string | null };
        Returns: { proyecto_id: string };
      };
      editar_proyecto: {
        Args: {
          p_proyecto_id: string; p_nombre?: string | null; p_descripcion?: string | null; p_estado?: EstadoProyecto | null;
          p_fecha_inicio?: string | null; p_fecha_fin_planeada?: string | null; p_fecha_fin_real?: string | null;
        };
        Returns: undefined;
      };
      editar_hito: {
        Args: {
          p_hito_id: string; p_nombre?: string | null; p_estado?: EstadoHito | null; p_fecha_planeada?: string | null;
          p_motivo?: string | null; p_lado?: LadoRetraso | null; p_que_falta?: string | null;
          p_visible?: boolean | null; p_fecha_real?: string | null;
        };
        Returns: { hito_id: string; retraso_registrado: boolean };
      };
      fijar_pago_hito: { Args: { p_hito_id: string; p_concepto: string | null }; Returns: undefined };
      cargar_plan_sprints: { Args: { p_proyecto_id: string; p_sprints: SprintPropuesto[] }; Returns: { sprints: number; avisos: AvisoPlan[] } };
      agregar_sprint: {
        Args: {
          p_proyecto_id: string; p_nombre: string; p_fecha_inicio: string; p_fecha_fin: string;
          p_fecha_demo?: string | null; p_incluye?: string[]; p_motivo?: string | null;
        };
        Returns: { sprint_id: string; numero: number; avisos: AvisoPlan[] };
      };
      editar_sprint: {
        Args: {
          p_sprint_id: string; p_nombre?: string | null; p_fecha_inicio?: string | null; p_fecha_fin?: string | null;
          p_fecha_demo?: string | null; p_incluye?: string[] | null; p_estado?: EstadoSprint | null;
          p_motivo?: string | null; p_correr_siguientes?: boolean;
        };
        Returns: { sprint_id: string; avisos: AvisoPlan[] };
      };
      quitar_sprint: { Args: { p_sprint_id: string; p_motivo?: string | null }; Returns: { avisos: AvisoPlan[] } };
      reordenar_sprints: { Args: { p_proyecto_id: string; p_orden: string[]; p_motivo?: string | null }; Returns: { avisos: AvisoPlan[] } };
      aprobar_plan_sprints: { Args: { p_proyecto_id: string }; Returns: { avisos: AvisoPlan[] } };
      iniciar_ver_como: {
        Args: {
          p_empresa_id: string; p_rol?: Rol; p_aprobar?: boolean; p_ver_dinero?: boolean;
          p_ver_todos_tickets?: boolean; p_subir_archivos?: boolean;
        };
        Returns: { sesion_id: string; empresa_id: string; empresa_nombre: string; rol: Rol; vence_en: string };
      };
      terminar_ver_como: { Args: Record<PropertyKey, never>; Returns: undefined };
      panel_super_admin: { Args: Record<PropertyKey, never>; Returns: PanelSuperAdmin };
      inicio_cliente: { Args: Record<PropertyKey, never>; Returns: InicioCliente };
      linea_de_tiempo: { Args: { p_proyecto_id: string }; Returns: LineaDeTiempo };
      fijar_consumo_proyecto: { Args: { p_proyecto_id: string; p_estimado_inicial_pct?: number | null; p_tope_pct?: number | null }; Returns: ConsumoEquipo };
      anotar_consumo_sprint: { Args: { p_sprint_id: string; p_estimado_pct?: number | null; p_real_pct?: number | null }; Returns: ConsumoEquipo };
      consumo_equipo: { Args: { p_proyecto_id: string }; Returns: ConsumoEquipo };
      anotar_rechazo: { Args: { p_accion: string; p_codigo: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** El token viaja SOLO del servidor al correo del invitado. Nunca se manda al navegador ni se registra en logs. */
export interface ResultadoInvitacion {
  invitacion_id: string;
  correo: string;
  token: string;
  vence_en: string;
}

export type EstadoContexto =
  | 'sin_sesion'
  | 'sin_perfil'
  | 'usuario_bloqueado'
  | 'super_admin'
  | 'super_admin_requiere_2fa'
  | 'sin_membresia'
  | 'miembro_quitado'
  | 'miembro_bloqueado'
  | 'empresa_pausada'
  | 'requiere_2fa'
  | 'ver_como'
  | 'activo';

export interface MiContexto {
  estado: EstadoContexto;
  user_id?: string;
  aal?: 'aal1' | 'aal2';
  nombre?: string;
  tema?: Tema;
  es_super_admin?: boolean;
  empresa?: { id: string; nombre: string; estado: EstadoEmpresa } | null;
  rol?: Rol | null;
  permisos?: { aprobar: boolean; ver_dinero: boolean; ver_todos_tickets: boolean; subir_archivos: boolean } | null;
  /** Solo con estado 'ver_como': a quien se esta mirando y cuando vence la sesion (mostrar el aviso y el boton "Salir"). */
  ver_como?: { sesion_id: string; empresa_id: string; empresa_nombre: string; rol: Rol; vence_en: string } | null;
}

// ---------------- Sprint 2 ----------------
export type TipoHistorial =
  | 'proyecto_creado' | 'proyecto_estado_cambiado' | 'hito_estado_cambiado' | 'hito_fecha_fijada'
  | 'retraso_registrado' | 'plan_sprints_aprobado' | 'plan_sprints_modificado' | 'sprint_estado_cambiado';

export interface SprintPropuesto { nombre: string; fecha_inicio: string; fecha_fin: string; fecha_demo?: string | null; incluye?: string[] }
/** Dos sprints cuyas fechas se cruzan. Solo avisa; no impide guardar. */
export interface AvisoPlan { tipo: 'cruce_de_fechas'; sprints: [number, number] }

/** Fila de la vista v_proyectos_resumen (respeta RLS: el cliente solo recibe lo suyo y lo visible). */
export type ResumenProyecto = {
  proyecto_id: string; empresa_id: string; empresa_nombre: string; empresa_estado: EstadoEmpresa;
  nombre: string; estado: EstadoProyecto; plan_estado: EstadoPlan;
  avance_pct: number; avance_partes_hechas: number; avance_partes_total: number;
  fecha_inicio: string | null; fecha_fin_planeada: string | null;
  sprint_actual_numero: number | null; sprint_actual_nombre: string | null; sprint_actual_estado: EstadoSprint | null;
  proxima_demo: string | null; hitos_atrasados: number;
  hito_actual_numero: number | null; hito_actual_nombre: string | null;
}

export interface PanelSuperAdmin {
  generado_en: string;
  totales: {
    empresas_activas: number; empresas_pausadas: number; proyectos_activos: number; hitos_atrasados: number;
    planes_por_aprobar: number; demos_proximas_7_dias: number;
    /** Cuotas vencidas, comprobantes por revisar y tickets abiertos (no cerrados): todos numeros desde la integracion. */
    pagos_vencidos: number; comprobantes_en_revision: number; tickets_abiertos: number;
  };
  proyectos: ResumenProyecto[];
  atencion: ItemAtencion[];
}
export type ItemAtencion =
  | ItemAtencionPagoVencido | ItemAtencionComprobante
  | { tipo: 'hito_atrasado'; prioridad: '1'; empresa_id: string; empresa_nombre: string; proyecto_id: string; proyecto_nombre: string;
      hito_numero: number; hito_nombre: string; fecha_planeada: string; dias_de_atraso: number; esperando_al_cliente: boolean }
  | { tipo: 'plan_por_aprobar'; prioridad: '2'; empresa_id: string; empresa_nombre: string; proyecto_id: string; proyecto_nombre: string }
  | { tipo: 'demo_proxima'; prioridad: '3'; empresa_id: string; empresa_nombre: string; proyecto_id: string; proyecto_nombre: string; fecha: string };

export interface InicioCliente {
  empresa: { id: string; nombre: string };
  proyectos: ResumenProyecto[];
  pendientes_del_cliente: { proyecto_id: string; hito_numero: number; hito_nombre: string; fecha_nueva: string; motivo: string; que_falta: string }[];
  /** Cuotas vencidas, cuota más próxima y comprobantes en revisión: null si quien llama no tiene "ver dinero". */
  pagos_vencidos: number | null;
  proximo_pago: InicioClienteDinero['proximo_pago'];
  comprobantes_en_revision: number | null;
  /** Tickets no cerrados que esa persona puede ver. */
  tickets_abiertos: number;
}

export interface HitoLineaDeTiempo {
  id: string; numero: number; nombre: string; estado: EstadoHito; fecha_planeada: string | null; fecha_real: string | null;
  visible: boolean; atrasado: boolean;
  /** null si quien pregunta no puede ver dinero (o si el hito no tiene pago). */
  pago_asociado: string | null;
  retrasos: { fecha_anterior: string; fecha_nueva: string; motivo: string; lado: LadoRetraso; que_falta: string | null; creado_en: string }[];
}
export interface LineaDeTiempo {
  proyecto: ResumenProyecto;
  hitos: HitoLineaDeTiempo[];
  /** null para el cliente mientras el plan es propuesta. */
  plan: null | {
    estado: EstadoPlan;
    sprints: { id: string; numero: number; nombre: string; estado: EstadoSprint; fecha_inicio: string; fecha_fin: string; fecha_demo: string | null; incluye: string[]; terminado_en: string | null }[];
    cambios: { tipo: TipoCambioPlan; motivo: string; detalle: Json; creado_en: string }[];
    /** Solo para el super admin; el cliente recibe []. */
    avisos: AvisoPlan[];
  };
}

/** "Consumo del equipo" de un proyecto (solo super admin). Todos los valores son % de una semana. */
export interface ConsumoEquipo {
  estimado_inicial_pct: number | null; tope_pct: number | null;
  estimado_sprints_pct: number; real_total_pct: number;
  /** real_total / tope, en %; null si no hay tope. */
  porcentaje_del_tope: number | null;
  /** Cuándo se llegó al 80 % del tope (null si no). */
  aviso_80_en: string | null;
  sprints: { sprint_id: string; numero: number; nombre: string; estimado_pct: number | null; real_pct: number | null }[];
}

// =====================================================================================
// Revisiones y documentos (sprint 3). Escritos a mano, fundidos aqui en la integracion (antes: lib/supabase/tipos-revisiones-docs.ts).
// =====================================================================================
export type TipoRevision = 'diseno' | 'sprint' | 'documento';
export type EstadoRevision = 'borrador' | 'publicada' | 'aprobada' | 'cambios_pedidos' | 'reabierta';
export type DecisionRevision = 'apruebo' | 'pido_cambios';
export type CategoriaDocumento =
  | 'contrato' | 'propuesta' | 'requerimientos' | 'arquitectura' | 'acta' | 'manual' | 'entregable' | 'otro';
export type VisibilidadDocumento = 'todo_el_equipo' | 'solo_admin' | 'personas';
export type EstadoArchivoCliente = 'nuevo' | 'recibido';
export type DestinoSubida = 'documento' | 'archivo_cliente' | 'captura';
export type BucketPortal = 'documentos' | 'archivos-empresa' | 'capturas-revisiones';

export interface Revision {
  id: string;
  empresa_id: string;
  proyecto_id: string;
  tipo: TipoRevision;
  sprint_id: string | null;
  documento_id: string | null;
  titulo: string;
  estado: EstadoRevision;
  /** Versión vigente (la última publicada; en `borrador`, la 1). */
  version_actual: number;
  creado_en: string;
  actualizado_en: string;
}

export interface RevisionVersion {
  id: string;
  empresa_id: string;
  revision_id: string;
  version: number;
  link_prueba: string | null;
  video_url: string | null;
  /** Documento (categoría "acta") con el acta del sprint o del diseño. */
  acta_documento_id: string | null;
  resumen: string | null;
  creada_en: string;
  /** El cliente solo recibe las publicadas; el super admin ve también el borrador (`null`). */
  publicada_en: string | null;
}

/** La respuesta del cliente. NO trae IP, usuario ni navegador (eso solo lo lee el super admin en el registro). */
export interface Aprobacion {
  id: string;
  empresa_id: string;
  revision_id: string;
  version: number;
  decision: DecisionRevision;
  comentario: string | null;
  /** Ruta en el bucket `capturas-revisiones`. */
  captura_path: string | null;
  miembro_id: string;
  /** Nombre de quien respondió (el que tenía ese día). */
  persona: string;
  creado_en: string;
}

export interface Documento {
  id: string;
  empresa_id: string;
  proyecto_id: string | null;
  categoria: CategoriaDocumento;
  titulo: string;
  descripcion: string | null;
  visibilidad: VisibilidadDocumento;
  version_actual: number;
  creado_en: string;
  actualizado_en: string;
}

export interface DocumentoVersion {
  id: string;
  empresa_id: string;
  documento_id: string;
  version: number;
  bucket_id: 'documentos';
  storage_path: string;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
  nota: string | null;
  creado_en: string;
}

export interface DocumentoPermiso {
  id: string;
  empresa_id: string;
  documento_id: string;
  miembro_id: string;
  otorgado_en: string;
  revocado_en: string | null;
}

export interface ArchivoCliente {
  id: string;
  empresa_id: string;
  proyecto_id: string | null;
  bucket_id: 'archivos-empresa';
  storage_path: string;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
  nota: string | null;
  estado: EstadoArchivoCliente;
  subido_por: string;
  subido_por_nombre: string;
  creado_en: string;
  recibido_en: string | null;
  /** Solo lo ve el super admin: al cliente le llegan únicamente los no borrados. */
  borrado_en: string | null;
}

// ---- Lo que devuelven las funciones ----
export interface ReservaSubida {
  reserva_id: string;
  bucket: BucketPortal;
  /** Ruta generada por el servidor: `<empresa_id>/<carpeta>/<uuid>.<ext>`. Se sube EXACTAMENTE a esta ruta. */
  ruta: string;
  vence_en: string;
  tamano_maximo: number;
}
export interface RevisionCreada { revision_id: string; version: number }
export interface RespuestaRevision { aprobacion_id: string; estado: 'aprobada' | 'cambios_pedidos' }
export interface DocumentoCreado { documento_id: string; version: number }
export interface ArchivoCreado { archivo_id: string }
export interface ArchivoBorrado { bucket: 'archivos-empresa'; ruta: string }

export interface ItemBandeja {
  revision_id: string;
  empresa_id: string;
  empresa_nombre: string;
  proyecto_id: string;
  proyecto_nombre: string;
  tipo: TipoRevision;
  titulo: string;
  estado: EstadoRevision;
  version: number;
  actualizado_en: string;
}
export interface BandejaRevisiones {
  aprobado: ItemBandeja[];
  cambios_pedidos: ItemBandeja[];
  /** Borradores por publicar y revisiones reabiertas por rehacer. */
  esperando_a_websourcing: ItemBandeja[];
  esperando_al_cliente: ItemBandeja[];
}

/** Tipos de archivo permitidos (idénticos a los de la base y a los de los buckets). */
export const TIPOS_PERMITIDOS: readonly string[] = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv', 'text/plain', 'application/zip', 'application/x-zip-compressed',
];
export const TIPOS_DE_CAPTURA: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
export const TAMANO_MAXIMO_ARCHIVO = 52_428_800; // 50 MB
export const TAMANO_MAXIMO_CAPTURA = 10_485_760; // 10 MB


// =====================================================================================
// Dinero (sprint 4). Escritos a mano, fundidos aqui en la integracion (antes: lib/supabase/tipos-dinero.ts).
// =====================================================================================
export type Moneda = 'COP' | 'USD';
export type MedioPago = 'transferencia' | 'consignacion' | 'tarjeta' | 'efectivo' | 'otro';
/** Estado calculado de una cuota. `en_revision` gana sobre las fechas; `vencido` = fecha pasada y sin pagar. */
export type EstadoPago = 'pendiente' | 'por_vencer' | 'vencido' | 'en_revision' | 'pagado';
export type EstadoComprobante = 'en_revision' | 'confirmado' | 'rechazado';
export type TipoArchivoComprobante = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';

/** Fila de `v_contratos_saldo` (y `contrato` de dinero_del_proyecto). Fechas AAAA-MM-DD. */
export interface ContratoConSaldo {
  contrato_id: string; empresa_id: string; proyecto_id: string;
  valor: number; moneda: Moneda; anticipo: number; fecha_firma: string | null;
  abonado: number; saldo: number;
  /** Suma de las cuotas del plan y lo que aún no está repartido en cuotas. */
  programado: number; sin_programar: number;
  pagos_vencidos: number; monto_vencido: number; proximo_vence: string | null;
}

/** Fila de `v_pagos_programados`. Cada cuota con su hito asociado (si lo tiene y el cliente puede verlo). */
export interface PagoProgramado {
  pago_id: string; empresa_id: string; contrato_id: string; proyecto_id: string;
  concepto: string; valor: number; moneda: Moneda; vence_el: string;
  hito_id: string | null; hito_numero: number | null; hito_nombre: string | null;
  abonado: number; pendiente: number; estado: EstadoPago;
  /** Negativo = ya venció hace tantos días. */
  dias_para_vencer: number;
}

export interface AbonoDinero {
  id: string; pago_programado_id: string | null; valor: number; moneda: Moneda; fecha_pago: string; medio: MedioPago;
  referencia: string | null; tiene_archivo: boolean;
  /** Un abono anulado no cuenta para el saldo; se muestra tachado con su motivo (que el cliente también lee). */
  anulado_en: string | null; anulado_motivo: string | null;
}

export interface FacturaDinero {
  id: string; numero: string; valor: number; moneda: Moneda; fecha_emision: string; pago_programado_id: string | null;
  /** Ruta en el bucket privado "dinero". Se descarga con enlace firmado de 10 minutos, generado con la sesión del usuario. */
  archivo_path: string; archivo_nombre: string; anulada_en: string | null; anulada_motivo: string | null;
}

export interface ComprobanteDinero {
  id: string; pago_programado_id: string; valor_declarado: number; fecha_pago_declarada: string;
  estado: EstadoComprobante;
  /** Solo si fue rechazado: el cliente lo lee. */
  motivo_rechazo: string | null;
  archivo_nombre: string; archivo_path: string; nota: string | null; creado_en: string; revisado_en: string | null;
}

/** Respuesta de dinero_del_proyecto. `contrato` es null mientras el proyecto no tenga contrato. */
export interface DineroDelProyecto {
  contrato: ContratoConSaldo | null;
  pagos: PagoProgramado[]; abonos: AbonoDinero[]; facturas: FacturaDinero[]; comprobantes: ComprobanteDinero[];
}

/** Elemento de la bandeja del super admin (comprobantes_por_revisar). */
export interface ComprobantePorRevisar {
  id: string; empresa_id: string; empresa_nombre: string; pago_programado_id: string; concepto: string;
  valor_declarado: number; moneda: Moneda; fecha_pago_declarada: string; archivo_path: string; archivo_nombre: string;
  nota: string | null; creado_en: string;
}

/** Fila de v_ingresos_por_mes / v_ingresos_por_cliente / v_ingresos_por_mes_y_cliente (solo super admin; sin mezclar monedas). */
export interface IngresoPorMes { mes: string; moneda: Moneda; abonos: number; total: number }
export interface IngresoPorCliente { empresa_id: string; empresa_nombre: string; moneda: Moneda; abonos: number; total: number; ultimo_pago: string }
export interface IngresoPorMesYCliente { mes: string; empresa_id: string; empresa_nombre: string; moneda: Moneda; abonos: number; total: number }

/** Lo nuevo que traen panel_super_admin() e inicio_cliente() desde el sprint 4. */
export interface PanelDinero { pagos_vencidos: number; comprobantes_en_revision: number }
export interface ItemAtencionPagoVencido {
  tipo: 'pago_vencido'; prioridad: '1'; empresa_id: string; empresa_nombre: string; proyecto_id: string; proyecto_nombre: string;
  pago_id: string; concepto: string; pendiente: number; moneda: Moneda; vence_el: string; dias_de_atraso: number;
}
export interface ItemAtencionComprobante {
  tipo: 'comprobante_en_revision'; prioridad: '2'; empresa_id: string; empresa_nombre: string; proyecto_id: string;
  comprobante_id: string; concepto: string; valor: number; moneda: Moneda; subido_en: string;
}
/** En inicio_cliente(): ambos vienen en null si quien llama no tiene "ver dinero". */
export interface InicioClienteDinero {
  pagos_vencidos: number | null;
  proximo_pago: { pago_id: string; proyecto_id: string; concepto: string; pendiente: number; moneda: Moneda; vence_el: string; estado: EstadoPago } | null;
}

/**
 * Cola UNICA de avisos por correo (tabla avisos_salientes). Solo ids, tipo y referencia: nunca texto libre del cliente
 * ni correos (se resuelven al enviar). La lee el super admin y la vacia el despachador (lib/servidor/avisos).
 */
export type DestinoAviso = 'usuario' | 'super_admin' | 'cliente_dinero' | 'cliente_admin';
export type EstadoAviso = 'pendiente' | 'enviando' | 'pendiente_sin_proveedor' | 'enviado' | 'fallido' | 'cancelado';
export interface AvisoSaliente {
  id: string; empresa_id: string; modulo: string; tipo: string; destino: DestinoAviso; destinatario_user_id: string | null;
  referencia_id: string | null; clave_unica: string; datos: Record<string, unknown>; programado_para: string;
  estado: EstadoAviso; intentos: number; enviado_en: string | null; ultimo_error: string | null; reclamado_hasta: string | null; creado_en: string;
}

// ---- Argumentos de las funciones (los montos como texto para no pasar por float) ----
export type Monto = string | number;
export interface ArgsCrearContrato { p_proyecto_id: string; p_valor: Monto; p_moneda: Moneda; p_anticipo?: Monto; p_fecha_firma?: string | null }
export interface ArgsEditarContrato { p_contrato_id: string; p_valor?: Monto; p_anticipo?: Monto; p_fecha_firma?: string; p_moneda?: Moneda }
export interface ArgsAgregarPago { p_contrato_id: string; p_concepto: string; p_valor: Monto; p_vence_el: string; p_hito_id?: string | null }
export interface ArgsEditarPago { p_pago_id: string; p_concepto?: string; p_valor?: Monto; p_vence_el?: string; p_hito_id?: string; p_quitar_hito?: boolean }
export interface ArgsCrearAbono {
  p_contrato_id: string; p_valor: Monto; p_fecha_pago: string; p_medio: MedioPago;
  p_pago_id?: string | null; p_referencia?: string | null; p_archivo_path?: string | null;
}
export interface ArgsCrearFactura {
  p_contrato_id: string; p_numero: string; p_valor: Monto; p_fecha_emision: string;
  p_archivo_path: string; p_archivo_nombre: string; p_tamano_bytes: number; p_pago_id?: string | null;
}
export interface ArgsSubirComprobante {
  p_pago_id: string; p_archivo_path: string; p_archivo_nombre: string; p_archivo_tipo: TipoArchivoComprobante;
  p_tamano_bytes: number; p_valor: Monto; p_fecha_pago: string; p_nota?: string | null;
}
export interface ArgsConfirmarComprobante { p_comprobante_id: string; p_medio?: MedioPago; p_valor?: Monto; p_fecha_pago?: string; p_referencia?: string }

// =====================================================================================
// Tickets y mantenimiento (sprints 5 y 6). Escritos a mano, fundidos aqui en la integracion (antes: lib/supabase/tipos-tickets-mant.ts).
// =====================================================================================
export type TipoTicket = 'error' | 'solicitud_cambio' | 'pregunta' | 'acceso';
export type PrioridadTicket = 'urgente' | 'alta' | 'normal' | 'baja';
export type EstadoTicket = 'nuevo' | 'clasificado' | 'en_progreso' | 'esperando_cliente' | 'resuelto' | 'cerrado';
export type AreaEquipo = 'Producto' | 'Arquitectura' | 'Diseño' | 'Desarrollo' | 'Calidad' | 'Operaciones';
export type DecisionDueno = 'cobrar' | 'regalar' | 'rechazar';
export type MotivoFueraDePlan = 'sin_mantenimiento' | 'mantenimiento_vencido' | 'sin_cobertura_errores';
export type CierreMotivo = 'confirmado_cliente' | 'automatico' | 'cerrado_por_websourcing' | 'rechazado' | 'cobro_rechazado';
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
  /** true en horas de una solicitud de cambio: se anotan para costo y no descuentan de la bolsa. */
  sin_descuento: boolean;
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

// =====================================================================================
// Solicitud de cambio 5 · ahorro de espacio (integración).
// =====================================================================================
export type EstadoEspacio = 'ok' | 'aviso' | 'lleno';
export interface EspacioDeEmpresa {
  empresa_id: string; usado_bytes: number; cupo_bytes: number; porcentaje: number; estado: EstadoEspacio;
}
export interface EspacioPorEmpresa {
  empresa_id: string; nombre: string; usado_bytes: number; cupo_bytes: number; porcentaje: number;
}
export interface EnlaceVideoTicket { id: string; empresa_id: string; ticket_id: string; mensaje_id: string | null; subido_por: string; url: string; creado_en: string }
export type EstadoArchivoArchivado = 'marcado' | 'trasladado' | 'borrado_de_supabase' | 'recuperacion_pedida' | 'recuperado' | 'error';
export interface ArchivoArchivado {
  id: string; empresa_id: string; proyecto_id: string | null;
  origen_tabla: 'documento_versiones' | 'archivos_cliente' | 'ticket_adjuntos'; origen_id: string;
  bucket_id: string; storage_path: string; nombre_original: string; tamano_bytes: number;
  estado: EstadoArchivoArchivado; ubicacion_externa: string | null; marcado_en: string; trasladado_en: string | null;
  borrado_supabase_en: string | null; recuperacion_pedida_en: string | null; recuperado_en: string | null;
}
/** Panel e inicio: `tickets_abiertos` = tickets no cerrados; `comprobantes_en_revision` solo con "ver dinero". */
