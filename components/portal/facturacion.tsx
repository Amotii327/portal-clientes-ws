'use client';
import * as React from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { PageHeader } from '@/components/ds/page';
import { EstadoCargando, EstadoError, SinPermiso } from '@/components/ds/states';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { mensajeDeError } from '@/lib/portal/errores';
import { useCargar } from '@/lib/app/datos';
import { useStore } from '@/lib/store';
import { usePortal } from './contexto';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NIT = /^[0-9A-Za-z.\-]{5,20}$/;

async function leer() {
  const { data, error } = await crearClienteNavegador().from('datos_facturacion').select('razon_social, nit, correo_facturas').maybeSingle();
  if (error) throw error;
  return data;
}

/** Datos de facturación de la empresa. Los edita el admin del cliente; el equipo con "ver dinero" solo los lee. */
export function FacturacionReal() {
  const ctx = usePortal();
  const { avisar } = useStore();
  const esAdmin = ctx.rol === 'admin_cliente';
  const puede = esAdmin || !!ctx.permisos?.ver_dinero;
  const { estado, datos, recargar } = useCargar(leer, []);
  const [f, setF] = React.useState({ razon_social: '', nit: '', correo_facturas: '' });
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);
  React.useEffect(() => { if (datos) setF({ razon_social: datos.razon_social, nit: datos.nit, correo_facturas: datos.correo_facturas }); }, [datos]);

  if (!puede) return <><PageHeader titulo="Datos de facturación" /><SinPermiso texto="El administrador de tu empresa decide quién ve el dinero y la facturación. Si lo necesitas, pídele que te dé acceso." /></>;

  const errRazon = intento && f.razon_social.trim().length < 2 ? 'Escribe la razón social.' : undefined;
  const errNit = intento && !NIT.test(f.nit.trim()) ? 'Escribe un NIT válido, por ejemplo 900123456-7.' : undefined;
  const errCorreo = intento && !CORREO.test(f.correo_facturas.trim()) ? 'Escribe un correo válido.' : undefined;
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntento(true); setError('');
    if (errRazon || errNit || errCorreo || f.razon_social.trim().length < 2 || !NIT.test(f.nit.trim()) || !CORREO.test(f.correo_facturas.trim())) return;
    setGuardando(true);
    const { data, error: err } = await crearClienteNavegador().from('datos_facturacion')
      .update({ razon_social: f.razon_social.trim(), nit: f.nit.trim(), correo_facturas: f.correo_facturas.trim() })
      .eq('empresa_id', ctx.empresa?.id ?? '').select('empresa_id');
    setGuardando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    if (!data || data.length === 0) { setError('No tienes permiso para cambiar estos datos.'); return; }
    setIntento(false); avisar('Datos de facturación guardados.'); recargar(true);
  };

  return (
    <>
      <PageHeader titulo="Datos de facturación" descripcion="Con estos datos preparamos tus facturas. Revísalos: si algo cambia en tu empresa, actualízalo aquí." />
      {estado === 'cargando' && <EstadoCargando />}
      {estado === 'error' && <EstadoError onReintentar={() => recargar()} />}
      {estado === 'ok' && (
        <Card className="max-w-2xl p-5 sm:p-6">
          {!esAdmin && <Alert variant="info" className="mb-4" title="Solo lectura">Solo el administrador de la empresa puede cambiar estos datos.</Alert>}
          {error && <Alert variant="danger" className="mb-4" title="No pudimos guardar">{error}</Alert>}
          <form className="space-y-4" onSubmit={guardar} noValidate>
            <Field label="Razón social" htmlFor="fac-razon" error={errRazon}><Input id="fac-razon" value={f.razon_social} disabled={!esAdmin} onChange={(e) => setF({ ...f, razon_social: e.target.value })} aria-invalid={!!errRazon} maxLength={200} /></Field>
            <Field label="NIT" htmlFor="fac-nit" hint="Con dígito de verificación, por ejemplo 900123456-7." error={errNit}><Input id="fac-nit" value={f.nit} disabled={!esAdmin} onChange={(e) => setF({ ...f, nit: e.target.value })} aria-invalid={!!errNit} maxLength={20} /></Field>
            <Field label="Correo para facturas" htmlFor="fac-correo" error={errCorreo}><Input id="fac-correo" type="email" value={f.correo_facturas} disabled={!esAdmin} onChange={(e) => setF({ ...f, correo_facturas: e.target.value })} aria-invalid={!!errCorreo} /></Field>
            {esAdmin && <div className="flex justify-end"><Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Button></div>}
          </form>
        </Card>
      )}
    </>
  );
}
