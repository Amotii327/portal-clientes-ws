'use client';
import * as React from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

export type Errores = Record<string, string>;

/**
 * Diálogo con formulario. Cada diálogo es su propio componente y se monta solo cuando se abre, así sus campos
 * empiezan limpios. `onEnviar` devuelve null si salió bien (se cierra), un texto (aviso general) o un objeto
 * con el error de cada campo.
 */
export function DialogoFormulario({ titulo, descripcion, boton, onCerrar, onEnviar, destructivo, children }: {
  titulo: string; descripcion?: string; boton: string; destructivo?: boolean;
  onCerrar: () => void; onEnviar: () => Promise<string | Errores | null>;
  children: (errores: Errores) => React.ReactNode;
}) {
  const [enviando, setEnviando] = React.useState(false);
  const [general, setGeneral] = React.useState('');
  const [errores, setErrores] = React.useState<Errores>({});
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setGeneral(''); setErrores({}); setEnviando(true);
    let r: string | Errores | null;
    try { r = await onEnviar(); } catch { r = 'No pudimos completar la acción. Intenta de nuevo y, si sigue, escríbenos.'; }
    setEnviando(false);
    if (r === null) { onCerrar(); return; }
    if (typeof r === 'string') setGeneral(r); else setErrores(r);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onCerrar(); }}>
      <DialogContent title={titulo} description={descripcion}>
        <form className="space-y-4" onSubmit={enviar} noValidate>
          {children(errores)}
          {general && <Alert variant="danger" title="No pudimos completarlo">{general}</Alert>}
          {Object.keys(errores).length > 0 && !general && <Alert variant="warning">Revisa los campos marcados.</Alert>}
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="ghost" disabled={enviando}>Cancelar</Button></DialogClose>
            <Button type="submit" variant={destructivo ? 'destructive' : 'default'} disabled={enviando}>{enviando ? 'Enviando…' : boton}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Motivo obligatorio de 5 a 500 letras (lo lee el cliente). Devuelve el texto limpio o null. */
export const motivoValido = (t: string): string | null => { const s = t.trim(); return s.length >= 5 && s.length <= 500 ? s : null; };
