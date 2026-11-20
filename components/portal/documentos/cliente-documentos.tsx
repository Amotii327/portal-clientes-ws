'use client';
import * as React from 'react';
import { Download, FileText, FolderUp, History } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { useCargar } from '@/lib/app/datos';
import { Enlace } from '@/lib/router';
import { cn } from '@/lib/utils';
import type { Documento } from '@/lib/supabase/tipos-revisiones-docs';
import { fechaCo, tamanoLegible, useAcceso, useDescarga } from '../revisiones/comun';
import { VisibilidadBadge } from './comun';
import { CATEGORIAS, etiquetaCategoria, leerDocumentos } from './datos';

export function NavDocumentos({ activa }: { activa: 'documentos' | 'archivos' }) {
  const cls = (a: boolean) => cn('inline-flex h-10 items-center rounded px-4 text-sm font-medium transition-colors', a ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground');
  return (
    <nav aria-label="Documentos y archivos" className="mb-6 inline-flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
      <Enlace to="/cliente/documentos" className={cls(activa === 'documentos')} aria-current={activa === 'documentos' ? 'page' : undefined}>Documentos</Enlace>
      <Enlace to="/cliente/archivos" className={cls(activa === 'archivos')} aria-current={activa === 'archivos' ? 'page' : undefined}>Archivos de la empresa</Enlace>
    </nav>
  );
}

/** Documentos que Websourcing comparte con la persona (la base ya filtra por visibilidad), con versiones y descarga. */
export function DocumentosCliente() {
  const a = useAcceso();
  const { estado, datos, recargar } = useCargar(() => leerDocumentos(), []);
  const [cat, setCat] = React.useState<'todos' | Documento['categoria']>('todos');
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const bajar = useDescarga();

  return (
    <>
      <PageHeader titulo="Documentos" descripcion="Contrato, propuesta, requerimientos, actas, manuales y entregables, con todas sus versiones." />
      <NavDocumentos activa="documentos" />
      {a.soloLectura && <Alert className="mb-6" variant="info" title='Modo "ver como": solo lectura'>Ves exactamente los documentos que ve esta persona.</Alert>}
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => recargar()} />}
      {estado === 'ok' && datos && (datos.documentos.length === 0 ? (
        <EstadoVacio titulo="Aún no hay documentos" texto="Cuando Websourcing publique el contrato, las actas o los manuales, los encontrarás aquí." />
      ) : (
        <>
          <div className="scroll-x relative mb-5 flex gap-2 pb-1" role="group" aria-label="Categorías">
            {[{ id: 'todos' as const, etiqueta: 'Todos' }, ...CATEGORIAS].map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id} className={cn('h-9 shrink-0 rounded-full border px-4 text-sm transition-colors', cat === c.id ? 'border-primary bg-primary font-semibold text-primary-foreground' : 'border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground')}>{c.etiqueta}</button>
            ))}
          </div>
          {(() => {
            const docs = datos.documentos.filter((d) => cat === 'todos' || d.categoria === cat);
            if (docs.length === 0) return <Card className="p-8 text-center text-muted-foreground">No hay documentos en esta categoría.</Card>;
            return (
              <ul className="space-y-3">
                {docs.map((d) => {
                  const vs = datos.versiones.filter((v) => v.documento_id === d.id).sort((x, y) => y.version - x.version);
                  const ult = vs[0]; const abierta = abierto === d.id;
                  return (
                    <li key={d.id} data-documento={d.id}>
                      <Card>
                        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
                          <FileText className="size-6 shrink-0 text-primary-text" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-medium">{d.titulo}</p>
                            <p className="text-xs text-muted-foreground">{etiquetaCategoria(d.categoria)} · v{d.version_actual}{ult ? ` · ${fechaCo(ult.creado_en)} · ${tamanoLegible(ult.tamano_bytes)}` : ''}</p>
                          </div>
                          {a.esAdmin && <VisibilidadBadge v={d.visibilidad} />}
                          <div className="flex gap-2">
                            {vs.length > 1 && <Button size="sm" variant="outline" onClick={() => setAbierto(abierta ? null : d.id)} aria-expanded={abierta}><History />Versiones ({vs.length})</Button>}
                            {ult && <Button size="sm" disabled={bajar.ocupado === ult.id} onClick={() => void bajar.documento(ult.id, 'documento', ult.id, 'documentos', ult.storage_path, ult.nombre_original)} aria-label={`Descargar ${d.titulo}`}><Download />Descargar</Button>}
                          </div>
                        </div>
                        {abierta && (
                          <ul className="divide-y divide-border border-t border-border bg-surface-2/40">
                            {vs.map((v) => (
                              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                                <span className="w-10 font-semibold">v{v.version}</span><span className="text-muted-foreground">{fechaCo(v.creado_en)}</span>
                                <span className="min-w-0 flex-1">{v.nota ?? ''}</span><span className="text-xs text-muted-foreground">{tamanoLegible(v.tamano_bytes)}</span>
                                <Button size="sm" variant="ghost" disabled={bajar.ocupado === v.id} onClick={() => void bajar.documento(v.id, 'documento', v.id, 'documentos', v.storage_path, v.nombre_original)} aria-label={`Descargar versión ${v.version} de ${d.titulo}`}><Download />v{v.version}</Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
          <p className="mt-3 text-xs text-muted-foreground">Los enlaces de descarga vencen a los 10 minutos: ningún documento queda público en internet.</p>
        </>
      ))}
      <Card className="mt-8 flex flex-wrap items-center gap-3 p-4">
        <FolderUp className="size-5 text-muted-foreground" aria-hidden />
        <p className="flex-1 text-sm text-muted-foreground">¿Tienes que enviarnos logos, textos o fotos?</p>
        <Button variant="secondary" size="sm" asChild><Enlace to="/cliente/archivos">Ir a Archivos de la empresa</Enlace></Button>
      </Card>
    </>
  );
}
