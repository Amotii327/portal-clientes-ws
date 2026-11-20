'use client';
import * as React from 'react';
import { CheckCircle2, ExternalLink, FileText, MessageSquareWarning, PlayCircle, Paperclip } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { PageHeader } from '@/components/ds/page';
import { RevisionBadge } from '@/components/ds/badges';
import { Pantalla } from '@/components/ds/states';
import { useStore } from '@/lib/store';
import type { Revision } from '@/lib/data';
import { fecha, fechaHora } from '@/lib/utils';

export function Revisiones() {
  const { empresa, can, mutar, avisar, usuario } = useStore();
  const [dlg, setDlg] = React.useState<{ rev: Revision; modo: 'aprobar' | 'cambios' } | null>(null);
  const [texto, setTexto] = React.useState('');
  const [captura, setCaptura] = React.useState('');
  const [intento, setIntento] = React.useState(false);
  const lista = empresa.revisiones.filter((r) => r.estado !== 'borrador').sort((a, b) => (a.estado === 'publicada' ? -1 : 0) - (b.estado === 'publicada' ? -1 : 0));
  const cerrar = () => { setDlg(null); setTexto(''); setCaptura(''); setIntento(false); };

  const confirmar = () => {
    if (!dlg) return;
    if (dlg.modo === 'cambios' && texto.trim().length < 5) { setIntento(true); return; }
    const { rev, modo } = dlg;
    mutar(empresa.id, (e) => {
      const r = e.revisiones.find((x) => x.id === rev.id)!;
      r.estado = modo === 'aprobar' ? 'aprobada' : 'cambios_pedidos';
      r.decision = { quien: usuario?.cargo ?? 'Administrador', cuando: '2026-11-20 10:30', comentario: texto || 'Sin comentario', version: r.version };
      const p = e.proyectos.find((x) => x.id === r.proyectoId)!;
      if (modo === 'aprobar') {
        if (r.tipo === 'Diseño') { const hito = p.hitos.find((x) => x.n === 5)!; hito.estado = 'terminado'; hito.real = '2026-11-20'; }
        else { p.sprintsHechos += 1; const h6 = p.hitos.find((x) => x.n === 6)!; if (h6.sprint && h6.sprint.actual < h6.sprint.total) h6.sprint.actual += 1; p.sprintActual = h6.sprint?.actual; }
      }
      p.historial.unshift({ cuando: '2026-11-20', texto: modo === 'aprobar' ? `${r.titulo} aprobado por ${usuario?.cargo} (versión ${r.version}).` : `Se pidieron cambios en ${r.titulo}.` });
    }, modo === 'aprobar' ? `Aprobó "${rev.titulo}" (v${rev.version})` : `Pidió cambios en "${rev.titulo}"`);
    avisar(modo === 'aprobar' ? 'Aprobación registrada. Quedó guardado quién, cuándo y qué versión.' : 'Enviamos tus cambios al equipo. La revisión queda abierta.');
    cerrar();
  };

  return (
    <>
      <PageHeader titulo="Revisiones" descripcion="Aquí revisas cada sprint y el diseño con su link de prueba, su video y su acta, y nos dices si apruebas o si quieres cambios." />
      <Pantalla vacio={{ titulo: 'No hay revisiones todavía', texto: 'Cuando publiquemos un sprint o un diseño para tu revisión, aparecerá aquí y te avisaremos por correo.' }}>
        {!can.aprobar && lista.some((r) => r.estado === 'publicada') && (
          <Alert className="mb-6" variant="info" title="Puedes mirar, pero no aprobar">Tu administrador decide quién aprueba. Si necesitas hacerlo, pídele el permiso en "Mi equipo".</Alert>
        )}
        <div className="space-y-5">
          {lista.map((r) => {
            const proyecto = empresa.proyectos.find((p) => p.id === r.proyectoId);
            return (
              <Card key={r.id} className={r.estado === 'publicada' ? 'border-warning/60' : ''}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-xs text-muted-foreground">{proyecto?.nombre} · versión {r.version}{r.publicada ? ` · publicada el ${fecha(r.publicada)}` : ''}</p><CardTitle className="mt-1 text-xl">{r.titulo}</CardTitle></div>
                    <RevisionBadge estado={r.estado} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{r.resumen}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" asChild><a href="#/cliente/revisiones" onClick={(e) => e.preventDefault()}><ExternalLink />Abrir link de prueba</a></Button>
                    {r.video && <Button variant="secondary" size="sm"><PlayCircle />{r.video}</Button>}
                    <Button variant="secondary" size="sm"><FileText />{r.acta}</Button>
                  </div>
                  {r.decision && (
                    <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4 text-sm">
                      <p className="font-medium">{r.estado === 'aprobada' ? 'Aprobada' : 'Cambios pedidos'} por {r.decision.quien} · {fechaHora(r.decision.cuando)} · versión {r.decision.version}</p>
                      <p className="mt-1 text-muted-foreground">“{r.decision.comentario}”</p>
                    </div>
                  )}
                </CardContent>
                {r.estado === 'publicada' && (
                  <CardFooter>
                    {can.aprobar && !can.soloLectura ? (
                      <>
                        <Button onClick={() => setDlg({ rev: r, modo: 'aprobar' })}><CheckCircle2 />Apruebo</Button>
                        <Button variant="outline" onClick={() => setDlg({ rev: r, modo: 'cambios' })}><MessageSquareWarning />Pido cambios</Button>
                        <span className="text-xs text-muted-foreground sm:ml-auto">Una aprobación no se puede deshacer desde el portal.</span>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{can.soloLectura ? 'Modo "ver como": solo lectura.' : 'No tienes permiso para aprobar. Lo hace tu administrador.'}</p>
                    )}
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      </Pantalla>
      <Dialog open={!!dlg} onOpenChange={(o) => !o && cerrar()}>
        {dlg && (
          <DialogContent title={dlg.modo === 'aprobar' ? `Aprobar: ${dlg.rev.titulo}` : `Pedir cambios: ${dlg.rev.titulo}`} description={dlg.modo === 'aprobar' ? `Quedará registrado que ${usuario?.cargo ?? 'tú'} aprobó la versión ${dlg.rev.version}, con fecha y hora.` : 'Cuéntanos qué hay que cambiar. La revisión queda abierta para Websourcing.'}>
            <div className="space-y-4">
              <Field label={dlg.modo === 'aprobar' ? 'Comentario (opcional)' : 'Qué hay que cambiar'} htmlFor="rev-texto" error={intento && dlg.modo === 'cambios' && texto.trim().length < 5 ? 'Cuéntanos qué cambiar (mínimo unas palabras).' : undefined}>
                <Textarea id="rev-texto" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={dlg.modo === 'aprobar' ? 'Todo bien, gracias.' : 'Por ejemplo: el botón de nuevo pedido debe verse más grande.'} />
              </Field>
              {dlg.modo === 'cambios' && (
                <Field label="Captura de pantalla (opcional)" htmlFor="rev-captura" hint="Imagen o PDF, máximo 50 MB.">
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded border border-dashed border-border bg-surface-2 px-3 text-sm text-muted-foreground hover:text-foreground">
                    <Paperclip className="size-4" />{captura || 'Elegir archivo'}
                    <input id="rev-captura" type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => setCaptura(e.target.files?.[0]?.name ?? '')} />
                  </label>
                </Field>
              )}
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                <Button onClick={confirmar}>{dlg.modo === 'aprobar' ? 'Confirmar aprobación' : 'Enviar cambios'}</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
