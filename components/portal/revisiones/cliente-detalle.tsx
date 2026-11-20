'use client';
import * as React from 'react';
import { ArrowLeft, CheckCircle2, Download, ExternalLink, FileText, MessageSquareWarning, PlayCircle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { useCargar } from '@/lib/app/datos';
import { Enlace } from '@/lib/router';
import { useStore } from '@/lib/store';
import type { Aprobacion, RevisionVersion } from '@/lib/supabase/tipos-revisiones-docs';
import { ETIQUETA_TIPO, EstadoBadge, esHttps, fechaCo, fechaHoraCo, useAcceso, useDescarga } from './comun';
import { leerDetalle } from './datos';
import { ResponderDialogo, type Modo } from './responder';

type Datos = Awaited<ReturnType<typeof leerDetalle>>;

function Version({ v, resp, actual, actas, bajar }: { v: RevisionVersion; resp?: Aprobacion; actual: boolean; actas: Datos['actas']; bajar: ReturnType<typeof useDescarga> }) {
  const acta = v.acta_documento_id ? actas[v.acta_documento_id] : undefined;
  return (
    <li className="px-5 py-4 text-sm" data-version={v.version}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Versión {v.version}</span>
        {actual && <Badge variant="primary">Vigente</Badge>}
        <span className="text-xs text-muted-foreground">Publicada el {fechaCo(v.publicada_en)}</span>
      </div>
      {v.resumen && <p className="mt-2 text-muted-foreground">{v.resumen}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {esHttps(v.link_prueba) && <Button variant="secondary" size="sm" asChild><a href={v.link_prueba} target="_blank" rel="noopener noreferrer"><ExternalLink />Abrir link de prueba</a></Button>}
        {esHttps(v.video_url) && <Button variant="secondary" size="sm" asChild><a href={v.video_url} target="_blank" rel="noopener noreferrer"><PlayCircle />Ver video</a></Button>}
        {acta && <Button variant="secondary" size="sm" disabled={bajar.ocupado === acta.versionId} onClick={() => void bajar.documento(acta.versionId, 'documento', acta.versionId, 'documentos', acta.ruta, acta.nombre)}><FileText />Descargar acta</Button>}
      </div>
      {resp && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-4" data-respuesta={resp.decision}>
          <p className="font-medium">{resp.decision === 'apruebo' ? 'Aprobada' : 'Cambios pedidos'} por {resp.persona} · {fechaHoraCo(resp.creado_en)} · versión {resp.version}</p>
          {resp.comentario && <p className="mt-1 text-muted-foreground">“{resp.comentario}”</p>}
          {resp.captura_path && <Button className="mt-2" variant="outline" size="sm" disabled={bajar.ocupado === resp.id} onClick={() => void bajar.captura(resp.id, resp.captura_path!)}><Download />Descargar captura</Button>}
        </div>
      )}
    </li>
  );
}

/** Detalle de una revisión para el cliente: versiones, respuestas y los botones "Apruebo" y "Pido cambios". */
export function RevisionClienteDetalle({ id }: { id: string }) {
  const a = useAcceso();
  const { avisar } = useStore();
  const { estado, datos, recargar } = useCargar(() => leerDetalle(id), [id]);
  const [modo, setModo] = React.useState<Modo | null>(null);
  const bajar = useDescarga();
  const volver = <Button variant="ghost" size="sm" asChild><Enlace to="/cliente/revisiones"><ArrowLeft />Volver a revisiones</Enlace></Button>;

  if (estado === 'cargando') return <EstadoCargando />;
  if (estado === 'error' || !datos) return <EstadoError onReintentar={() => recargar()} />;
  const { revision: r, versiones, aprobaciones, proyecto, actas, reapertura } = datos;
  if (!r) return <><PageHeader titulo="Revisión" acciones={volver} /><EstadoVacio titulo="No encontramos esa revisión" texto="Puede que ya no exista o que no sea de tu empresa. Vuelve a la lista de revisiones." /></>;
  const lista = [...versiones].sort((x, y) => y.version - x.version);
  const respuesta = (n: number) => aprobaciones.find((x) => x.version === n);
  const responder = (m: Modo) => {
    setModo(null);
    avisar(m === 'apruebo' ? 'Aprobación registrada. Quedó guardado quién, cuándo y qué versión.' : 'Enviamos tus cambios al equipo. La revisión queda abierta.');
    recargar(true);
  };

  return (
    <>
      <PageHeader eyebrow={`${ETIQUETA_TIPO[r.tipo]} · ${proyecto?.nombre ?? ''}`} titulo={r.titulo} acciones={volver} descripcion={<span className="inline-flex flex-wrap items-center gap-2"><EstadoBadge estado={r.estado} /><span className="text-sm">Versión vigente: {r.version_actual}</span></span>} />
      {a.soloLectura && <Alert className="mb-6" variant="info" title='Modo "ver como": solo lectura'>Ves lo mismo que ve el cliente. Desde aquí no se aprueba nada.</Alert>}
      {r.estado === 'reabierta' && (
        <Alert className="mb-6" variant="info" title="Websourcing reabrió esta revisión">{reapertura ? <>Motivo: “{reapertura}”. </> : null}Preparamos una versión nueva y te avisaremos cuando esté lista.</Alert>
      )}
      <Card>
        <CardHeader><CardTitle className="text-xl">Versiones</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-0">
          <ul className="divide-y divide-border border-t border-border">
            {lista.map((v) => <Version key={v.id} v={v} resp={respuesta(v.version)} actual={v.version === r.version_actual} actas={actas} bajar={bajar} />)}
          </ul>
        </CardContent>
        {r.estado === 'publicada' && (
          <CardFooter>
            {a.puedeAprobar ? (
              <>
                <Button onClick={() => setModo('apruebo')}><CheckCircle2 />Apruebo</Button>
                <Button variant="outline" onClick={() => setModo('pido_cambios')}><MessageSquareWarning />Pido cambios</Button>
                <span className="text-xs text-muted-foreground sm:ml-auto">Una aprobación no se puede deshacer desde el portal.</span>
              </>
            ) : a.soloLectura ? (
              <p className="text-sm text-muted-foreground">Modo "ver como": solo lectura.</p>
            ) : (
              <p className="text-sm text-muted-foreground">No tienes permiso para aprobar. Pídeselo a tu administrador en "Mi equipo".</p>
            )}
          </CardFooter>
        )}
      </Card>
      <ResponderDialogo revision={r} modo={modo} empresaId={a.empresaId} alCerrar={() => setModo(null)} alResponder={responder} />
    </>
  );
}
