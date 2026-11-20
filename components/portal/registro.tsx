'use client';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, EstadoVacio } from '@/components/ds/states';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { useCargar } from '@/lib/app/datos';
import type { Database } from '@/lib/supabase/database.types';
import { fechaHora } from '@/lib/utils';

type Fila = Database['public']['Tables']['registro_actividad']['Row'];

const ACCIONES: Record<string, string> = {
  crear_empresa: 'Creó una empresa', empresa_creada: 'Creó una empresa', empresa_pausada: 'Pausó una empresa', empresa_reactivada: 'Reactivó una empresa',
  invitacion_creada: 'Invitó a una persona', invitacion_revocada: 'Canceló una invitación', invitacion_aceptada: 'Activó una invitación',
  miembro_quitado: 'Quitó a una persona', miembro_bloqueado: 'Bloqueó a una persona', miembro_desbloqueado: 'Desbloqueó a una persona',
  usuario_bloqueado: 'Bloqueó a un usuario en todo el portal', usuario_desbloqueado: 'Quitó el bloqueo global',
  proyecto_creado: 'Creó un proyecto', proyecto_editado: 'Editó un proyecto', hito_editado: 'Editó un hito', retraso_registrado: 'Cambió la fecha de un hito',
  plan_sprints_cargado: 'Cargó el plan de sprints', plan_sprints_aprobado: 'Publicó el plan de sprints', sprint_agregado: 'Agregó un sprint', sprint_editado: 'Editó un sprint',
  sprint_quitado: 'Quitó un sprint', sprints_reordenados: 'Reordenó los sprints', ver_como_iniciado: 'Entró en "ver como el cliente" (solo lectura)',
  ver_como_terminado: 'Salió de "ver como el cliente"', consumo_equipo_editado: 'Anotó el consumo del equipo', consumo_equipo_aviso_80: 'Consumo del equipo llegó al 80 % del tope',
  inicio_de_sesion: 'Inició sesión', inicio_de_sesion_fallido: 'Intento de inicio de sesión fallido', intento_rechazado: 'Intento rechazado',
};
const humano = (a: string) => ACCIONES[a] ?? (a.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()));

async function leer() {
  const c = crearClienteNavegador();
  const r = await c.from('registro_actividad').select('*').order('id', { ascending: false }).limit(500);
  if (r.error) throw new Error('lectura_fallida');
  const filas = (r.data ?? []) as Fila[];
  const ids = [...new Set(filas.map((f) => f.actor_id).filter((x): x is string => !!x))];
  const [p, e] = await Promise.all([
    ids.length ? c.from('perfiles').select('user_id, nombre, correo').in('user_id', ids) : Promise.resolve({ data: [], error: null }),
    c.from('empresas').select('id, nombre'),
  ]);
  if (p.error || e.error) throw new Error('lectura_fallida');
  const quien = new Map((p.data ?? []).map((x: { user_id: string; nombre: string; correo: string }) => [x.user_id, x.nombre?.trim() || x.correo]));
  const empresa = new Map((e.data ?? []).map((x: { id: string; nombre: string }) => [x.id, x.nombre]));
  return { filas, quien, empresa };
}

/** Registro de actividad completo (quién, qué, cuándo, empresa e IP). Solo el super admin; solo se agrega. */
export function RegistroReal() {
  const { estado, datos, recargar } = useCargar(leer, []);
  const [q, setQ] = React.useState('');
  const [emp, setEmp] = React.useState('todas');
  const cab = <PageHeader titulo="Registro de actividad" descripcion="Quién hizo qué y cuándo. Solo se agrega: nadie puede editarlo ni borrarlo." />;
  if (estado === 'cargando') return <>{cab}<EstadoCargando /></>;
  if (estado === 'error' || !datos) return <>{cab}<EstadoError onReintentar={() => recargar()} /></>;
  if (datos.filas.length === 0) return <>{cab}<EstadoVacio titulo="Aún no hay actividad" texto="Aquí aparecerá todo lo que se haga en el portal." /></>;
  const lista = datos.filas.filter((f) => (emp === 'todas' || f.empresa_id === emp) && (humano(f.accion) + ' ' + (f.actor_id ? datos.quien.get(f.actor_id) ?? '' : 'sistema')).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      {cab}
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_16rem]">
        <Input aria-label="Buscar en el registro" placeholder="Buscar: pausó, proyecto, ver como…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Filtrar por empresa" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="todas">Todas las empresas</option>{[...datos.empresa].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
      </div>
      <Table className="min-w-[52rem]">
        <THead><TR><TH>Cuándo</TH><TH>Quién</TH><TH>Qué hizo</TH><TH>Empresa</TH><TH>IP</TH></TR></THead>
        <TBody>
          {lista.map((f) => (
            <TR key={f.id} data-testid="fila-registro">
              <TD className="whitespace-nowrap text-muted-foreground">{fechaHora(f.creado_en)}</TD>
              <TD>{f.actor_tipo === 'sistema' || !f.actor_id ? <Badge>Sistema</Badge> : datos.quien.get(f.actor_id) ?? 'Usuario'}</TD>
              <TD>{humano(f.accion)}</TD>
              <TD className="text-muted-foreground">{f.empresa_id ? datos.empresa.get(f.empresa_id) ?? '—' : '—'}</TD>
              <TD className="tabular-nums text-muted-foreground">{f.ip ?? '—'}</TD>
            </TR>
          ))}
          {lista.length === 0 && <TR><TD colSpan={5} className="text-center text-muted-foreground">Nada coincide con tu búsqueda.</TD></TR>}
        </TBody>
      </Table>
      <p className="mt-3 text-xs text-muted-foreground">Se muestran los últimos 500 movimientos. La IP solo la ve el super administrador; el cliente ve un historial de su proyecto sin IP.</p>
    </>
  );
}
