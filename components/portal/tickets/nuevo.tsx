'use client';
import * as React from 'react';
import { ArrowLeft, Bug, FilePlus2, HelpCircle, KeyRound, Send } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando } from '@/components/ds/states';
import { Enlace, ir } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { crearTicket } from '@/lib/portal/acciones-tickets';
import { useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { PrioridadTicket, TipoTicket } from '@/lib/supabase/tipos-tickets-mant';
import { CampoLinkVideo, SelectorAdjuntos, guardarLinkVideo, subirAdjuntos } from './adjuntos';
import { AVISO_ACCESO, MAX_ADJUNTOS, ejecutar, enlaceValido } from './comunes';
import { leerProyectos } from './lecturas';

const TIPOS: { id: TipoTicket; titulo: string; icono: React.ReactNode; texto: string }[] = [
  { id: 'error', titulo: 'Error', icono: <Bug className="size-5" />, texto: 'Algo no funciona como debe.' },
  { id: 'solicitud_cambio', titulo: 'Solicitud de cambio', icono: <FilePlus2 className="size-5" />, texto: 'Quieres algo nuevo o distinto.' },
  { id: 'pregunta', titulo: 'Pregunta', icono: <HelpCircle className="size-5" />, texto: 'Tienes una duda.' },
  { id: 'acceso', titulo: 'Acceso', icono: <KeyRound className="size-5" />, texto: 'Necesitas un usuario o permiso.' },
];

export function TicketNuevoReal() {
  const { avisar } = useStore();
  const { estado, datos: proyectos } = useCargar(leerProyectos, []);
  const [tipo, setTipo] = React.useState<TipoTicket>('error');
  const [pri, setPri] = React.useState<PrioridadTicket>('normal');
  const [titulo, setTitulo] = React.useState('');
  const [texto, setTexto] = React.useState('');
  const [proy, setProy] = React.useState('');
  const [archivos, setArchivos] = React.useState<File[]>([]);
  const [link, setLink] = React.useState('');
  const [intento, setIntento] = React.useState(false);
  const [enviando, setEnviando] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setIntento(true); setError(null);
    if (titulo.trim().length < 3 || texto.trim().length < 10) return;
    if (link.trim() !== '' && !enlaceValido(link.trim())) return;
    setEnviando('Creando tu ticket…');
    const r = await ejecutar('crear_ticket', () => crearTicket(crearClienteNavegador(), { p_tipo: tipo, p_titulo: titulo.trim(), p_detalle: texto.trim(), p_prioridad: pri, p_proyecto_id: proy || null }));
    if (!r.ok || !r.data) { setEnviando(null); setError(r.ok ? 'No pudimos crear el ticket. Intenta de nuevo.' : r.mensaje); return; }
    let fallidos: string[] = [];
    if (archivos.length) fallidos = await subirAdjuntos(r.data.ticket_id, archivos, null, (n, t) => setEnviando(`Subiendo archivo ${n} de ${t}…`));
    if (link.trim()) {
      setEnviando('Guardando el link de video…');
      const l = await guardarLinkVideo(r.data.ticket_id, link, null);
      if (!l.ok) fallidos.push('el link de video');
    }
    avisar(fallidos.length
      ? `Ticket creado, pero no pudimos guardar: ${fallidos.join(', ')}. Puedes agregarlo de nuevo desde el ticket.`
      : r.data.fuera_de_plan ? 'Ticket creado. Antes de trabajarlo, el dueño de Websourcing decide si tiene costo.' : 'Ticket creado. Te responderemos dentro del tiempo pactado.');
    ir(`/cliente/tickets/${r.data.ticket_id}`);
  };

  return (
    <>
      <PageHeader titulo="Nuevo ticket" descripcion="Cuéntanos qué necesitas. Mientras más claro, más rápido te respondemos." acciones={<Button variant="ghost" asChild><Enlace to="/cliente/tickets"><ArrowLeft />Volver</Enlace></Button>} />
      {estado === 'cargando' ? <EstadoCargando /> : (
        <form onSubmit={(e) => void enviar(e)} className="max-w-3xl space-y-6" noValidate>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">¿Qué tipo de ticket es?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {TIPOS.map((t) => (
                <label key={t.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary', tipo === t.id ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:bg-surface-2')}>
                  <input type="radio" name="tipo" className="sr-only" checked={tipo === t.id} onChange={() => setTipo(t.id)} />
                  <span className={tipo === t.id ? 'text-primary-text' : 'text-muted-foreground'}>{t.icono}</span>
                  <span><span className="block font-medium">{t.titulo}</span><span className="text-sm text-muted-foreground">{t.texto}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {tipo === 'acceso' && <Alert variant="warning" title="Cuidado con las claves">{AVISO_ACCESO}</Alert>}
          {tipo === 'solicitud_cambio' && <Alert variant="info" title="Las solicitudes de cambio se cotizan">No se trabajan hasta que Websourcing las revise y, si tienen costo, tu administrador las acepte.</Alert>}
          {tipo === 'error' && <Alert variant="info">Si tu garantía o tu plan de mantenimiento no cubren este error, el equipo te dirá si tiene costo antes de empezar.</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            {proyectos && proyectos.length > 0 && (
              <Field label="Proyecto (opcional)" htmlFor="t-proy"><Select id="t-proy" value={proy} onChange={(e) => setProy(e.target.value)}><option value="">Sin proyecto</option>{proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>
            )}
            <Field label="Prioridad" htmlFor="t-pri" hint="Tú propones; Websourcing la confirma al clasificar.">
              <Select id="t-pri" value={pri} onChange={(e) => setPri(e.target.value as PrioridadTicket)}>
                <option value="urgente">Urgente · la app está caída o no se puede vender o cobrar</option>
                <option value="alta">Alta · algo importante falla, pero se puede seguir</option>
                <option value="normal">Normal · errores menores y preguntas</option>
                <option value="baja">Baja · ideas y mejoras</option>
              </Select>
            </Field>
          </div>
          <Field label="Título" htmlFor="t-titulo" error={intento && titulo.trim().length < 3 ? 'Escribe un título corto.' : undefined}><Input id="t-titulo" maxLength={160} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ejemplo: no me llega el correo de confirmación" /></Field>
          <Field label="Detalle" htmlFor="t-texto" error={intento && texto.trim().length < 10 ? 'Cuéntanos un poco más (qué pasó, dónde y cuándo).' : undefined}><Textarea id="t-texto" rows={5} maxLength={10000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué pasó? ¿Qué esperabas que pasara?" /></Field>
          <Field label="Adjuntos (opcional)" htmlFor="t-adj" hint="Pantallazo, video o audio. Máximo 50 MB por archivo (videos: 20 MB).">
            <SelectorAdjuntos id="t-adj" archivos={archivos} onCambio={setArchivos} cupo={MAX_ADJUNTOS} />
          </Field>
          <CampoLinkVideo id="t-link" valor={link} onCambio={setLink} intento={intento} />
          {error && <Alert variant="danger" title="No pudimos crear el ticket">{error}</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" disabled={!!enviando}><Send />{enviando ?? 'Crear ticket'}</Button>
            <Button type="button" variant="ghost" size="lg" asChild><Enlace to="/cliente/tickets">Cancelar</Enlace></Button>
          </div>
        </form>
      )}
    </>
  );
}
