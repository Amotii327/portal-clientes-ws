'use client';
import * as React from 'react';
import { QrCode, ShieldCheck } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { EntradaLayout } from '@/screens/entrada';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { miContexto } from '@/lib/portal/acciones';
import { necesita2FA } from '@/lib/app/rutas';
import { mensajeDeAuth } from '@/lib/app/auth-errores';
import { cerrarSesion } from '@/lib/app/sesion';

type Paso = 'cargando' | 'explicar' | 'escanear' | 'verificar' | 'error';

/** Código adicional (2FA con app del celular): primera vez se configura; después solo se escribe el código. */
export function PantallaVerificar() {
  const [paso, setPaso] = React.useState<Paso>('cargando');
  const [factorId, setFactorId] = React.useState('');
  const [qr, setQr] = React.useState('');
  const [secreto, setSecreto] = React.useState('');
  const [codigo, setCodigo] = React.useState('');
  const [error, setError] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);

  const iniciar = React.useCallback(async () => {
    const c = crearClienteNavegador();
    const { data: ctx, error: e1 } = await miContexto(c);
    if (e1 || !ctx) { setPaso('error'); return; }
    if (ctx.estado === 'sin_sesion') { window.location.assign('/entrar'); return; }
    if (!necesita2FA(ctx.estado)) { window.location.assign('/'); return; }
    const { data, error: e2 } = await c.auth.mfa.listFactors();
    if (e2) { setPaso('error'); return; }
    const verificado = data.totp[0];
    if (verificado) { setFactorId(verificado.id); setPaso('verificar'); } else setPaso('explicar');
  }, []);
  React.useEffect(() => { void iniciar(); }, [iniciar]);

  const empezar = async () => {
    setError(''); setEnviando(true);
    const c = crearClienteNavegador();
    // Si quedó una configuración a medias de un intento anterior, se limpia para empezar de cero.
    const { data: lista } = await c.auth.mfa.listFactors();
    for (const f of lista?.all ?? []) if (f.status === 'unverified') await c.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: err } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Portal Websourcing' });
    setEnviando(false);
    if (err || !data) { setError(mensajeDeAuth(err)); return; }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecreto(data.totp.secret); setPaso('escanear');
  };

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo.length !== 6) { setError('Escribe los 6 dígitos del código.'); return; }
    setError(''); setEnviando(true);
    const c = crearClienteNavegador();
    const { error: err } = await c.auth.mfa.challengeAndVerify({ factorId, code: codigo });
    if (err) { setEnviando(false); setCodigo(''); setError(mensajeDeAuth({ ...err, code: err.code ?? 'mfa_verification_failed' })); return; }
    window.location.assign('/'); // el servidor confirma el nivel de seguridad (aal2) y te lleva a tu inicio
  };

  const formulario = (
    <form className="mt-6 space-y-4" onSubmit={verificar} noValidate>
      {error && <Alert variant="danger" title="Código no válido">{error}</Alert>}
      <Field label="Código de 6 dígitos" htmlFor="codigo">
        <Input id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '')); setError(''); }} aria-invalid={!!error} className="h-14 text-center font-display text-2xl tracking-[0.5em]" placeholder="······" />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={enviando}>{enviando ? 'Verificando…' : 'Verificar y entrar'}</Button>
    </form>
  );
  const salir = <div className="mt-4 text-sm"><button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void cerrarSesion()}>Cerrar sesión</button></div>;

  return (
    <EntradaLayout>
      {paso === 'cargando' && <div role="status" className="space-y-3"><div className="skeleton h-8 w-2/3" /><div className="skeleton h-40" /><span className="sr-only">Cargando…</span></div>}
      {paso === 'error' && (
        <div>
          <h2 className="text-display-lg">No pudimos cargar esta pantalla</h2>
          <p className="mt-2 text-muted-foreground">Algo salió mal de nuestro lado. Intenta de nuevo; si sigue igual, escríbenos.</p>
          <Button className="mt-6" onClick={() => { setPaso('cargando'); void iniciar(); }}>Reintentar</Button>
          {salir}
        </div>
      )}
      {paso === 'explicar' && (
        <div>
          <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary-text"><QrCode className="size-7" /></div>
          <h2 className="text-display-lg">Activa tu código de seguridad</h2>
          <p className="mt-2 text-muted-foreground">Para proteger tu cuenta, cada vez que entres te pediremos un código de 6 dígitos que genera una app de verificación en tu celular. Solo lo configuras una vez.</p>
          {error && <Alert variant="danger" className="mt-4" title="No pudimos empezar">{error}</Alert>}
          <Button className="mt-6 w-full" size="lg" onClick={() => void empezar()} disabled={enviando}>{enviando ? 'Preparando…' : 'Empezar'}</Button>
          {salir}
        </div>
      )}
      {paso === 'escanear' && (
        <div>
          <h2 className="text-display-lg">Escanea el código</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Abre una app de verificación en tu celular (por ejemplo Google Authenticator o Authy).</li>
            <li>Escanea este código QR.</li>
            <li>Escribe aquí el código de 6 dígitos que te muestra.</li>
          </ol>
          <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Código QR para tu app de verificación" className="size-44 shrink-0 rounded-lg bg-white p-2" />
            <div className="min-w-0 text-sm text-muted-foreground">
              <p>¿No puedes escanear? Escribe esta clave en tu app:</p>
              <p className="mt-1 break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-xs text-foreground" data-testid="clave-2fa">{secreto}</p>
              <p className="mt-2 text-xs">Guárdala en un lugar seguro: sirve para recuperar el acceso si cambias de celular.</p>
            </div>
          </div>
          {formulario}
          {salir}
        </div>
      )}
      {paso === 'verificar' && (
        <div>
          <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary-text"><ShieldCheck className="size-7" /></div>
          <h2 className="text-display-lg">Código de verificación</h2>
          <p className="mt-2 text-muted-foreground">Abre la app de verificación de tu celular y escribe el código de 6 dígitos.</p>
          {formulario}
          {salir}
        </div>
      )}
    </EntradaLayout>
  );
}
