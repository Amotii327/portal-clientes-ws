'use client';
import * as React from 'react';
import { AlertTriangle, Inbox, Lock, PauseCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useStore } from '@/lib/store';

function Centro({ icono, titulo, texto, children, tono = 'neutral' }: { icono: React.ReactNode; titulo: string; texto: string; children?: React.ReactNode; tono?: 'neutral' | 'danger' | 'warning' }) {
  const t = { neutral: 'bg-surface-2 text-muted-foreground', danger: 'bg-danger/15 text-danger', warning: 'bg-warning/15 text-warning' }[tono];
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <div className={`mb-4 flex size-14 items-center justify-center rounded-full ${t}`}>{icono}</div>
      <h2 className="text-display-md">{titulo}</h2>
      <p className="mt-2 max-w-md text-muted-foreground">{texto}</p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </Card>
  );
}

export const EstadoVacio = ({ titulo = 'Todavía no hay nada aquí', texto = 'Cuando haya información, la verás en esta pantalla.', children }: { titulo?: string; texto?: string; children?: React.ReactNode }) => (
  <Centro icono={<Inbox className="size-7" />} titulo={titulo} texto={texto}>{children}</Centro>
);

export function EstadoCargando() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando">
      <div className="skeleton h-8 w-1/3" />
      <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28" />)}</div>
      <div className="skeleton h-64" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export function EstadoError({ onReintentar }: { onReintentar?: () => void }) {
  const { setEstadoPantalla } = useStore();
  return (
    <Centro tono="danger" icono={<AlertTriangle className="size-7" />} titulo="No pudimos cargar esta pantalla" texto="Algo salió mal de nuestro lado. Tu información está a salvo. Intenta de nuevo; si sigue igual, crea un ticket y lo revisamos.">
      <Button onClick={() => (onReintentar ?? (() => setEstadoPantalla('normal')))()}><RefreshCw />Reintentar</Button>
      <Button variant="outline" asChild><a href="#/cliente/tickets/nuevo">Crear un ticket</a></Button>
    </Centro>
  );
}

export const SinPermiso = ({ texto }: { texto?: string }) => (
  <Centro tono="warning" icono={<Lock className="size-7" />} titulo="No tienes permiso para ver esto" texto={texto ?? 'El administrador de tu empresa decide quién ve esta parte. Si la necesitas, pídele que te dé acceso.'}>
    <Button variant="outline" asChild><a href="#/cliente/inicio">Volver al inicio</a></Button>
  </Centro>
);

export const EmpresaPausada = () => (
  <div className="mx-auto max-w-xl py-10">
    <Centro tono="warning" icono={<PauseCircle className="size-7" />} titulo="Tu cuenta está en pausa" texto="Por ahora no puedes entrar a este portal. No se ha borrado nada: tu información sigue guardada. Escríbenos y la reactivamos.">
      <Button asChild><a href="mailto:soporte@ejemplo.co">Escribir al Equipo Websourcing</a></Button>
    </Centro>
  </div>
);

/** Pinta el estado "vacío / cargando / error" que se elige en la barra del prototipo; si es normal, muestra el contenido. */
export function Pantalla({ children, vacio }: { children: React.ReactNode; vacio?: { titulo: string; texto: string; accion?: React.ReactNode } }) {
  const { estadoPantalla } = useStore();
  if (estadoPantalla === 'cargando') return <EstadoCargando />;
  if (estadoPantalla === 'error') return <EstadoError />;
  if (estadoPantalla === 'vacio') return <EstadoVacio titulo={vacio?.titulo} texto={vacio?.texto}>{vacio?.accion}</EstadoVacio>;
  return <>{children}</>;
}
