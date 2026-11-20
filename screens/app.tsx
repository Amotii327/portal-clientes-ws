'use client';
import * as React from 'react';
import { ProtoBar } from '@/components/shell/proto-bar';
import { Shell } from '@/components/shell/shell';
import { Toasts } from '@/components/ds/toasts';
import { EmpresaPausada, SinPermiso } from '@/components/ds/states';
import { PageHeader } from '@/components/ds/page';
import { ir, useRuta } from '@/lib/router';
import { StoreProvider, useStore } from '@/lib/store';
import { EntradaLayout, Login } from './entrada';
import { ADMIN, CLIENTE, ENTRADA, buscar } from './rutas-prototipo';
import { Indice } from './indice';
import { Sistema } from './sistema';

function Rutas() {
  const ruta = useRuta();
  const s = useStore();
  const [listo, setListo] = React.useState(false);
  React.useEffect(() => setListo(true), []);
  React.useEffect(() => { if (s.rol === 'super' && ruta.startsWith('/cliente')) ir('/admin/panel'); }, [s.rol, ruta]);
  if (!listo) return null;
  const r = ruta.replace(/\/$/, '') || '/';
  let cuerpo: React.ReactNode;
  if (r === '/') cuerpo = <Indice />;
  else if (r === '/sistema-de-diseno') cuerpo = <Sistema />;
  else if (r.startsWith('/entrada')) cuerpo = <EntradaLayout>{buscar(ENTRADA, r) ?? <Login />}</EntradaLayout>;
  else if (r.startsWith('/cliente')) {
    if (s.rol === 'super') cuerpo = null;
    else if (s.empresa.estado === 'pausada') cuerpo = <EmpresaPausada />;
    else cuerpo = <Shell>{buscar(CLIENTE, r) ?? <><PageHeader titulo="Pantalla no encontrada" /><SinPermiso texto="Esta pantalla no existe." /></>}</Shell>;
  } else if (r.startsWith('/admin')) {
    cuerpo = s.rol === 'super'
      ? <Shell>{buscar(ADMIN, r) ?? <><PageHeader titulo="Pantalla no encontrada" /><SinPermiso texto="Esta pantalla no existe." /></>}</Shell>
      : <Shell><PageHeader titulo="Zona de Websourcing" /><SinPermiso texto="Esta zona es solo para el equipo de Websourcing. Tu cuenta no tiene acceso." /></Shell>;
  } else cuerpo = <Indice />;
  return <>{cuerpo}</>;
}

export function PrototipoApp() {
  return (
    <StoreProvider>
      <ProtoBar />
      <Rutas />
      <Toasts />
    </StoreProvider>
  );
}
