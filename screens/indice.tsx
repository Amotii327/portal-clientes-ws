'use client';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Enlace } from '@/lib/router';
import { Logo } from '@/components/shell/shell';
import { useStore } from '@/lib/store';
import type { Rol } from '@/lib/data';

const GRUPOS: { titulo: string; texto: string; rol?: Rol; items: [string, string][] }[] = [
  { titulo: 'Entrada', texto: 'Pantallas antes de entrar.', items: [['/entrada/login', 'Iniciar sesión'], ['/entrada/invitacion', 'Activar invitación'], ['/entrada/recuperar', 'Recuperar contraseña'], ['/entrada/codigo', 'Código de verificación (2FA)']] },
  { titulo: 'Cliente (admin y equipo)', texto: 'Cambia entre "Admin del cliente" y "Equipo del cliente" para ver qué cambia con los permisos.', rol: 'admin', items: [['/cliente/inicio', 'Inicio y línea de tiempo'], ['/cliente/revisiones', 'Revisiones'], ['/cliente/dinero', 'Dinero'], ['/cliente/tickets', 'Tickets'], ['/cliente/tickets/nuevo', 'Crear un ticket'], ['/cliente/tickets/T-0014', 'Detalle de ticket'], ['/cliente/documentos', 'Documentos y archivos de la empresa'], ['/cliente/equipo', 'Mi equipo y permisos'], ['/cliente/mantenimiento', 'Mi plan de mantenimiento']] },
  { titulo: 'Super administrador', texto: 'La zona del dueño.', rol: 'super', items: [['/admin/panel', 'Panel general'], ['/admin/clientes', 'Clientes'], ['/admin/clientes/ejemplo', 'Detalle de cliente'], ['/admin/proyectos/ejemplo/pedidos', 'Detalle de proyecto (editar hitos)'], ['/admin/aprobaciones', 'Bandeja de aprobaciones'], ['/admin/finanzas', 'Finanzas'], ['/admin/tickets', 'Tickets de todos'], ['/admin/mantenimiento', 'Activar y configurar mantenimiento'], ['/admin/registro', 'Registro de actividad']] },
  { titulo: 'Sistema de diseño', texto: 'Colores, letras y componentes de las dos propuestas.', items: [['/sistema-de-diseno', 'Ver sistema de diseño']] },
];

export function Indice() {
  const { setRol, rol } = useStore();
  return (
    <div className="page-gutter mx-auto max-w-6xl py-10">
      <Logo className="mb-8 h-8" />
      <h1 className="text-display-xl">Prototipo del portal de clientes</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Es la aplicación con botones que funcionan y datos de ejemplo. Usa <strong className="text-foreground">Propuesta</strong> para comparar el diseño A (clara) y B (oscura), y <strong className="text-foreground">Ver como</strong> para cambiar de rol. En <strong className="text-foreground">Opciones</strong> están los estados vacío, cargando, error y empresa pausada.</p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {GRUPOS.map((g) => (
          <Card key={g.titulo} className="p-6">
            <h2 className="text-display-md">{g.titulo}</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">{g.texto}</p>
            <ul className="space-y-1">
              {g.items.map(([to, t]) => (
                <li key={to}><Enlace to={to} onClick={() => g.rol && g.rol !== rol && setRol(g.rol)} className="group flex min-h-11 items-center justify-between gap-3 rounded px-3 text-sm hover:bg-surface-2"><span>{t}</span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden /></Enlace></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted-foreground">Equipo Websourcing · Diseño. Todos los datos y montos (COP) son de ejemplo.</p>
    </div>
  );
}
