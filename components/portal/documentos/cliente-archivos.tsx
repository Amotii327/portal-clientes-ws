'use client';
import * as React from 'react';
import { Download, FileText, Trash2, UploadCloud } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { PageHeader } from '@/components/ds/page';
import { EspacioDeMiEmpresa } from '../espacio/barra';
import { EstadoCargando, EstadoError } from '@/components/ds/states';
import { useCargar } from '@/lib/app/datos';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { borrarArchivoCliente, confirmarArchivoCliente, reservarYSubir } from '@/lib/portal/acciones-revisiones-docs';
import { mensajeDeErrorRevDocs } from '@/lib/portal/errores-revisiones-docs';
import { useStore } from '@/lib/store';
import { TAMANO_MAXIMO_ARCHIVO, TIPOS_PERMITIDOS, type ArchivoCliente } from '@/lib/supabase/tipos-revisiones-docs';
import { fechaCo, tamanoLegible, useAcceso, useDescarga } from '../revisiones/comun';
import { leerArchivos } from './datos';
import { NavDocumentos } from './cliente-documentos';

/** Valida en pantalla lo que la base vuelve a validar (tipo y tamaño). */
export function validarArchivo(f: File): string | null {
  if (f.size === 0) return 'El archivo está vacío.';
  if (!TIPOS_PERMITIDOS.includes(f.type)) return 'Ese tipo de archivo no está permitido. Usa imágenes, PDF, video, audio, Office (sin macros), CSV o ZIP.';
  if (f.size > TAMANO_MAXIMO_ARCHIVO) return 'El archivo es muy pesado: el máximo es 50 MB.';
  return null;
}

