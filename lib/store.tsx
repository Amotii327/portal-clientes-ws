'use client';
import * as React from 'react';
import { ACTIVIDAD_INICIAL, EMPRESAS_INICIALES, type Actividad, type Empresa, type Miembro, type Rol } from './data';
import { HOY } from './utils';

export type EstadoPantalla = 'normal' | 'vacio' | 'cargando' | 'error';
export type Tema = 'oscuro' | 'claro';

interface Toast { id: number; texto: string }

/** Datos de la persona real que entró (solo en la app real; en el prototipo no existe). Vienen de mi_contexto(). */
export interface ContextoReal {
  rol: Rol;
  nombre: string;
  nombreEmpresa: string | null;
  permisos: { aprobar: boolean; verDinero: boolean; verTodosTickets: boolean; subirArchivos: boolean } | null;
  tema: Tema;
  /** Solo con una sesión de "ver como el cliente" abierta (D-020): todo es de solo lectura. */
  verComo: { empresaNombre: string; rol: string; venceEn: string } | null;
}

interface Store {
  rol: Rol;
  setRol: (r: Rol) => void;
  empresas: Empresa[];
  empresaId: string;
  setEmpresaId: (id: string) => void;
  empresa: Empresa; // empresa que ve el cliente
  usuario: Miembro | null; // miembro que "soy" en el prototipo (null = super admin)
  estadoPantalla: EstadoPantalla;
  setEstadoPantalla: (e: EstadoPantalla) => void;
  tema: Tema;
  setTema: (t: Tema) => void;
  verComo: boolean; // el super admin está mirando como cliente (solo lectura)
  setVerComo: (v: boolean) => void;
  actividad: Actividad[];
  mutar: (empresaId: string, fn: (e: Empresa) => void, registro?: string) => void;
  registrar: (accion: string, empresa: string) => void;
  avisar: (texto: string) => void;
  toasts: Toast[];
  real?: ContextoReal;
  can: { aprobar: boolean; verDinero: boolean; verTodosTickets: boolean; subirArchivos: boolean; esAdmin: boolean; soloLectura: boolean };
}

const Ctx = React.createContext<Store | null>(null);
export const useStore = () => {
  const s = React.useContext(Ctx);
  if (!s) throw new Error('Falta StoreProvider');
  return s;
};

export function StoreProvider({ children, real, alCambiarTema }: { children: React.ReactNode; real?: ContextoReal; alCambiarTema?: (t: Tema) => Promise<void> | void }) {
  const [rol, setRol] = React.useState<Rol>(real?.rol ?? 'admin');
  const [empresas, setEmpresas] = React.useState<Empresa[]>(EMPRESAS_INICIALES);
  const [empresaId, setEmpresaId] = React.useState('ejemplo');
  const [estadoPantalla, setEstadoPantalla] = React.useState<EstadoPantalla>('normal');
  const [tema, setTemaState] = React.useState<Tema>(real?.tema ?? 'claro');
  const [verComo, setVerComo] = React.useState(false);
  const [actividad, setActividad] = React.useState<Actividad[]>(ACTIVIDAD_INICIAL);
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    if (real) return; // en la app real el tema sale de la preferencia guardada del usuario
    try {
      const t = localStorage.getItem('ws-tema');
      if (t === 'claro' || t === 'oscuro') setTemaState(t);
    } catch {}
  }, []);
  const setTema = (t: Tema) => {
    setTemaState(t);
    try { localStorage.setItem('ws-tema', t); } catch {}
    try {
      Promise.resolve(alCambiarTema?.(t)).catch(() => avisar('Cambiamos el tema, pero no pudimos guardar tu preferencia. Intenta de nuevo más tarde.'));
    } catch {}
  };
  React.useEffect(() => {
    document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark';
  }, [tema]);

  const registrar = React.useCallback((accion: string, empresa: string) => {
    setActividad((a) => [{ cuando: HOY + ' 10:30', quien: 'Usuario del prototipo', accion, empresa, ip: '—' }, ...a]);
  }, []);
  const avisar = React.useCallback((texto: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, texto }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const mutar = React.useCallback((id: string, fn: (e: Empresa) => void, registro?: string) => {
    setEmpresas((prev) => {
      const copia: Empresa[] = JSON.parse(JSON.stringify(prev));
      const e = copia.find((x) => x.id === id);
      if (e) fn(e);
      return copia;
    });
    if (registro) {
      const nombre = empresas.find((x) => x.id === id)?.nombre ?? '';
      registrar(registro, nombre);
    }
  }, [empresas, registrar]);

  const base = empresas.find((e) => e.id === empresaId) ?? empresas[0];
  const empresa = real?.nombreEmpresa ? { ...base, nombre: real.nombreEmpresa } : base;
  const usuario: Miembro | null =
    rol === 'super' ? null
    : rol === 'admin' ? empresa.miembros.find((m) => m.rol === 'admin') ?? null
    : empresa.miembros.find((m) => m.rol === 'equipo' && m.estado === 'activo' && !m.permisos.verDinero) ?? empresa.miembros.find((m) => m.rol === 'equipo') ?? empresa.miembros[0];

  const esAdmin = rol === 'admin';
  const perm = real ? real.permisos ?? undefined : usuario?.permisos;
  const can = {
    aprobar: esAdmin || (rol === 'equipo' && !!perm?.aprobar),
    verDinero: esAdmin || rol === 'super' || (rol === 'equipo' && !!perm?.verDinero),
    verTodosTickets: esAdmin || rol === 'super' || (rol === 'equipo' && !!perm?.verTodosTickets),
    subirArchivos: esAdmin || (rol === 'equipo' && !!perm?.subirArchivos),
    esAdmin,
    soloLectura: (verComo || !!real?.verComo) && rol !== 'super',
  };

  const value: Store = {
    rol, setRol, empresas, empresaId, setEmpresaId, empresa, usuario, estadoPantalla, setEstadoPantalla, tema, setTema,
    verComo, setVerComo, actividad, mutar, registrar, avisar, toasts, can, real,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const ROL_LABEL: Record<Rol, string> = { super: 'Super administrador', admin: 'Administrador del cliente', equipo: 'Equipo del cliente' };
