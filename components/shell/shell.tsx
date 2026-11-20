'use client';
import * as React from 'react';
import { Activity, BellRing, ClipboardCheck, FolderOpen, Home, LayoutDashboard, LifeBuoy, LogOut, Menu, Users, Wallet, Wrench, Building2, Banknote, Inbox, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Enlace, useRuta } from '@/lib/router';
import { ROL_LABEL, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function Logo({ className, solo }: { className?: string; solo?: boolean }) {
  const { tema } = useStore();
  const archivo = (solo ? 'icono' : 'logo') + (tema === 'oscuro' ? '-blanco' : '') + '.svg';
  // Ruta relativa: funciona desde cualquier carpeta.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`./marca/${archivo}`} alt="Websourcing" className={cn(solo ? 'h-8 w-auto' : 'h-7 w-auto', className)} />;
}

interface Item { to: string; label: string; icon: React.ReactNode; badge?: number }

function useNav(): Item[] {
  const s = useStore();
  const pendientes = s.empresa.revisiones.filter((r) => r.estado === 'publicada').length;
  const ic = 'size-5';
  if (s.rol === 'super') {
    const porRevisar = s.empresas.flatMap((e) => e.revisiones).filter((r) => r.estado === 'borrador' || r.estado === 'cambios_pedidos').length;
    return [
      { to: '/admin/panel', label: 'Panel general', icon: <LayoutDashboard className={ic} /> },
      { to: '/admin/clientes', label: 'Clientes', icon: <Building2 className={ic} /> },
      { to: '/admin/aprobaciones', label: 'Bandeja de aprobaciones', icon: <Inbox className={ic} />, badge: porRevisar },
      { to: '/admin/finanzas', label: 'Finanzas', icon: <Banknote className={ic} /> },
      { to: '/admin/tickets', label: 'Tickets de todos', icon: <LifeBuoy className={ic} /> },
      { to: '/admin/mantenimiento', label: 'Mantenimiento', icon: <Wrench className={ic} /> },
      { to: '/admin/registro', label: 'Registro de actividad', icon: <Activity className={ic} /> },
    ];
  }
  const items: Item[] = [
    { to: '/cliente/inicio', label: 'Inicio', icon: <Home className={ic} /> },
    { to: '/cliente/revisiones', label: 'Revisiones', icon: <ClipboardCheck className={ic} />, badge: pendientes },
  ];
  if (s.can.verDinero) items.push({ to: '/cliente/dinero', label: 'Dinero', icon: <Wallet className={ic} /> });
  items.push({ to: '/cliente/tickets', label: 'Tickets', icon: <LifeBuoy className={ic} /> }, { to: '/cliente/documentos', label: 'Documentos', icon: <FolderOpen className={ic} /> });
  if (s.can.esAdmin) items.push({ to: '/cliente/equipo', label: 'Mi equipo', icon: <Users className={ic} /> });
  if (s.empresa.mantenimiento.activo) items.push({ to: '/cliente/mantenimiento', label: 'Mi plan de mantenimiento', icon: <Wrench className={ic} /> });
  return items;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const ruta = useRuta();
  const items = useNav();
  return (
    <nav aria-label="Menú principal" className="flex flex-col gap-1">
      {items.map((it) => {
        const activo = ruta === it.to || ruta.startsWith(it.to + '/');
        return (
          <Enlace key={it.to} to={it.to} onClick={onNavigate} aria-current={activo ? 'page' : undefined}
            className={cn('flex h-11 items-center gap-3 rounded px-3 text-sm font-medium transition-colors', activo ? 'bg-primary/15 text-primary-text' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground')}>
            {it.icon}<span className="flex-1">{it.label}</span>
            {!!it.badge && <span className="rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">{it.badge}</span>}
          </Enlace>
        );
      })}
    </nav>
  );
}

function Usuario() {
  const s = useStore();
  const nombre = s.rol === 'super' ? 'Super administrador' : s.usuario?.cargo ?? '';
  const sub = s.rol === 'super' ? 'Equipo Websourcing' : s.empresa.nombre;
  return (
    <div className="mt-auto border-t border-border pt-4">
      <div className="mb-3 flex items-center gap-3 px-1">
        <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 font-display text-sm font-semibold text-primary-text" aria-hidden>{nombre.slice(0, 1)}</span>
        <div className="min-w-0"><p className="truncate text-sm font-medium">{nombre}</p><p className="truncate text-xs text-muted-foreground">{sub}</p></div>
      </div>
      <Button variant="ghost" size="sm" className="w-full justify-start" asChild><Enlace to="/entrada/login"><LogOut />Cerrar sesión</Enlace></Button>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const s = useStore();
  const [menu, setMenu] = React.useState(false);
  const ruta = useRuta();
  React.useEffect(() => setMenu(false), [ruta]);
  const esSuper = s.rol === 'super';
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)]">
      <aside className="sticky top-11 hidden h-[calc(100dvh-2.75rem)] w-64 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        <Enlace to={esSuper ? '/admin/panel' : '/cliente/inicio'} className="mb-6 block px-3"><Logo /></Enlace>
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{esSuper ? 'Zona de Websourcing' : s.empresa.nombre}</p>
        <NavList />
        <Usuario />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-11 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <Dialog open={menu} onOpenChange={setMenu}>
            <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Abrir menú"><Menu /></Button></DialogTrigger>
            <DialogContent title="Menú" side="left">
              <div className="flex min-h-0 flex-1 flex-col"><NavList onNavigate={() => setMenu(false)} /><Usuario /></div>
            </DialogContent>
          </Dialog>
          <Logo />
          <Badge variant="neutral" className="ml-auto">{esSuper ? 'Websourcing' : ROL_LABEL[s.rol].replace(' del cliente', '')}</Badge>
        </header>
        <div className="hidden h-14 items-center justify-between border-b border-border px-8 lg:flex">
          <p className="text-sm text-muted-foreground">{esSuper ? 'Zona del super administrador' : <><span className="text-foreground">{s.empresa.nombre}</span> · {ROL_LABEL[s.rol]}</>}</p>
          <div className="flex items-center gap-3 text-muted-foreground"><BellRing className="size-5" aria-label="Avisos" /></div>
        </div>
        {s.verComo && s.rol !== 'super' && (
          <div className="flex flex-wrap items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm md:px-8">
            <EyeOff className="size-4 text-warning" aria-hidden />
            <span><strong>Estás viendo como {s.empresa.nombre}</strong> · solo lectura. Queda en el registro.</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => { s.setVerComo(false); s.setRol('super'); location.hash = '/admin/clientes'; }}>Salir de "ver como"</Button>
          </div>
        )}
        <main className="page-gutter mx-auto w-full max-w-6xl py-6 md:py-8">{children}</main>
        <footer className="page-gutter mx-auto max-w-6xl pb-8 text-xs text-muted-foreground">© Equipo Websourcing · Los datos y montos de este prototipo son de ejemplo.</footer>
      </div>
    </div>
  );
}
