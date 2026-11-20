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
    /** null = el modulo aun no existe (dinero: sprint 4; tickets: sprint 5). */
    pagos_vencidos: number | null; tickets_abiertos: number | null;
  };
  proyectos: ResumenProyecto[];
  atencion: ItemAtencion[];
}
export type ItemAtencion =
  | { tipo: 'hito_atrasado'; prioridad: '1'; empresa_id: string; empresa_nombre: string; proyecto_id: string; proyecto_nombre: string;
      hito_numero: number; hito_nombre: string; fecha_planeada: string; dias_de_atraso: number; esperando_al_cliente: boolean }
  | { tipo: 'plan_por_aprobar'; prioridad: '2'; empresa_id: string; empresa_nombre: string; proyecto_id: string; proyecto_nombre: string }
  | { tipo: 'demo_proxima'; prioridad: '3'; empresa_id: string; empresa_nombre: string; proyecto_id: string; proyecto_nombre: string; fecha: string };

export interface InicioCliente {
  empresa: { id: string; nombre: string };
  proyectos: ResumenProyecto[];
  pendientes_del_cliente: { proyecto_id: string; hito_numero: number; hito_nombre: string; fecha_nueva: string; motivo: string; que_falta: string }[];
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
