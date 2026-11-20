/**
 * Tipos de la base de datos, sprint 1. ESCRITOS A MANO con el formato de `supabase gen types`.
 * Cuando exista el proyecto de Supabase, se regeneran con:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 * Ojo: la API solo deja INSERT/UPDATE en las columnas que concede la matriz (docs/matriz-permisos.md);
 * aquí `Insert` y `Update` ya reflejan eso. Todo lo demás se hace con las funciones RPC (`Functions`).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Rol = 'admin_cliente' | 'equipo';
export type Tema = 'clara' | 'oscura';
export type EstadoEmpresa = 'activa' | 'pausada';

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
      // super_admins: sin acceso desde la API, a propósito.
    };
    Views: Record<string, never>;
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
        Args: { p_token: string; p_version_politica: string; p_nombre?: string | null; p_celular?: string | null; p_ip?: string | null };
        Returns: { empresa_id: string; miembro_id: string; rol: Rol };
      };
      quitar_miembro: { Args: { p_miembro_id: string }; Returns: undefined };
      bloquear_miembro: { Args: { p_miembro_id: string; p_bloqueado?: boolean }; Returns: undefined };
      pausar_empresa: { Args: { p_empresa_id: string; p_motivo?: string | null }; Returns: undefined };
      reactivar_empresa: { Args: { p_empresa_id: string }; Returns: undefined };
      bloquear_usuario: { Args: { p_user_id: string; p_bloqueado?: boolean }; Returns: undefined };
      politica_vigente: { Args: Record<PropertyKey, never>; Returns: string };
      mi_contexto: { Args: Record<PropertyKey, never>; Returns: MiContexto };
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
}
