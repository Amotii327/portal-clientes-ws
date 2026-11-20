'use client';
import * as React from 'react';
import { ArrowLeft, ExternalLink, FilePlus2, PlayCircle, RotateCcw, Save, Send, ShieldCheck } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { useCargar } from '@/lib/app/datos';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { editarBorradorRevision, nuevaVersionRevision, publicarRevision, reabrirRevision } from '@/lib/portal/acciones-revisiones-docs';
import { mensajeDeErrorRevDocs } from '@/lib/portal/errores-revisiones-docs';
import { Enlace } from '@/lib/router';
import { useStore } from '@/lib/store';
import type { Documento, RevisionVersion } from '@/lib/supabase/tipos-revisiones-docs';
import { leerDocumentos } from '../documentos/datos';
import { ETIQUETA_TIPO, EstadoBadge, esHttps, fechaCo, fechaHoraCo, useDescarga } from './comun';
import { leerDetalle, leerEvidencias } from './datos';

const HTTPS = /^https:\/\/\S+$/;

async function leerTodo(id: string) {
  const d = await leerDetalle(id);
  if (!d.revision) return { ...d, evidencias: {}, actasEmpresa: [] as Documento[] };
  const [e, docs] = await Promise.all([leerEvidencias(id), leerDocumentos(d.revision.empresa_id)]);
  return { ...d, evidencias: e, actasEmpresa: docs.documentos.filter((x) => x.categoria === 'acta') };
}

