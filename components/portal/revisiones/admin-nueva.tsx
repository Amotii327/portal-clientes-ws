'use client';
import * as React from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { crearRevision } from '@/lib/portal/acciones-revisiones-docs';
import { mensajeDeErrorRevDocs } from '@/lib/portal/errores-revisiones-docs';
import { ir } from '@/lib/router';
import { useStore } from '@/lib/store';
import type { Documento, TipoRevision } from '@/lib/supabase/tipos-revisiones-docs';
import { leerDocumentos, leerEmpresas, leerProyectosDe, type EmpresaMini, type ProyectoMini } from '../documentos/datos';

interface SprintMini { id: string; proyecto_id: string; numero: number; nombre: string; estado: string }
const tabla = (n: string) => (crearClienteNavegador() as unknown as { from: (x: string) => any }).from(n); // eslint-disable-line @typescript-eslint/no-explicit-any
const HTTPS = /^https:\/\/\S+$/;

/** Crea el borrador de una revisión (diseño, sprint o documento). Se publica después, desde su detalle. */
export function NuevaRevisionDialogo({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const { avisar } = useStore();
  const [empresas, setEmpresas] = React.useState<EmpresaMini[]>([]);
  const [proyectos, setProyectos] = React.useState<ProyectoMini[]>([]);
  const [sprints, setSprints] = React.useState<SprintMini[]>([]);
  const [docs, setDocs] = React.useState<Documento[]>([]);
  const vacio = { empresa: '', proyecto: '', tipo: 'sprint' as TipoRevision, sprint: '', documento: '', acta: '', titulo: '', link: '', video: '', resumen: '' };
  const [f, setF] = React.useState(vacio);
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);
  const [falloCarga, setFalloCarga] = React.useState(false);

  React.useEffect(() => { if (abierto) { setF(vacio); setIntento(false); setError(''); leerEmpresas().then((e) => { setEmpresas(e); setF((x) => ({ ...x, empresa: e[0]?.id ?? '' })); }).catch(() => setFalloCarga(true)); } }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!abierto || !f.empresa) return;
    let vivo = true;
    Promise.all([leerProyectosDe(f.empresa), tabla('sprints').select('*').eq('empresa_id', f.empresa).order('numero'), leerDocumentos(f.empresa)])
      .then(([p, s, d]) => { if (!vivo) return; setProyectos(p); setSprints((s.data ?? []) as SprintMini[]); setDocs(d.documentos); setF((x) => ({ ...x, proyecto: p[0]?.id ?? '', sprint: '', documento: '', acta: '' })); })
      .catch(() => vivo && setFalloCarga(true));
    return () => { vivo = false; };
  }, [abierto, f.empresa]);

  const sprintsDe = sprints.filter((s) => s.proyecto_id === f.proyecto);
  const actas = docs.filter((d) => d.categoria === 'acta');
  const err = {
    titulo: intento && f.titulo.trim().length < 3 ? 'Escribe un título (mínimo 3 caracteres).' : undefined,
    sprint: intento && f.tipo === 'sprint' && !f.sprint ? 'Elige el sprint.' : undefined,
    documento: intento && f.tipo === 'documento' && !f.documento ? 'Elige el documento.' : undefined,
    link: intento && f.link && !HTTPS.test(f.link) ? 'El enlace debe empezar por https:// y no tener espacios.' : undefined,
    video: intento && f.video && !HTTPS.test(f.video) ? 'El enlace debe empezar por https:// y no tener espacios.' : undefined,
  };
  const crear = async () => {
    setIntento(true); setError('');
    if (!f.proyecto || f.titulo.trim().length < 3 || (f.tipo === 'sprint' && !f.sprint) || (f.tipo === 'documento' && !f.documento) || (f.link && !HTTPS.test(f.link)) || (f.video && !HTTPS.test(f.video))) return;
    setGuardando(true);
    const r = await crearRevision(crearClienteNavegador(), {
      p_proyecto_id: f.proyecto, p_tipo: f.tipo, p_titulo: f.titulo.trim(),
      p_sprint_id: f.tipo === 'sprint' ? f.sprint : undefined, p_documento_id: f.tipo === 'documento' ? f.documento : undefined,
      p_link_prueba: f.link || undefined, p_video_url: f.video || undefined, p_acta_documento_id: f.acta || undefined, p_resumen: f.resumen.trim() || undefined,
    });
    setGuardando(false);
    if (r.error || !r.data) { setError(mensajeDeErrorRevDocs(r.error)); return; }
    avisar('Borrador creado. Revísalo y publícalo cuando esté listo.');
    alCerrar();
    ir(`/admin/revisiones/${r.data.revision_id}`);
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !guardando && alCerrar()}>
      <DialogContent title="Nueva revisión" description="Se crea como borrador: el cliente no la ve hasta que la publiques.">
        <div className="space-y-4">
          {falloCarga && <Alert variant="danger" title="No pudimos cargar los datos">Cierra esta ventana e inténtalo de nuevo.</Alert>}
          <Field label="Empresa" htmlFor="nr-empresa"><Select id="nr-empresa" value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })}>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select></Field>
          <Field label="Proyecto" htmlFor="nr-proyecto"><Select id="nr-proyecto" value={f.proyecto} onChange={(e) => setF({ ...f, proyecto: e.target.value, sprint: '' })}>{proyectos.length === 0 && <option value="">Sin proyectos</option>}{proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>
          <Field label="Qué se revisa" htmlFor="nr-tipo"><Select id="nr-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoRevision })}><option value="sprint">Un sprint</option><option value="diseno">El diseño del proyecto</option><option value="documento">Un documento</option></Select></Field>
          {f.tipo === 'sprint' && <Field label="Sprint" htmlFor="nr-sprint" error={err.sprint}><Select id="nr-sprint" value={f.sprint} onChange={(e) => setF({ ...f, sprint: e.target.value })}><option value="">Elige un sprint</option>{sprintsDe.map((s) => <option key={s.id} value={s.id}>Sprint {s.numero}: {s.nombre}</option>)}</Select></Field>}
          {f.tipo === 'documento' && <Field label="Documento" htmlFor="nr-doc" error={err.documento}><Select id="nr-doc" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })}><option value="">Elige un documento</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.titulo}</option>)}</Select></Field>}
          <Field label="Título" htmlFor="nr-titulo" error={err.titulo}><Input id="nr-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={160} aria-invalid={!!err.titulo} /></Field>
          <Field label="Link de prueba" htmlFor="nr-link" hint="Debe empezar por https://" error={err.link}><Input id="nr-link" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} aria-invalid={!!err.link} /></Field>
          <Field label="Link del video" htmlFor="nr-video" hint="Opcional. Debe empezar por https://" error={err.video}><Input id="nr-video" value={f.video} onChange={(e) => setF({ ...f, video: e.target.value })} aria-invalid={!!err.video} /></Field>
          <Field label="Acta" htmlFor="nr-acta" hint="Un documento de la categoría Acta de esta empresa."><Select id="nr-acta" value={f.acta} onChange={(e) => setF({ ...f, acta: e.target.value })}><option value="">Sin acta</option>{actas.map((d) => <option key={d.id} value={d.id}>{d.titulo}</option>)}</Select></Field>
          <Field label="Resumen para el cliente" htmlFor="nr-resumen"><Textarea id="nr-resumen" value={f.resumen} onChange={(e) => setF({ ...f, resumen: e.target.value })} maxLength={2000} /></Field>
          {error && <Alert variant="danger" title="No pudimos crear la revisión">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="ghost" disabled={guardando}>Cancelar</Button></DialogClose><Button onClick={crear} disabled={guardando}>{guardando ? 'Creando…' : 'Crear borrador'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
