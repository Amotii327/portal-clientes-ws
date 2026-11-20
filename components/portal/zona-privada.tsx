'use client';
import * as React from 'react';
import { Ban, LogOut, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Shell, Logo } from '@/components/shell/shell';
import { Toasts } from '@/components/ds/toasts';
import { Centro, EmpresaPausada, SinPermiso } from '@/components/ds/states';
import { PageHeader } from '@/components/ds/page';
import { PuenteDeRutas, useRuta } from '@/lib/router';
import { StoreProvider, type ContextoReal, type Tema } from '@/lib/store';
import { CONTACTO_SOPORTE } from '@/lib/app/config';
import { cerrarSesion } from '@/lib/app/sesion';
import { rutaPermitida } from '@/lib/app/rutas';
import { crearClienteNavegador } from '@/lib/supabase/client';
import type { MiContexto } from '@/lib/supabase/database.types';
import { ProveedorContexto } from './contexto';

function aContextoReal(c: MiContexto): ContextoReal {
  const p = c.permisos;
  return {
    rol: c.estado === 'super_admin' ? 'super' : c.rol === 'admin_cliente' ? 'admin' : 'equipo',
    nombre: c.nombre ?? '',
    nombreEmpresa: c.empresa?.nombre ?? null,
    permisos: p ? { aprobar: p.aprobar, verDinero: p.ver_dinero, verTodosTickets: p.ver_todos_tickets, subirArchivos: p.subir_archivos } : null,
    tema: c.tema === 'oscura' ? 'oscuro' : 'claro',
    verComo: c.estado === 'ver_como' && c.ver_como ? { empresaNombre: c.ver_como.empresa_nombre, rol: c.ver_como.rol, venceEn: c.ver_como.vence_en } : null,
  };
}

function Interior({ contexto, children }: { contexto: MiContexto; children: React.ReactNode }) {
  const ruta = useRuta();
  const permiso = rutaPermitida(contexto, ruta);
  return (
    <Shell>
      {permiso.ok ? children : (
        <>
          <PageHeader titulo="Sin permiso" />
          <SinPermiso texto={permiso.texto} inicio={contexto.estado === 'super_admin' ? '/admin/panel' : '/cliente/inicio'} />
        </>
      )}
    </Shell>
  );
}

/** Zona privada con acceso normal (super admin o miembro activo): menú, tema y pantallas. */
export function ZonaPrivada({ contexto, children }: { contexto: MiContexto; children: React.ReactNode }) {
  const guardarTema = React.useCallback(async (t: Tema) => {
    if (!contexto.user_id || contexto.estado === 'ver_como') return; // en "ver como" nada se escribe
    const { error } = await crearClienteNavegador()
      .from('preferencias_usuario')
      .upsert({ user_id: contexto.user_id, tema: t === 'oscuro' ? 'oscura' : 'clara' });
    if (error) throw error;
  }, [contexto.user_id]);
  return (
    <ProveedorContexto value={contexto}>
      <StoreProvider real={aContextoReal(contexto)} alCambiarTema={guardarTema}>
        <PuenteDeRutas />
        <Interior contexto={contexto}>{children}</Interior>
        <Toasts />
      </StoreProvider>
    </ProveedorContexto>
  );
}

/** Estados en los que la persona no entra a la zona privada: mensaje amable y salida. */
export function PantallaDeAcceso({ estado, empresa }: { estado: string; empresa?: string | null }) {
  const salir = <Button variant="outline" onClick={() => void cerrarSesion()}><LogOut />Cerrar sesión</Button>;
  const escribir = <Button asChild><a href={`mailto:${CONTACTO_SOPORTE}`}>Escribir al Equipo Websourcing</a></Button>;
  let cuerpo: React.ReactNode;
  if (estado === 'empresa_pausada') {
    cuerpo = <><EmpresaPausada empresa={empresa ?? undefined} /><div className="flex justify-center">{salir}</div></>;
  } else if (estado === 'miembro_quitado') {
    cuerpo = (
      <Centro tono="warning" icono={<UserX className="size-7" />} titulo="Ya no tienes acceso a este portal" texto={`${empresa ? `El administrador de ${empresa} te retiró del equipo.` : 'Te retiraron del equipo de tu empresa.'} Tu historial se conserva. Si crees que es un error, escríbenos y lo revisamos.`}>{escribir}{salir}</Centro>
    );
  } else if (estado === 'miembro_bloqueado' || estado === 'usuario_bloqueado') {
    cuerpo = (
      <Centro tono="danger" icono={<Ban className="size-7" />} titulo="Tu acceso está suspendido" texto="Por seguridad, tu cuenta está bloqueada por ahora. No se borró nada. Escríbenos y te ayudamos a resolverlo.">{escribir}{salir}</Centro>
    );
  } else if (estado === 'sin_perfil' || estado === 'sin_membresia') {
    cuerpo = (
      <Centro tono="neutral" icono={<UserX className="size-7" />} titulo="Tu cuenta aún no está activada" texto="Para entrar necesitas activar tu cuenta con el enlace del correo de invitación. Ábrelo desde el mensaje que te enviamos; si no lo encuentras, pídele a quien te invitó que te envíe uno nuevo.">{salir}</Centro>
    );
  } else {
    cuerpo = (
      <Centro tono="danger" icono={<Ban className="size-7" />} titulo="No pudimos cargar tu cuenta" texto="Algo salió mal de nuestro lado. Tu información está a salvo. Recarga la página; si sigue igual, escríbenos.">
        <Button onClick={() => window.location.reload()}>Reintentar</Button>{escribir}
      </Centro>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:px-8">
      <div className="mb-8 w-full max-w-xl"><Logo className="h-8" /></div>
      <div className="w-full max-w-xl" data-estado-acceso={estado}>{cuerpo}</div>
      <p className="mt-8 text-xs text-muted-foreground">Equipo Websourcing</p>
    </div>
  );
}