function Editor({ revision, version, actas, alCambiar }: { revision: { id: string; titulo: string }; version: RevisionVersion; actas: Documento[]; alCambiar: () => void }) {
  const { avisar } = useStore();
  const [f, setF] = React.useState({ titulo: revision.titulo, link: version.link_prueba ?? '', video: version.video_url ?? '', acta: version.acta_documento_id ?? '', resumen: version.resumen ?? '' });
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [confirmar, setConfirmar] = React.useState(false);
  const eLink = intento && f.link && !HTTPS.test(f.link) ? 'El enlace debe empezar por https:// y no tener espacios.' : undefined;
  const eVideo = intento && f.video && !HTTPS.test(f.video) ? 'El enlace debe empezar por https:// y no tener espacios.' : undefined;
  const guardar = async () => {
    setIntento(true); setError('');
    if (f.titulo.trim().length < 3 || (f.link && !HTTPS.test(f.link)) || (f.video && !HTTPS.test(f.video))) return false;
    const r = await editarBorradorRevision(crearClienteNavegador(), { p_revision_id: revision.id, p_titulo: f.titulo.trim(), p_link_prueba: f.link, p_video_url: f.video, p_acta_documento_id: f.acta || undefined, p_resumen: f.resumen });
    if (r.error) { setError(mensajeDeErrorRevDocs(r.error)); return false; }
    return true;
  };
  const soloGuardar = async () => { setOcupado(true); const ok = await guardar(); setOcupado(false); if (ok) { avisar('Borrador guardado.'); alCambiar(); } };
  const publicar = async () => {
    setOcupado(true);
    if (!(await guardar())) { setOcupado(false); setConfirmar(false); return; }
    const r = await publicarRevision(crearClienteNavegador(), revision.id);
    setOcupado(false); setConfirmar(false);
    if (r.error) { setError(mensajeDeErrorRevDocs(r.error)); return; }
    avisar('Publicada. El cliente ya la puede ver.'); alCambiar();
  };
  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="text-xl">Borrador de la versión {version.version}</CardTitle><p className="text-sm text-muted-foreground">El cliente no ve este borrador hasta que lo publiques.</p></CardHeader>
      <CardContent className="space-y-4">
        <Field label="Título" htmlFor="ed-titulo"><Input id="ed-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={160} /></Field>
        <Field label="Link de prueba" htmlFor="ed-link" hint="Debe empezar por https://" error={eLink}><Input id="ed-link" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} aria-invalid={!!eLink} /></Field>
        <Field label="Link del video" htmlFor="ed-video" hint="Opcional. Debe empezar por https://" error={eVideo}><Input id="ed-video" value={f.video} onChange={(e) => setF({ ...f, video: e.target.value })} aria-invalid={!!eVideo} /></Field>
        <Field label="Acta" htmlFor="ed-acta"><Select id="ed-acta" value={f.acta} onChange={(e) => setF({ ...f, acta: e.target.value })}><option value="">Sin acta</option>{actas.map((d) => <option key={d.id} value={d.id}>{d.titulo}</option>)}</Select></Field>
        <Field label="Resumen para el cliente" htmlFor="ed-resumen"><Textarea id="ed-resumen" value={f.resumen} onChange={(e) => setF({ ...f, resumen: e.target.value })} maxLength={2000} /></Field>
        {error && <Alert variant="danger" title="No pudimos completar la acción">{error}</Alert>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={soloGuardar} disabled={ocupado}><Save />Guardar borrador</Button><Button onClick={() => setConfirmar(true)} disabled={ocupado}><Send />Publicar al cliente</Button></div>
      </CardContent>
      <Dialog open={confirmar} onOpenChange={(o) => !o && !ocupado && setConfirmar(false)}>
        <DialogContent title="Publicar al cliente" description="El cliente verá esta versión, y el sprint o el diseño pasa a esperar su aprobación.">
          <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="ghost" disabled={ocupado}>Cancelar</Button></DialogClose><Button onClick={publicar} disabled={ocupado}>{ocupado ? 'Publicando…' : 'Sí, publicar'}</Button></div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Detalle de una revisión para el super admin: preparar, publicar, nueva versión, reabrir y ver la evidencia. */
export function RevisionAdminDetalle({ id }: { id: string }) {
  const { avisar } = useStore();
  const { estado, datos, recargar } = useCargar(() => leerTodo(id), [id]);
  const bajar = useDescarga();
  const [reabrir, setReabrir] = React.useState(false);
  const [motivo, setMotivo] = React.useState('');
  const [error, setError] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const volver = <Button variant="ghost" size="sm" asChild><Enlace to="/admin/aprobaciones"><ArrowLeft />Volver a la bandeja</Enlace></Button>;

  if (estado === 'cargando') return <EstadoCargando />;
  if (estado === 'error' || !datos) return <EstadoError onReintentar={() => recargar()} />;
  const { revision: r, versiones, aprobaciones, proyecto, evidencias, actasEmpresa, actas } = datos;
  if (!r) return <><PageHeader titulo="Revisión" acciones={volver} /><EstadoVacio titulo="No encontramos esa revisión" texto="Vuelve a la bandeja y ábrela de nuevo." /></>;
  const lista = [...versiones].sort((x, y) => y.version - x.version);
  const borrador = lista.find((v) => !v.publicada_en);
  const respuesta = (n: number) => aprobaciones.find((x) => x.version === n);
  const nuevaVersion = async () => {
    setOcupado(true); setError('');
    const x = await nuevaVersionRevision(crearClienteNavegador(), r.id);
    setOcupado(false);
    if (x.error) { setError(mensajeDeErrorRevDocs(x.error)); return; }
    avisar('Versión nueva en borrador: copia de la anterior. Edítala y publícala.'); recargar(true);
  };
  const confirmarReabrir = async () => {
    setOcupado(true); setError('');
    const x = await reabrirRevision(crearClienteNavegador(), r.id, motivo.trim());
    setOcupado(false);
    if (x.error) { setError(mensajeDeErrorRevDocs(x.error)); return; }
    setReabrir(false); setMotivo(''); avisar('Revisión reabierta. Queda en el historial del cliente.'); recargar(true);
  };

  return (
    <>
      <PageHeader eyebrow={`${ETIQUETA_TIPO[r.tipo]} · ${proyecto?.nombre ?? ''}`} titulo={r.titulo} acciones={volver}
        descripcion={<span className="inline-flex flex-wrap items-center gap-2"><EstadoBadge estado={r.estado} vistaWebsourcing /><span className="text-sm">Versión vigente: {r.version_actual}</span></span>} />
      <Alert className="mb-6" variant="info" title="Tú no apruebas por el cliente">La aprobación la da una persona del cliente con permiso. Aquí solo preparas, publicas y, si hace falta, reabres.</Alert>
      {error && <Alert className="mb-6" variant="danger" title="No pudimos completar la acción">{error}</Alert>}
      {borrador && <Editor key={borrador.id} revision={r} version={borrador} actas={actasEmpresa} alCambiar={() => recargar(true)} />}
      <div className="mb-6 flex flex-wrap gap-2">
        {!borrador && (r.estado === 'cambios_pedidos' || r.estado === 'reabierta') && <Button onClick={nuevaVersion} disabled={ocupado}><FilePlus2 />Preparar versión nueva</Button>}
        {r.estado === 'aprobada' && <Button variant="outline" onClick={() => setReabrir(true)}><RotateCcw />Reabrir</Button>}
        {r.estado === 'publicada' && <p className="text-sm text-muted-foreground">Publicada: esperando la respuesta del cliente.</p>}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-xl">Versiones y respuestas</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-0">
          <ul className="divide-y divide-border border-t border-border">
            {lista.map((v) => {
              const resp = respuesta(v.version); const ev = resp ? evidencias[resp.id] : undefined;
              const acta = v.acta_documento_id ? actas[v.acta_documento_id] : undefined;
              return (
                <li key={v.id} className="px-5 py-4 text-sm" data-version={v.version}>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Versión {v.version}</span>{!v.publicada_en ? <Badge variant="neutral">Borrador</Badge> : <span className="text-xs text-muted-foreground">Publicada el {fechaCo(v.publicada_en)}</span>}</div>
                  {v.resumen && <p className="mt-2 text-muted-foreground">{v.resumen}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {esHttps(v.link_prueba) && <Button variant="secondary" size="sm" asChild><a href={v.link_prueba} target="_blank" rel="noopener noreferrer"><ExternalLink />Link de prueba</a></Button>}
                    {esHttps(v.video_url) && <Button variant="secondary" size="sm" asChild><a href={v.video_url} target="_blank" rel="noopener noreferrer"><PlayCircle />Video</a></Button>}
                    {acta && <Button variant="secondary" size="sm" onClick={() => void bajar.documento(acta.versionId, 'documento', acta.versionId, 'documentos', acta.ruta, acta.nombre)}>Acta: {acta.titulo}</Button>}
                  </div>
                  {resp && (
                    <div className="mt-3 rounded-lg border border-border bg-surface-2 p-4" data-respuesta={resp.decision}>
                      <p className="font-medium">{resp.decision === 'apruebo' ? 'Aprobada' : 'Cambios pedidos'} · versión {resp.version}</p>
                      {resp.comentario && <p className="mt-1 text-muted-foreground">“{resp.comentario}”</p>}
                      {resp.captura_path && <Button className="mt-2" variant="outline" size="sm" onClick={() => void bajar.captura(resp.id, resp.captura_path!)}>Descargar captura</Button>}
                      <div className="mt-3 rounded-lg border border-dashed border-border p-3" data-evidencia={resp.id}>
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><ShieldCheck className="size-4" aria-hidden />Evidencia · solo Websourcing</p>
                        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
                          <dt className="text-muted-foreground">Quién</dt><dd>{resp.persona}</dd>
                          <dt className="text-muted-foreground">Cuándo</dt><dd>{fechaHoraCo(resp.creado_en)}</dd>
                          <dt className="text-muted-foreground">Dirección IP</dt><dd>{ev?.ip ?? 'No registrada'}</dd>
                          <dt className="text-muted-foreground">Navegador</dt><dd className="break-words">{ev?.user_agent ?? 'No registrado'}</dd>
                        </dl>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      <Dialog open={reabrir} onOpenChange={(o) => !o && !ocupado && setReabrir(false)}>
        <DialogContent title={`Reabrir: ${r.titulo}`} description="Solo Websourcing puede reabrir una revisión aprobada. El cliente verá el motivo en su historial.">
          <div className="space-y-4">
            <Field label="Motivo" htmlFor="re-motivo" hint="Mínimo 5 caracteres."><Textarea id="re-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} /></Field>
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="ghost" disabled={ocupado}>Cancelar</Button></DialogClose><Button disabled={motivo.trim().length < 5 || ocupado} onClick={confirmarReabrir}>Reabrir</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
