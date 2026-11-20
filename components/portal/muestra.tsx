'use client';
import { PageHeader } from '@/components/ds/page';
import { SinPermiso } from '@/components/ds/states';
import { useRuta } from '@/lib/router';
import { ADMIN, CLIENTE, buscar } from '@/screens/rutas-prototipo';
import { ProximoSprint } from './banner';
import { usePortal } from './contexto';

/** Pantallas del prototipo que todavía no son reales: se muestran con datos de ejemplo y el aviso de "próximo sprint". */
export function PantallaMuestra() {
  const ctx = usePortal();
  const ruta = useRuta();
  const r = ruta.replace(/\/$/, '') || '/';
  const tabla = r.startsWith('/admin') ? ADMIN : CLIENTE;
  const pantalla = (r.startsWith('/admin') || r.startsWith('/cliente')) && ctx.estado ? buscar(tabla, r) : null;
  if (!pantalla) return <><PageHeader titulo="Pantalla no encontrada" /><SinPermiso texto="Esta pantalla no existe." inicio={ctx.estado === 'super_admin' ? '/admin/clientes' : '/cliente/inicio'} /></>;
  return <><ProximoSprint />{pantalla}</>;
}
