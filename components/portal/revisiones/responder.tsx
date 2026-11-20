'use client';
import * as React from 'react';
import { Paperclip } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { reservarYSubir, responderRevision } from '@/lib/portal/acciones-revisiones-docs';
import { codigoDeErrorRevDocs, mensajeDeErrorRevDocs } from '@/lib/portal/errores-revisiones-docs';
import { TAMANO_MAXIMO_CAPTURA, TIPOS_DE_CAPTURA, type Revision } from '@/lib/supabase/tipos-revisiones-docs';

export type Modo = 'apruebo' | 'pido_cambios';

/**
 * Confirmación de "Apruebo" o "Pido cambios". Dice claro que no se puede deshacer. "Pido cambios" exige comentario
 * (mínimo 5 caracteres) y acepta una captura opcional. La base decide si la persona puede responder.
 */
export function ResponderDialogo({ revision, modo, empresaId, alCerrar, alResponder }: {
  revision: Revision; modo: Modo | null; empresaId: string; alCerrar: () => void; alResponder: (m: Modo) => void;
}) {
  const [texto, setTexto] = React.useState('');
  const [captura, setCaptura] = React.useState<File | null>(null);
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [desactualizada, setDesactualizada] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  React.useEffect(() => { if (modo) { setTexto(''); setCaptura(null); setIntento(false); setError(''); setDesactualizada(false); } }, [modo]);

  const cambios = modo === 'pido_cambios';
  const errTexto = intento && cambios && texto.trim().length < 5 ? 'Cuéntanos qué hay que cambiar (mínimo 5 caracteres).' : undefined;
  const elegirCaptura = (f: File | null) => {
    setError('');
    if (!f) { setCaptura(null); return; }
    if (!TIPOS_DE_CAPTURA.includes(f.type)) { setCaptura(null); setError('La captura debe ser una imagen PNG, JPG o WEBP.'); return; }
    if (f.size > TAMANO_MAXIMO_CAPTURA) { setCaptura(null); setError('La captura es muy pesada: el máximo es 10 MB.'); return; }
    setCaptura(f);
  };
  const enviar = async () => {
    if (!modo) return;
    setIntento(true); setError('');
    if (cambios && texto.trim().length < 5) return;
    setEnviando(true);
    const c = crearClienteNavegador();
    let reserva: string | undefined;
    if (cambios && captura) {
      const s = await reservarYSubir(c, 'captura', empresaId, captura);
      if (s.error || !s.data) { setEnviando(false); setError(mensajeDeErrorRevDocs(s.error)); return; }
      reserva = s.data.reserva_id;
    }
    const r = await responderRevision(c, { p_revision_id: revision.id, p_version: revision.version_actual, p_decision: modo, p_comentario: texto.trim() || undefined, p_captura_reserva_id: reserva });
    setEnviando(false);
    if (r.error) {
      const cod = codigoDeErrorRevDocs(r.error);
      setDesactualizada(cod === 'version_desactualizada' || cod === 'revision_no_pendiente');
      setError(mensajeDeErrorRevDocs(r.error));
      return;
    }
    alResponder(modo);
  };

  return (
    <Dialog open={!!modo} onOpenChange={(o) => { if (!o && !enviando) alCerrar(); }}>
      {modo && (
        <DialogContent title={cambios ? `Pedir cambios: ${revision.titulo}` : `Aprobar: ${revision.titulo}`}
          description={cambios ? 'Cuéntanos qué hay que cambiar. Websourcing prepara una versión nueva y te avisa.' : `Vas a aprobar la versión ${revision.version_actual}.`}>
          <div className="space-y-4">
            <Alert variant="warning" title="Esta respuesta no se puede deshacer">
              Quedará registrado quién respondió, cuándo y sobre qué versión. Desde el portal no hay botón para deshacerla; solo Websourcing puede reabrir una revisión.
            </Alert>
            <Field label={cambios ? 'Qué hay que cambiar' : 'Comentario (opcional)'} htmlFor="resp-texto" error={errTexto}>
              <Textarea id="resp-texto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} aria-invalid={!!errTexto}
                placeholder={cambios ? 'Por ejemplo: el botón de nuevo pedido debe verse más grande.' : 'Todo bien, gracias.'} />
            </Field>
            {cambios && (
              <Field label="Captura de pantalla (opcional)" htmlFor="resp-captura" hint="Imagen PNG, JPG o WEBP, máximo 10 MB.">
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded border border-dashed border-border bg-surface-2 px-3 text-sm text-muted-foreground hover:text-foreground">
                  <Paperclip className="size-4 shrink-0" aria-hidden /><span className="truncate">{captura?.name ?? 'Elegir imagen'}</span>
                  <input id="resp-captura" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => elegirCaptura(e.target.files?.[0] ?? null)} />
                </label>
              </Field>
            )}
            {error && <Alert variant="danger" title="No pudimos enviar tu respuesta">{error}{desactualizada && <> <button type="button" className="underline" onClick={() => window.location.reload()}>Recargar la página</button>.</>}</Alert>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <DialogClose asChild><Button variant="ghost" disabled={enviando}>Cancelar</Button></DialogClose>
              <Button onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : cambios ? 'Enviar cambios' : 'Confirmar aprobación'}</Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
