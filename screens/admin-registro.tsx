'use client';
import * as React from 'react';
import { Input, Select } from '@/components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ds/page';
import { Pantalla } from '@/components/ds/states';
import { useStore } from '@/lib/store';
import { fechaHora } from '@/lib/utils';

export function Registro() {
  const { actividad, empresas } = useStore();
  const [q, setQ] = React.useState('');
  const [emp, setEmp] = React.useState('todas');
  const lista = actividad.filter((a) => (emp === 'todas' || a.empresa === emp) && (a.accion + a.quien).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader titulo="Registro de actividad" descripcion="Quién hizo qué y cuándo. Solo se agrega: nadie puede editarlo ni borrarlo. Se guarda 2 años." />
      <Pantalla vacio={{ titulo: 'Aún no hay actividad', texto: 'Aquí aparecerá todo lo que se haga en el portal.' }}>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_16rem]">
          <Input aria-label="Buscar en el registro" placeholder="Buscar: aprobó, pausó, pago…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select aria-label="Filtrar por empresa" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="todas">Todas las empresas</option>{empresas.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}</Select>
        </div>
        <Table className="min-w-[52rem]">
          <THead><TR><TH>Cuándo</TH><TH>Quién</TH><TH>Qué hizo</TH><TH>Empresa</TH><TH>IP</TH></TR></THead>
          <TBody>
            {lista.map((a, i) => <TR key={i}><TD className="whitespace-nowrap text-muted-foreground">{fechaHora(a.cuando)}</TD><TD>{a.quien === 'Sistema' ? <Badge>Sistema</Badge> : a.quien}</TD><TD>{a.accion}</TD><TD className="text-muted-foreground">{a.empresa}</TD><TD className="tabular-nums text-muted-foreground">{a.ip}</TD></TR>)}
            {lista.length === 0 && <TR><TD colSpan={5} className="text-center text-muted-foreground">Nada coincide con tu búsqueda.</TD></TR>}
          </TBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">La IP solo la ve el super administrador; el cliente ve un historial de su proyecto sin IP.</p>
      </Pantalla>
    </>
  );
}
