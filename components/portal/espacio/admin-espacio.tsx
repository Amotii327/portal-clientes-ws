'use client';
import * as React from 'react';
import { Archive, HardDrive, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader, Seccion } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { archivosArchivados, espacioPorEmpresas, fijarCupoEspacio, pedirRecuperarArchivo } from '@/lib/portal/acciones-espacio';
import { correr } from '@/lib/app/proyectos';
import { useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import type { EspacioPorEmpresa, EstadoArchivoArchivado } from '@/lib/supabase/database.types';
import { fecha } from '@/lib/utils';
import { BYTES_POR_GB, BYTES_POR_MB, CUPO_MAX, CUPO_MIN, tamanoEspacio } from './formato';

const ESTADO_ARCHIVO: Record<EstadoArchivoArchivado, { txt: string; v: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  marcado: { txt: 'Por archivar', v: 'warning' },
  trasladado: { txt: 'Archivado', v: 'info' },
  borrado_de_supabase: { txt: 'Archivado (ya no ocupa espacio)', v: 'success' },
  recuperacion_pedida: { txt: 'Recuperación pedida', v: 'warning' },
  recuperado: { txt: 'Recuperado', v: 'neutral' },
  error: { txt: 'Con error', v: 'danger' },
};

function CambiarCupo({ fila, onCerrar, onListo }: { fila: EspacioPorEmpresa; onCerrar: () => void; onListo: () => void }) {
  const { avisar } = useStore();
  const enGB = fila.cupo_bytes >= BYTES_POR_GB && fila.cupo_bytes % BYTES_POR_GB === 0;
  const [valor, setValor] = React.useState(String(enGB ? fila.cupo_bytes / BYTES_POR_GB : Math.round(fila.cupo_bytes / BYTES_POR_MB)));
  const [unidad, setUnidad] = React.useState<'GB' | 'MB'>(enGB ? 'GB' : 'MB');
  const [error, setError] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const guardar = async (porDefecto: boolean) => {
    let bytes: number | null = null;
    if (!porDefecto) {
      const n = Number(valor.replace(',', '.'));
      bytes = Math.round(n * (unidad === 'GB' ? BYTES_POR_GB : BYTES_POR_MB));
      if (!Number.isFinite(n) || bytes < CUPO_MIN || bytes > CUPO_MAX) { setError('Escribe un cupo entre 10 MB y 1.024 GB (1 TB).'); return; }
    }
    setError(''); setOcupado(true);
    const r = await correr('fijar_cupo_espacio', fijarCupoEspacio(crearClienteNavegador(), fila.empresa_id, bytes));
    setOcupado(false);
    if (r.error) { setError(r.mensaje); return; }
    avisar(porDefecto ? `${fila.nombre} vuelve al cupo por defecto (1 GB).` : `Cupo de ${fila.nombre} actualizado.`);
    onListo();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onCerrar()}>
      <DialogContent title={`Cupo de ${fila.nombre}`} description={`Ahora usa ${tamanoEspacio(fila.usado_bytes)} de ${tamanoEspacio(fila.cupo_bytes)}. Al llegar al 80 % se avisa al administrador del cliente; al 100 % no puede subir más.`}>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Cupo" htmlFor="cupo-valor"><Input id="cupo-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Field>
          <Field label="Unidad" htmlFor="cupo-unidad"><Select id="cupo-unidad" value={unidad} onChange={(e) => setUnidad(e.target.value as 'GB' | 'MB')}><option>GB</option><option>MB</option></Select></Field>
        </div>
        {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" disabled={ocupado} onClick={() => void guardar(true)}>Volver al cupo por defecto</Button>
          <div className="flex gap-2"><Button variant="ghost" disabled={ocupado} onClick={onCerrar}>Cancelar</Button><Button disabled={ocupado} onClick={() => void guardar(false)}>{ocupado ? 'Guardando…' : 'Guardar cupo'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Super admin: cupo y uso de espacio por empresa, y la lista de archivos archivados o por archivar. */
export function EspacioAdmin() {
  const { avisar } = useStore();
  const { estado, datos, recargar } = useCargar(async () => {
    const c = crearClienteNavegador();
    const [e, a] = await Promise.all([espacioPorEmpresas(c), archivosArchivados(c)]);
    if (e.error || !e.data) throw new Error('lectura_fallida');
    return { empresas: e.data, archivos: a.data ?? [] };
  }, []);
  const [edit, setEdit] = React.useState<EspacioPorEmpresa | null>(null);
  const cab = <PageHeader titulo="Espacio de los clientes" descripcion="Cuánto espacio usa cada empresa y su cupo. Los archivos de proyectos cerrados se archivan fuera de la base y se recuperan a pedido." />;
  if (estado === 'cargando') return <>{cab}<EstadoCargando /></>;
  if (estado === 'error' || !datos) return <>{cab}<EstadoError onReintentar={() => recargar()} /></>;
  const nombre = (id: string) => datos.empresas.find((e) => e.empresa_id === id)?.nombre ?? '';
  const pedir = async (id: string) => {
    const r = await correr('pedir_recuperar_archivo', pedirRecuperarArchivo(crearClienteNavegador(), id));
    if (r.error) { avisar(r.mensaje); return; }
    avisar('Recuperación pedida. El archivo vuelve cuando Operaciones lo traiga del archivo externo.'); recargar(true);
  };
  return (
    <>
      {cab}
      <Seccion titulo="Cupo por empresa" descripcion="De la más llena a la menos llena. El cupo por defecto es de 1 GB.">
        {datos.empresas.length === 0 ? <EstadoVacio titulo="Aún no hay empresas" texto="Cuando crees una empresa, aquí verás su espacio." /> : (
          <Table className="min-w-[40rem]">
            <THead><TR><TH>Empresa</TH><TH>Usado</TH><TH>Cupo</TH><TH className="w-56">Uso</TH><TH><span className="sr-only">Acciones</span></TH></TR></THead>
            <TBody>
              {datos.empresas.map((e) => (
                <TR key={e.empresa_id} data-testid="fila-espacio">
                  <TD className="font-medium">{e.nombre}</TD>
                  <TD>{tamanoEspacio(e.usado_bytes)}</TD>
                  <TD>{tamanoEspacio(e.cupo_bytes)}</TD>
                  <TD><div className="flex items-center gap-3"><Progress className="flex-1" value={e.porcentaje} tone={e.porcentaje >= 100 ? 'danger' : e.porcentaje >= 80 ? 'warning' : 'primary'} marker={80} label={`Uso de espacio de ${e.nombre}`} /><span className="w-12 text-right tabular-nums">{Math.round(e.porcentaje)} %</span></div></TD>
                  <TD className="text-right"><Button size="sm" variant="outline" onClick={() => setEdit(e)} aria-label={`Cambiar el cupo de ${e.nombre}`}><Pencil />Cambiar cupo</Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Seccion>
      <Seccion titulo="Archivos archivados o por archivar" descripcion="Se marcan los de proyectos cerrados hace más de 30 días.">
        {datos.archivos.length === 0 ? <EstadoVacio titulo="Todavía no hay archivos archivados" texto="Cuando un proyecto cierre, sus archivos aparecerán aquí." /> : (
          <Table className="min-w-[44rem]">
            <THead><TR><TH>Archivo</TH><TH>Empresa</TH><TH>Tamaño</TH><TH>Estado</TH><TH>Marcado</TH><TH><span className="sr-only">Acciones</span></TH></TR></THead>
            <TBody>
              {datos.archivos.map((a) => (
                <TR key={a.id} data-testid="fila-archivado">
                  <TD className="max-w-[16rem] break-words font-medium"><Archive className="mr-1.5 inline size-4 text-muted-foreground" aria-hidden />{a.nombre_original}</TD>
                  <TD>{nombre(a.empresa_id)}</TD>
                  <TD>{tamanoEspacio(a.tamano_bytes)}</TD>
                  <TD><Badge variant={ESTADO_ARCHIVO[a.estado].v}>{ESTADO_ARCHIVO[a.estado].txt}</Badge></TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{fecha(a.marcado_en)}</TD>
                  <TD className="text-right">{(a.estado === 'trasladado' || a.estado === 'borrado_de_supabase') && <Button size="sm" variant="outline" onClick={() => void pedir(a.id)} aria-label={`Pedir de vuelta ${a.nombre_original}`}><HardDrive />Pedir de vuelta</Button>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Seccion>
      {edit && <CambiarCupo fila={edit} onCerrar={() => setEdit(null)} onListo={() => { setEdit(null); recargar(true); }} />}
    </>
  );
}
