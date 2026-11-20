'use client';
import { Download, Plus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { HitoBadge, PagoBadge, PrioridadBadge, Semaforo, TicketBadge } from '@/components/ds/badges';
import { PageHeader, Seccion } from '@/components/ds/page';
import { Logo } from '@/components/shell/shell';
import { useStore } from '@/lib/store';

const COLORES = [['background', 'Fondo'], ['surface', 'Tarjeta'], ['surface-2', 'Tarjeta interna'], ['border', 'Borde'], ['foreground', 'Texto'], ['muted-foreground', 'Texto secundario'], ['primary', 'Verde de marca'], ['success', 'Éxito'], ['warning', 'Alerta'], ['danger', 'Error'], ['info', 'Información']];

export function Sistema() {
  const { tema } = useStore();
  return (
    <div className="page-gutter mx-auto max-w-6xl py-10">
      <PageHeader eyebrow={tema === 'claro' ? 'Propuesta A · Clara' : 'Propuesta B · Oscura'} titulo="Sistema de diseño" descripcion="Una paleta, una tipografía, espacios y componentes fijos. Todo sale de variables (tokens) en app/globals.css: se ajusta en un solo lugar." />
      <Seccion titulo="Marca"><Card className="flex flex-wrap items-center gap-8 p-6"><Logo className="h-10" /><Logo solo className="h-10" /></Card></Seccion>
      <Seccion titulo="Colores (tokens)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLORES.map(([k, n]) => (
            <Card key={k} className="overflow-hidden"><div className="h-16 border-b border-border" style={{ background: `rgb(var(--${k}))` }} /><div className="p-3"><p className="text-sm font-medium">{n}</p><p className="text-xs text-muted-foreground">--{k}</p></div></Card>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">El verde #99F100 se usa como relleno de botones y marcas, siempre con texto negro #0D1015. En la propuesta clara nunca va como texto sobre blanco.</p>
      </Seccion>
      <Seccion titulo="Tipografía">
        <Card className="space-y-3 p-6">
          <p className="text-display-xl">Títulos en Poppins</p>
          <p className="text-display-lg">Subtítulo grande</p>
          <p className="text-display-md">Título de sección</p>
          <p>Texto de lectura en Inter, 15 px, para párrafos y formularios. <span className="text-muted-foreground">Texto secundario para ayudas.</span></p>
        </Card>
      </Seccion>
      <Seccion titulo="Botones">
        <Card className="flex flex-wrap items-center gap-3 p-6">
          <Button>Primario</Button><Button variant="secondary">Secundario</Button><Button variant="outline">Contorno</Button><Button variant="ghost">Fantasma</Button><Button variant="destructive">Peligro</Button><Button><Plus />Con ícono</Button><Button size="sm"><Download />Pequeño</Button><Button disabled>Desactivado</Button>
        </Card>
      </Seccion>
      <Seccion titulo="Formularios">
        <Card className="grid gap-4 p-6 md:grid-cols-2">
          <Field label="Campo de texto" htmlFor="s-1" hint="Texto de ayuda"><Input id="s-1" placeholder="Escribe aquí" /></Field>
          <Field label="Campo con error" htmlFor="s-2" error="Este campo es obligatorio."><Input id="s-2" aria-invalid /></Field>
          <Field label="Lista" htmlFor="s-3"><Select id="s-3"><option>Opción uno</option><option>Opción dos</option></Select></Field>
          <Field label="Texto largo" htmlFor="s-4"><Textarea id="s-4" /></Field>
          <Checkbox checked onChange={() => {}} label="Casilla marcada" />
          <div className="flex items-center gap-3"><Switch defaultChecked aria-label="Interruptor" /><span className="text-sm">Interruptor</span></div>
        </Card>
      </Seccion>
      <Seccion titulo="Insignias de estado y semáforo">
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap gap-2"><HitoBadge estado="pendiente" /><HitoBadge estado="en_curso" /><HitoBadge estado="esperando" /><HitoBadge estado="terminado" /></div>
          <div className="flex flex-wrap gap-2"><PagoBadge estado="pagado" /><PagoBadge estado="proximo" /><PagoBadge estado="vencido" /><PagoBadge estado="en_revision" /><PagoBadge estado="pendiente" /></div>
          <div className="flex flex-wrap gap-2"><TicketBadge estado="Nuevo" /><TicketBadge estado="En progreso" /><TicketBadge estado="Esperando al cliente" /><TicketBadge estado="Resuelto" /><PrioridadBadge p="Urgente" /><PrioridadBadge p="Alta" /><PrioridadBadge p="Normal" /><PrioridadBadge p="Baja" /></div>
          <div className="flex flex-wrap gap-6"><Semaforo totalH={16} restanteH={12} /><Semaforo totalH={8} restanteH={2} /><Semaforo totalH={16} restanteH={-3} /><Semaforo totalH={16} restanteH={null} /></div>
        </Card>
      </Seccion>
      <Seccion titulo="Alertas">
        <div className="grid gap-3 md:grid-cols-2"><Alert variant="info" title="Información">Mensaje informativo.</Alert><Alert variant="success" title="Listo">Algo salió bien.</Alert><Alert variant="warning" title="Atención">Algo requiere tu revisión.</Alert><Alert variant="danger" title="Error">Algo salió mal.</Alert></div>
      </Seccion>
      <Seccion titulo="Tabla y progreso">
        <Table className="min-w-0"><THead><TR><TH>Concepto</TH><TH>Avance</TH><TH>Estado</TH></TR></THead><TBody><TR><TD>Diseño y prototipo</TD><TD className="w-48"><Progress value={70} label="70 %" /></TD><TD><HitoBadge estado="en_curso" /></TD></TR></TBody></Table>
      </Seccion>
    </div>
  );
}
