'use client';
import * as React from 'react';
import { CheckCheck, Download, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { useCargar } from '@/lib/app/datos';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { marcarArchivoRecibido } from '@/lib/portal/acciones-revisiones-docs';
import { mensajeDeErrorRevDocs } from '@/lib/portal/errores-revisiones-docs';
import { useStore } from '@/lib/store';
import { fechaCo, tamanoLegible, useDescarga } from '../revisiones/comun';
import { ConEmpresa } from './comun';
import { leerArchivos, type EmpresaMini } from './datos';

function Contenido({ empresa }: { empresa: EmpresaMini }) {
  const { avisar } = useStore();
  const { estado, datos, recargar } = useCargar(() => leerArchivos(empresa.id), [empresa.id]);
  const bajar = useDescarga();
  const recibir = async (id: string) => {
    const r = await marcarArchivoRecibido(crearClienteNavegador(), id);
    if (r.error) { avisar(mensajeDeErrorRevDocs(r.error)); recargar(true); return; }
    avisar('Marcado como recibido. Queda fijo: el cliente ya no puede borrarlo.'); recargar(true);
  };
  if (estado === 'cargando') return <EstadoCargando />;
  if (estado === 'error' || !datos) return <EstadoError onReintentar={() => recargar()} />;
  if (datos.length === 0) return <EstadoVacio titulo="Esta empresa aún no ha subido archivos" texto="Cuando suba logos, textos o fotos, aparecerán aquí." />;
  const nuevos = datos.filter((f) => f.estado === 'nuevo' && !f.borrado_en).length;
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">{nuevos === 0 ? 'No hay archivos nuevos por revisar.' : nuevos === 1 ? '1 archivo nuevo por marcar como recibido.' : `${nuevos} archivos nuevos por marcar como recibidos.`}</p>
      <Card>
        <ul className="divide-y divide-border">
          {datos.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 p-4" data-archivo={f.id}>
              <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{f.nombre_original}</p>
                <p className="break-words text-xs text-muted-foreground">{f.subido_por_nombre} · {fechaCo(f.creado_en)} · {tamanoLegible(f.tamano_bytes)}{f.nota ? ` · ${f.nota}` : ''}</p>
              </div>
              {f.borrado_en ? <Badge variant="neutral">Borrado por el cliente</Badge> : <Badge variant={f.estado === 'recibido' ? 'success' : 'info'}>{f.estado === 'recibido' ? 'Recibido' : 'Nuevo'}</Badge>}
              {!f.borrado_en && <Button size="sm" variant="ghost" disabled={bajar.ocupado === f.id} onClick={() => void bajar.documento(f.id, 'archivo', f.id, 'archivos-empresa', f.storage_path, f.nombre_original)} aria-label={`Descargar ${f.nombre_original}`}><Download /></Button>}
              {!f.borrado_en && f.estado === 'nuevo' && <Button size="sm" variant="secondary" onClick={() => void recibir(f.id)} aria-label={`Marcar ${f.nombre_original} como recibido`}><CheckCheck />Marcar recibido</Button>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

/** Archivos que sube cada empresa, para el super admin: verlos, bajarlos y marcarlos "recibido". */
export function ArchivosAdmin() {
  return (
    <>
      <PageHeader titulo="Archivos de los clientes" descripcion="Lo que cada empresa sube para su proyecto. Al marcarlo como recibido queda fijo y el cliente ya no puede borrarlo." />
      <ConEmpresa>{(e) => <Contenido empresa={e} />}</ConEmpresa>
    </>
  );
}