/** "Archivos de la empresa": el cliente sube lo que Websourcing necesita, lo ve y lo borra mientras no esté "recibido". */
export function ArchivosCliente() {
  const a = useAcceso();
  const { avisar } = useStore();
  const { estado, datos, recargar } = useCargar(() => leerArchivos(), []);
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [nota, setNota] = React.useState('');
  const [error, setError] = React.useState('');
  const [subiendo, setSubiendo] = React.useState(false);
  const [aBorrar, setABorrar] = React.useState<ArchivoCliente | null>(null);
  const [borrando, setBorrando] = React.useState(false);
  const [errBorrar, setErrBorrar] = React.useState('');
  const bajar = useDescarga();
  const entrada = React.useRef<HTMLInputElement>(null);

  const elegir = (f: File | null) => { setError(''); if (!f) { setArchivo(null); return; } const e = validarArchivo(f); if (e) { setArchivo(null); setError(e); if (entrada.current) entrada.current.value = ''; return; } setArchivo(f); };
  const subir = async () => {
    if (!archivo) return;
    setSubiendo(true); setError('');
    const c = crearClienteNavegador();
    const s = await reservarYSubir(c, 'archivo_cliente', a.empresaId, archivo);
    if (s.error || !s.data) { setSubiendo(false); setError(mensajeDeErrorRevDocs(s.error)); return; }
    const r = await confirmarArchivoCliente(c, { p_reserva_id: s.data.reserva_id, p_nota: nota.trim() || undefined });
    setSubiendo(false);
    if (r.error) { setError(mensajeDeErrorRevDocs(r.error)); return; }
    avisar('Archivo guardado. Websourcing recibió un aviso.');
    setArchivo(null); setNota(''); if (entrada.current) entrada.current.value = '';
    recargar(true);
  };
  const borrar = async () => {
    if (!aBorrar) return;
    setBorrando(true); setErrBorrar('');
    const r = await borrarArchivoCliente(crearClienteNavegador(), aBorrar.id);
    setBorrando(false);
    if (r.error) { setErrBorrar(mensajeDeErrorRevDocs(r.error)); recargar(true); return; }
    setABorrar(null); avisar('Archivo borrado.'); recargar(true);
  };

  return (
    <>
      <PageHeader titulo="Archivos de la empresa" descripcion="Sube aquí lo que necesitamos para tu proyecto: logo, textos, fotos, bases de datos. Solo lo ven tu empresa y Websourcing." />
      <EspacioDeMiEmpresa />
      <NavDocumentos activa="archivos" />
      <Alert variant="info" className="mb-4" title="Accesos y claves">Este portal no guarda claves ni contraseñas. Si necesitamos accesos, te indicaremos cómo entregarlos de forma segura.</Alert>
      {a.soloLectura && <Alert className="mb-4" variant="info" title='Modo "ver como": solo lectura'>Desde aquí no se sube ni se borra nada.</Alert>}
      {!a.soloLectura && (a.puedeSubir ? (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Subir un archivo</CardTitle><CardDescription>Máximo 50 MB. Imágenes, PDF, video, audio, documentos de Office, hojas de cálculo, CSV y ZIP.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Archivo" htmlFor="ar-archivo">
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded border border-dashed border-border bg-surface-2 px-3 text-sm text-muted-foreground hover:text-foreground"><UploadCloud className="size-4 shrink-0" aria-hidden /><span className="truncate">{archivo?.name ?? 'Elegir archivo'}</span>
                  <input ref={entrada} id="ar-archivo" type="file" className="sr-only" onChange={(e) => elegir(e.target.files?.[0] ?? null)} /></label>
              </Field>
              <Field label="Nota (opcional)" htmlFor="ar-nota" hint="No escribas claves aquí."><Input id="ar-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ejemplo: logo en fondo transparente" /></Field>
            </div>
            {error && <Alert variant="danger" title="No pudimos subir el archivo">{error}</Alert>}
            <div className="flex justify-end"><Button onClick={subir} disabled={!archivo || subiendo}><UploadCloud />{subiendo ? 'Subiendo…' : 'Subir archivo'}</Button></div>
          </CardContent>
        </Card>
      ) : (
        <Alert variant="warning" className="mb-4" title="No tienes permiso para subir archivos">Pídele al administrador de tu empresa el permiso "subir archivos". Puedes ver lo que ya se subió.</Alert>
      ))}
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => recargar()} />}
      {estado === 'ok' && datos && (
        <Card>
          {datos.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Todavía no se han subido archivos.</p> : (
            <ul className="divide-y divide-border">
              {datos.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 p-4" data-archivo={f.id}>
                  <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{f.nombre_original}</p>
                    <p className="break-words text-xs text-muted-foreground">{f.subido_por_nombre} · {fechaCo(f.creado_en)} · {tamanoLegible(f.tamano_bytes)}{f.nota ? ` · ${f.nota}` : ''}</p>
                  </div>
                  <Badge variant={f.estado === 'recibido' ? 'success' : 'info'}>{f.estado === 'recibido' ? 'Recibido por Websourcing' : 'Nuevo'}</Badge>
                  <Button size="sm" variant="ghost" disabled={bajar.ocupado === f.id} onClick={() => void bajar.documento(f.id, 'archivo', f.id, 'archivos-empresa', f.storage_path, f.nombre_original)} aria-label={`Descargar ${f.nombre_original}`}><Download /></Button>
                  {f.estado === 'nuevo' && f.subido_por === a.userId && !a.soloLectura && <Button size="sm" variant="ghost" onClick={() => { setErrBorrar(''); setABorrar(f); }} aria-label={`Borrar ${f.nombre_original}`}><Trash2 /></Button>}
                  {f.estado === 'recibido' && <span className="text-xs text-muted-foreground">Fijo</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Puedes borrar un archivo que subiste mientras Websourcing no lo marque como "recibido". Después queda fijo.</p>
      <Dialog open={!!aBorrar} onOpenChange={(o) => !o && !borrando && setABorrar(null)}>
        {aBorrar && (
          <DialogContent title="Borrar archivo" description={`Vas a borrar "${aBorrar.nombre_original}". Websourcing conserva el rastro de que se subió y se borró.`}>
            {errBorrar && <Alert variant="danger" className="mb-4" title="No pudimos borrarlo">{errBorrar}</Alert>}
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="ghost" disabled={borrando}>Cancelar</Button></DialogClose><Button variant="destructive" onClick={borrar} disabled={borrando}>{borrando ? 'Borrando…' : 'Sí, borrar'}</Button></div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
