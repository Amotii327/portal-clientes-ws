'use client';
import * as React from 'react';
import { Download, FileText, History, Lock, Trash2, UploadCloud, Users } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { PageHeader, Seccion } from '@/components/ds/page';
import { Pantalla } from '@/components/ds/states';
import { useStore } from '@/lib/store';
import type { Categoria } from '@/lib/data';
import { cn, fecha } from '@/lib/utils';

const CATS: ('Todos' | Categoria)[] = ['Todos', 'Contrato', 'Propuesta', 'Requerimientos', 'Arquitectura', 'Acta', 'Manual', 'Entregable', 'Otro'];

export function Documentos() {
  const { empresa, can, mutar, avisar, usuario } = useStore();
  const [cat, setCat] = React.useState<'Todos' | Categoria>('Todos');
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const [nombre, setNombre] = React.useState('');
  const [nota, setNota] = React.useState('');
  const docs = empresa.documentos.filter((d) => (can.esAdmin || d.visibilidad === 'todo') && (cat === 'Todos' || d.categoria === cat));
  const subir = () => {
    if (!nombre) return;
    mutar(empresa.id, (e) => { e.archivos.unshift({ id: 'u-' + Date.now(), nombre, nota, subidoPor: usuario?.cargo ?? 'Administrador', fecha: '2026-11-20', tamano: '1,2 MB', estado: 'nuevo' }); }, `Subió el archivo "${nombre}"`);
    avisar('Archivo guardado. Websourcing recibió un aviso.');
    setNombre(''); setNota('');
  };
  return (
    <>
      <PageHeader titulo="Documentos" descripcion="Contrato, propuesta, requerimientos, actas, manuales y entregables, con todas sus versiones." />
      <Pantalla vacio={{ titulo: 'Aún no hay documentos', texto: 'Cuando Websourcing publique el contrato, las actas o los manuales, los encontrarás aquí.' }}>
        <div className="scroll-x relative mb-5 flex gap-2 pb-1" role="group" aria-label="Categorías">
          {CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={cn('h-9 shrink-0 rounded-full border px-4 text-sm transition-colors', cat === c ? 'border-primary bg-primary text-primary-foreground font-semibold' : 'border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground')}>{c}</button>
          ))}
        </div>
        {docs.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No hay documentos en esta categoría.</Card> : (
          <ul className="space-y-3">
            {docs.map((d) => {
              const ult = d.versiones[d.versiones.length - 1];
              const abierta = abierto === d.id;
              return (
                <li key={d.id}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
                      <FileText className="size-6 shrink-0 text-primary-text" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{d.nombre}</p>
                        <p className="text-xs text-muted-foreground">{d.categoria} · versión {ult.v} · {fecha(ult.fecha)} · {ult.tamano}</p>
                      </div>
                      <Badge variant={d.visibilidad === 'todo' ? 'neutral' : 'warning'}>{d.visibilidad === 'todo' ? <><Users className="size-3.5" aria-hidden />Todo el equipo</> : <><Lock className="size-3.5" aria-hidden />Solo administrador</>}</Badge>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setAbierto(abierta ? null : d.id)} aria-expanded={abierta}><History />Versiones ({d.versiones.length})</Button>
                        <Button size="sm"><Download />Descargar</Button>
                      </div>
                    </div>
                    {abierta && (
                      <ul className="divide-y divide-border border-t border-border bg-surface-2/40">
                        {[...d.versiones].reverse().map((v) => (
                          <li key={v.v} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm"><span className="w-10 font-semibold">v{v.v}</span><span className="text-muted-foreground">{fecha(v.fecha)}</span><span className="flex-1">{v.nota}</span><span className="text-xs text-muted-foreground">{v.tamano}</span></li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Los enlaces de descarga vencen a los pocos minutos: ningún documento queda público en internet.</p>

        <Seccion titulo="Archivos de la empresa" descripcion="Sube aquí lo que necesitamos para tu proyecto: logo, textos, fotos, bases de datos. Solo lo ven tu empresa y Websourcing." className="mt-12">
          <Alert variant="info" className="mb-4" title="Accesos y claves">Este portal no guarda claves. Si necesitamos accesos, te indicaremos cómo entregarlos de forma segura.</Alert>
          {can.subirArchivos && !can.soloLectura ? (
            <Card className="mb-4"><CardHeader><CardTitle className="text-base">Subir un archivo</CardTitle><CardDescription>Máximo 50 MB. Imágenes, PDF, video, audio, documentos de Office, hojas de cálculo, CSV y ZIP.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <Field label="Archivo" htmlFor="ar-file"><label className="flex h-10 cursor-pointer items-center gap-2 truncate rounded border border-dashed border-border bg-surface-2 px-3 text-sm text-muted-foreground hover:text-foreground"><UploadCloud className="size-4 shrink-0" /><span className="truncate">{nombre || 'Elegir archivo'}</span><input id="ar-file" type="file" className="sr-only" onChange={(e) => setNombre(e.target.files?.[0]?.name ?? '')} /></label></Field>
                <Field label="Nota (opcional)" htmlFor="ar-nota"><Input id="ar-nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ejemplo: logo en fondo transparente" /></Field>
                <Button onClick={subir} disabled={!nombre}><UploadCloud />Subir</Button>
              </CardContent></Card>
          ) : (
            <Alert variant="warning" className="mb-4" title="No tienes permiso para subir archivos">Pídele al administrador de tu empresa el permiso "subir archivos".</Alert>
          )}
          <Card>
            {empresa.archivos.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Todavía no has subido archivos.</p> : (
              <ul className="divide-y divide-border">
                {empresa.archivos.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                    <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.nombre}</p><p className="truncate text-xs text-muted-foreground">{a.subidoPor} · {fecha(a.fecha)} · {a.tamano}{a.nota ? ` · ${a.nota}` : ''}</p></div>
                    <Badge variant={a.estado === 'recibido' ? 'success' : 'info'}>{a.estado === 'recibido' ? 'Recibido por Websourcing' : 'Nuevo'}</Badge>
                    {a.estado === 'nuevo' && can.subirArchivos && !can.soloLectura
                      ? <Button size="sm" variant="ghost" onClick={() => { mutar(empresa.id, (e) => { e.archivos = e.archivos.filter((x) => x.id !== a.id); }, `Borró el archivo "${a.nombre}"`); avisar('Archivo borrado.'); }} aria-label={`Borrar ${a.nombre}`}><Trash2 /></Button>
                      : <span className="text-xs text-muted-foreground">{a.estado === 'recibido' ? 'Fijo' : ''}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Puedes borrar un archivo mientras Websourcing no lo marque como "recibido". Después queda fijo.</p>
        </Seccion>
      </Pantalla>
    </>
  );
}
