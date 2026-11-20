'use client';
import * as React from 'react';
import { Download, Eye, FilePlus2, FileText, UploadCloud, UserMinus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { useCargar } from '@/lib/app/datos';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { confirmarVersionDocumento, crearDocumento, fijarVisibilidadDocumento, reservarYSubir } from '@/lib/portal/acciones-revisiones-docs';
import { mensajeDeErrorRevDocs } from '@/lib/portal/errores-revisiones-docs';
import { useStore } from '@/lib/store';
import type { CategoriaDocumento, Documento, VisibilidadDocumento } from '@/lib/supabase/tipos-revisiones-docs';
import { fechaCo, tamanoLegible, useDescarga } from '../revisiones/comun';
import { ConEmpresa, VisibilidadBadge } from './comun';
import { CATEGORIAS, etiquetaCategoria, leerDocumentos, leerPersonas, leerProyectosDe, type EmpresaMini, type PersonaMini } from './datos';
import { validarArchivo } from './cliente-archivos';

function Personas({ personas, elegidas, alCambiar }: { personas: PersonaMini[]; elegidas: string[]; alCambiar: (ids: string[]) => void }) {
  if (personas.length === 0) return <p className="text-sm text-muted-foreground">Esta empresa no tiene personas activas.</p>;
  return (
    <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Personas con acceso</legend>
      {personas.map((p) => <Checkbox key={p.id} id={`per-${p.id}`} checked={elegidas.includes(p.id)} onChange={(v) => alCambiar(v ? [...elegidas, p.id] : elegidas.filter((x) => x !== p.id))} label={p.nombre} />)}
    </fieldset>
  );
}

function SubirDialogo({ empresa, abierto, alCerrar, alCrear }: { empresa: EmpresaMini; abierto: boolean; alCerrar: () => void; alCrear: () => void }) {
  const { avisar } = useStore();
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [f, setF] = React.useState({ categoria: 'manual' as CategoriaDocumento, titulo: '', descripcion: '', proyecto: '', visibilidad: 'todo_el_equipo' as VisibilidadDocumento });
  const [personasElegidas, setPersonasElegidas] = React.useState<string[]>([]);
  const [personas, setPersonas] = React.useState<PersonaMini[]>([]);
  const [proyectos, setProyectos] = React.useState<{ id: string; nombre: string }[]>([]);
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  React.useEffect(() => {
    if (!abierto) return;
    setArchivo(null); setF({ categoria: 'manual', titulo: '', descripcion: '', proyecto: '', visibilidad: 'todo_el_equipo' }); setPersonasElegidas([]); setIntento(false); setError('');
    leerPersonas(empresa.id).then(setPersonas).catch(() => setError('No pudimos cargar las personas de la empresa.'));
    leerProyectosDe(empresa.id).then(setProyectos).catch(() => undefined);
  }, [abierto, empresa.id]);
  const eTitulo = intento && f.titulo.trim().length < 2 ? 'Escribe el título del documento.' : undefined;
  const eArchivo = intento && !archivo ? 'Elige el archivo.' : undefined;
  const ePersonas = intento && f.visibilidad === 'personas' && personasElegidas.length === 0 ? 'Elige al menos una persona, o cambia la visibilidad.' : undefined;
  const subir = async () => {
    setIntento(true); setError('');
    if (!archivo || f.titulo.trim().length < 2 || (f.visibilidad === 'personas' && personasElegidas.length === 0)) return;
    setOcupado(true);
    const c = crearClienteNavegador();
    const s = await reservarYSubir(c, 'documento', empresa.id, archivo);
    if (s.error || !s.data) { setOcupado(false); setError(mensajeDeErrorRevDocs(s.error)); return; }
    const r = await crearDocumento(c, { p_empresa_id: empresa.id, p_proyecto_id: f.proyecto || null, p_categoria: f.categoria, p_titulo: f.titulo.trim(), p_descripcion: f.descripcion.trim() || null, p_visibilidad: f.visibilidad, p_miembros: f.visibilidad === 'personas' ? personasElegidas : [], p_reserva_id: s.data.reserva_id });
    setOcupado(false);
    if (r.error) { setError(mensajeDeErrorRevDocs(r.error)); return; }
    avisar('Documento publicado.'); alCrear(); alCerrar();
  };
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !ocupado && alCerrar()}>
      <DialogContent title="Subir documento" description={`Para ${empresa.nombre}. La primera versión queda como v1.`}>
        <div className="space-y-4">
          <Field label="Archivo" htmlFor="sd-archivo" error={eArchivo} hint="Máximo 50 MB.">
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded border border-dashed border-border bg-surface-2 px-3 text-sm text-muted-foreground hover:text-foreground"><UploadCloud className="size-4 shrink-0" aria-hidden /><span className="truncate">{archivo?.name ?? 'Elegir archivo'}</span>
              <input id="sd-archivo" type="file" className="sr-only" onChange={(e) => { const x = e.target.files?.[0] ?? null; setError(''); if (x) { const m = validarArchivo(x); if (m) { setArchivo(null); setError(m); return; } } setArchivo(x); }} /></label>
          </Field>
          <Field label="Título" htmlFor="sd-titulo" error={eTitulo}><Input id="sd-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={160} aria-invalid={!!eTitulo} /></Field>
          <Field label="Categoría" htmlFor="sd-cat"><Select id="sd-cat" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as CategoriaDocumento })}>{CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}</Select></Field>
          <Field label="Proyecto" htmlFor="sd-proy"><Select id="sd-proy" value={f.proyecto} onChange={(e) => setF({ ...f, proyecto: e.target.value })}><option value="">Sin proyecto</option>{proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>
          <Field label="Descripción (opcional)" htmlFor="sd-desc"><Textarea id="sd-desc" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} maxLength={500} /></Field>
          <Field label="Quién lo ve" htmlFor="sd-vis" error={ePersonas}><Select id="sd-vis" value={f.visibilidad} onChange={(e) => setF({ ...f, visibilidad: e.target.value as VisibilidadDocumento })}><option value="todo_el_equipo">Todo el equipo</option><option value="solo_admin">Solo el administrador</option><option value="personas">Personas elegidas</option></Select></Field>
          {f.visibilidad === 'personas' && <Personas personas={personas} elegidas={personasElegidas} alCambiar={setPersonasElegidas} />}
          {error && <Alert variant="danger" title="No pudimos publicar el documento">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="ghost" disabled={ocupado}>Cancelar</Button></DialogClose><Button onClick={subir} disabled={ocupado}>{ocupado ? 'Subiendo…' : 'Publicar documento'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionDialogo({ doc, alCerrar, alCrear }: { doc: Documento | null; alCerrar: () => void; alCrear: () => void }) {
  const { avisar } = useStore();
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [nota, setNota] = React.useState('');
  const [error, setError] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  React.useEffect(() => { if (doc) { setArchivo(null); setNota(''); setError(''); } }, [doc]);
  const subir = async () => {
    if (!doc || !archivo) return;
    setOcupado(true); setError('');
    const c = crearClienteNavegador();
    const s = await reservarYSubir(c, 'documento', doc.empresa_id, archivo);
    if (s.error || !s.data) { setOcupado(false); setError(mensajeDeErrorRevDocs(s.error)); return; }
    const r = await confirmarVersionDocumento(c, { p_documento_id: doc.id, p_reserva_id: s.data.reserva_id, p_nota: nota.trim() || undefined });
    setOcupado(false);
    if (r.error) { setError(mensajeDeErrorRevDocs(r.error)); return; }
    avisar(`Versión ${r.data?.version ?? ''} publicada. La anterior se conserva.`); alCrear(); alCerrar();
  };
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && !ocupado && alCerrar()}>
      {doc && (
        <DialogContent title={`Versión nueva: ${doc.titulo}`} description={`Pasará de v${doc.version_actual} a v${doc.version_actual + 1}. La versión anterior no se reemplaza: se conserva.`}>
          <div className="space-y-4">
            <Field label="Archivo" htmlFor="nv-archivo"><label className="flex h-10 cursor-pointer items-center gap-2 rounded border border-dashed border-border bg-surface-2 px-3 text-sm text-muted-foreground hover:text-foreground"><UploadCloud className="size-4 shrink-0" aria-hidden /><span className="truncate">{archivo?.name ?? 'Elegir archivo'}</span>
              <input id="nv-archivo" type="file" className="sr-only" onChange={(e) => { const x = e.target.files?.[0] ?? null; setError(''); if (x) { const m = validarArchivo(x); if (m) { setArchivo(null); setError(m); return; } } setArchivo(x); }} /></label></Field>
            <Field label="Qué cambió" htmlFor="nv-nota"><Input id="nv-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ejemplo: se agregó el capítulo 3" /></Field>
            {error && <Alert variant="danger" title="No pudimos publicar la versión">{error}</Alert>}
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="ghost" disabled={ocupado}>Cancelar</Button></DialogClose><Button onClick={subir} disabled={!archivo || ocupado}>{ocupado ? 'Subiendo…' : 'Publicar versión'}</Button></div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function VisibilidadDialogo({ doc, empresaId, elegidasInicial, alCerrar, alCambiar }: { doc: Documento | null; empresaId: string; elegidasInicial: string[]; alCerrar: () => void; alCambiar: () => void }) {
  const { avisar } = useStore();
  const [v, setV] = React.useState<VisibilidadDocumento>('todo_el_equipo');
  const [elegidas, setElegidas] = React.useState<string[]>([]);
  const [personas, setPersonas] = React.useState<PersonaMini[]>([]);
  const [error, setError] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  React.useEffect(() => { if (doc) { setV(doc.visibilidad); setElegidas(elegidasInicial); setError(''); leerPersonas(empresaId).then(setPersonas).catch(() => setError('No pudimos cargar las personas.')); } }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardar = async () => {
    if (!doc) return;
    if (v === 'personas' && elegidas.length === 0) { setError('Elige al menos una persona, o cambia la visibilidad.'); return; }
    setOcupado(true); setError('');
    const r = await fijarVisibilidadDocumento(crearClienteNavegador(), { p_documento_id: doc.id, p_visibilidad: v, p_miembros: v === 'personas' ? elegidas : [] });
    setOcupado(false);
    if (r.error) { setError(mensajeDeErrorRevDocs(r.error)); return; }
    avisar('Visibilidad actualizada. Quien perdió el acceso ya no ve el documento.'); alCambiar(); alCerrar();
  };
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && !ocupado && alCerrar()}>
      {doc && (
        <DialogContent title={`Quién ve: ${doc.titulo}`} description="Los cambios aplican de inmediato. El administrador de la empresa siempre ve todo.">
          <div className="space-y-4">
            <Field label="Visibilidad" htmlFor="vi-vis"><Select id="vi-vis" value={v} onChange={(e) => setV(e.target.value as VisibilidadDocumento)}><option value="todo_el_equipo">Todo el equipo</option><option value="solo_admin">Solo el administrador</option><option value="personas">Personas elegidas</option></Select></Field>
            {v === 'personas' && <Personas personas={personas} elegidas={elegidas} alCambiar={setElegidas} />}
            {error && <Alert variant="danger" title="No pudimos guardar">{error}</Alert>}
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="ghost" disabled={ocupado}>Cancelar</Button></DialogClose><Button onClick={guardar} disabled={ocupado}>Guardar</Button></div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function Contenido({ empresa }: { empresa: EmpresaMini }) {
  const { avisar } = useStore();
  const { estado, datos, recargar } = useCargar(async () => ({ ...(await leerDocumentos(empresa.id)), personas: await leerPersonas(empresa.id) }), [empresa.id]);
  const [subir, setSubir] = React.useState(false);
  const [version, setVersion] = React.useState<Documento | null>(null);
  const [visi, setVisi] = React.useState<Documento | null>(null);
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const bajar = useDescarga();
  const revocar = async (d: Documento, miembroId: string) => {
    const quedan = datos!.permisos.filter((p) => p.documento_id === d.id && p.miembro_id !== miembroId).map((p) => p.miembro_id);
    const r = await fijarVisibilidadDocumento(crearClienteNavegador(), { p_documento_id: d.id, p_visibilidad: 'personas', p_miembros: quedan });
    if (r.error) { avisar(mensajeDeErrorRevDocs(r.error)); return; }
    avisar('Acceso revocado.'); recargar(true);
  };
  if (estado === 'cargando') return <EstadoCargando />;
  if (estado === 'error' || !datos) return <EstadoError onReintentar={() => recargar()} />;
  const nombre = (id: string) => datos.personas.find((p) => p.id === id)?.nombre ?? 'Persona que ya no está activa';
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setSubir(true)}><UploadCloud />Subir documento</Button></div>
      {datos.documentos.length === 0 ? <EstadoVacio titulo="Esta empresa aún no tiene documentos" texto="Sube el contrato, las actas o los manuales y elige quién los ve." /> : (
        <ul className="space-y-3">
          {datos.documentos.map((d) => {
            const vs = datos.versiones.filter((v) => v.documento_id === d.id).sort((x, y) => y.version - x.version);
            const ult = vs[0]; const con = datos.permisos.filter((p) => p.documento_id === d.id);
            return (
              <li key={d.id} data-documento={d.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
                    <FileText className="size-6 shrink-0 text-primary-text" aria-hidden />
                    <div className="min-w-0 flex-1"><p className="break-words font-medium">{d.titulo}</p><p className="text-xs text-muted-foreground">{etiquetaCategoria(d.categoria)} · v{d.version_actual}{ult ? ` · ${fechaCo(ult.creado_en)} · ${tamanoLegible(ult.tamano_bytes)}` : ''}</p></div>
                    <VisibilidadBadge v={d.visibilidad} />
                  </div>
                  {d.visibilidad === 'personas' && (
                    <ul className="border-t border-border px-5 py-3 text-sm" aria-label={`Personas con acceso a ${d.titulo}`}>
                      {con.length === 0 && <li className="text-muted-foreground">Nadie, salvo el administrador.</li>}
                      {con.map((p) => <li key={p.id} className="flex items-center justify-between gap-2 py-1"><span>{nombre(p.miembro_id)}</span><Button size="sm" variant="ghost" onClick={() => void revocar(d, p.miembro_id)} aria-label={`Revocar acceso de ${nombre(p.miembro_id)} a ${d.titulo}`}><UserMinus />Revocar acceso</Button></li>)}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
                    <Button size="sm" variant="outline" onClick={() => setAbierto(abierto === d.id ? null : d.id)} aria-expanded={abierto === d.id}>Versiones ({vs.length})</Button>
                    <Button size="sm" variant="outline" onClick={() => setVersion(d)}><FilePlus2 />Versión nueva</Button>
                    <Button size="sm" variant="outline" onClick={() => setVisi(d)}><Eye />Quién lo ve</Button>
                    {ult && <Button size="sm" variant="secondary" onClick={() => void bajar.documento(ult.id, 'documento', ult.id, 'documentos', ult.storage_path, ult.nombre_original)}><Download />Descargar</Button>}
                  </div>
                  {abierto === d.id && (
                    <ul className="divide-y divide-border border-t border-border bg-surface-2/40">
                      {vs.map((v) => <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm"><span className="w-10 font-semibold">v{v.version}</span><span className="text-muted-foreground">{fechaCo(v.creado_en)}</span><span className="min-w-0 flex-1 break-words">{v.nota ?? ''}</span><span className="text-xs text-muted-foreground">{tamanoLegible(v.tamano_bytes)}</span></li>)}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <SubirDialogo empresa={empresa} abierto={subir} alCerrar={() => setSubir(false)} alCrear={() => recargar(true)} />
      <VersionDialogo doc={version} alCerrar={() => setVersion(null)} alCrear={() => recargar(true)} />
      <VisibilidadDialogo doc={visi} empresaId={empresa.id} elegidasInicial={visi ? datos.permisos.filter((p) => p.documento_id === visi.id).map((p) => p.miembro_id) : []} alCerrar={() => setVisi(null)} alCambiar={() => recargar(true)} />
    </>
  );
}

/** Documentos de cada empresa para el super admin: subir, versiones, visibilidad y revocar acceso. */
export function DocumentosAdmin() {
  return (
    <>
      <PageHeader titulo="Documentos de los clientes" descripcion="Publica contratos, actas, manuales y entregables, con sus versiones, y decide quién los ve en cada empresa." />
      <ConEmpresa>{(e) => <Contenido empresa={e} />}</ConEmpresa>
    </>
  );
}
