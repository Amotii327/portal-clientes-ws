'use client';
import * as React from 'react';
import { ArrowLeft, CheckCircle2, MailCheck } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Clave, EntradaLayout } from '@/screens/entrada';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { CLAVE_MINIMA, errorDeClave, mensajeDeAuth } from '@/lib/app/auth-errores';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Iniciar sesión con correo y contraseña. El código adicional (2FA) lo pide la zona privada si hace falta. */
export function PantallaEntrar() {
  const [correo, setCorreo] = React.useState('');
  const [clave, setClave] = React.useState('');
  const [errClave, setErrClave] = React.useState('');
  const [errCorreo, setErrCorreo] = React.useState('');
  const [error, setError] = React.useState('');
  const [salio, setSalio] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  React.useEffect(() => { setSalio(new URLSearchParams(window.location.search).get('salir') === '1'); }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const bad = !CORREO.test(correo.trim());
    setErrCorreo(bad ? 'Escribe un correo válido.' : '');
    setErrClave(clave ? '' : 'Escribe tu contraseña.');
    if (bad || !clave) return;
    setEnviando(true);
    const { error: err } = await crearClienteNavegador().auth.signInWithPassword({ email: correo.trim(), password: clave });
    if (err) { setError(mensajeDeAuth(err)); setEnviando(false); return; }
    window.location.assign('/'); // recarga completa: el servidor lee la sesión nueva y decide a dónde vas
  };

  return (
    <EntradaLayout>
      <div>
        <h2 className="text-display-lg">Entrar</h2>
        <p className="mt-2 text-muted-foreground">Usa el correo con el que te invitamos.</p>
        <form className="mt-6 space-y-4" onSubmit={enviar} noValidate>
          {salio && !error && <Alert variant="success" title="Cerraste sesión">Tu sesión se cerró. Cuando quieras, vuelve a entrar.</Alert>}
          {error && <Alert variant="danger" title="No pudimos entrar">{error}</Alert>}
          <Field label="Correo" htmlFor="correo" error={errCorreo}><Input id="correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="username" aria-invalid={!!errCorreo} /></Field>
          <Clave id="clave" label="Contraseña" value={clave} onChange={(v) => { setClave(v); setErrClave(''); }} error={errClave} autoComplete="current-password" />
          <Button type="submit" size="lg" className="w-full" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</Button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <Enlace to="/recuperar" className="text-primary-text hover:underline">Olvidé mi contraseña</Enlace>
            <span className="text-muted-foreground">¿Tienes una invitación? Abre el enlace del correo.</span>
          </div>
        </form>
      </div>
    </EntradaLayout>
  );
}

/** Pedir el correo de cambio de contraseña. Siempre responde igual, exista o no el correo. */
export function PantallaRecuperar() {
  const [enviado, setEnviado] = React.useState(false);
  const [correo, setCorreo] = React.useState('');
  const [err, setErr] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!CORREO.test(correo.trim())) { setErr('Escribe un correo válido.'); return; }
    setErr(''); setEnviando(true);
    const { error } = await crearClienteNavegador().auth.resetPasswordForEmail(correo.trim(), { redirectTo: `${window.location.origin}/cambiar-clave` });
    setEnviando(false);
    if (error && (error.status === 429 || error.code?.startsWith('over_'))) { setErr(mensajeDeAuth(error)); return; }
    setEnviado(true); // aunque haya otro error, no revelamos si el correo existe
  };
  return (
    <EntradaLayout>
      {enviado ? (
        <div>
          <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary-text"><MailCheck className="size-7" /></div>
          <h2 className="text-display-lg">Revisa tu correo</h2>
          <p className="mt-2 text-muted-foreground">Si <strong className="text-foreground">{correo.trim()}</strong> está registrado, te enviamos un enlace para crear una contraseña nueva. Llega en unos minutos.</p>
          <Button className="mt-6" variant="outline" asChild><Enlace to="/entrar"><ArrowLeft />Volver a entrar</Enlace></Button>
        </div>
      ) : (
        <div>
          <h2 className="text-display-lg">Recuperar contraseña</h2>
          <p className="mt-2 text-muted-foreground">Escribe tu correo y te enviamos un enlace para cambiarla. No necesitas ayuda de nadie.</p>
          <form className="mt-6 space-y-4" onSubmit={enviar} noValidate>
            <Field label="Correo" htmlFor="rec-correo" error={err}><Input id="rec-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tucorreo@empresa.co" aria-invalid={!!err} /></Field>
            <Button type="submit" size="lg" className="w-full" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace'}</Button>
            <Button variant="ghost" className="w-full" asChild><Enlace to="/entrar"><ArrowLeft />Volver</Enlace></Button>
          </form>
        </div>
      )}
    </EntradaLayout>
  );
}

/** Crear una contraseña nueva: llegas con el enlace del correo (o con tu sesión abierta, desde el menú). */
export function PantallaCambiarClave() {
  const [estado, setEstado] = React.useState<'verificando' | 'listo' | 'sin_enlace' | 'hecho'>('verificando');
  const [c1, setC1] = React.useState('');
  const [c2, setC2] = React.useState('');
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  React.useEffect(() => {
    let vivo = true;
    // getSession espera a que termine el intercambio del código del enlace, si venía uno.
    crearClienteNavegador().auth.getSession().then(({ data }) => { if (vivo) setEstado(data.session ? 'listo' : 'sin_enlace'); });
    return () => { vivo = false; };
  }, []);
  const errA = intento ? errorDeClave(c1) : '';
  const errB = intento && c1 !== c2 ? 'Las contraseñas no coinciden.' : '';
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntento(true); setError('');
    if (c1.length < CLAVE_MINIMA || c1 !== c2) return;
    setEnviando(true);
    const { error: err } = await crearClienteNavegador().auth.updateUser({ password: c1 });
    setEnviando(false);
    if (err) { setError(mensajeDeAuth(err)); return; }
    setEstado('hecho');
  };
  return (
    <EntradaLayout>
      {estado === 'verificando' && <div role="status" className="space-y-3"><div className="skeleton h-8 w-2/3" /><div className="skeleton h-24" /><span className="sr-only">Cargando…</span></div>}
      {estado === 'sin_enlace' && (
        <div>
          <h2 className="text-display-lg">Este enlace no sirve</h2>
          <p className="mt-2 text-muted-foreground">El enlace para cambiar la contraseña venció o ya se usó. Pide uno nuevo: toma un minuto.</p>
          <Button className="mt-6" asChild><Enlace to="/recuperar">Pedir un enlace nuevo</Enlace></Button>
        </div>
      )}
      {estado === 'hecho' && (
        <div>
          <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary-text"><CheckCircle2 className="size-7" /></div>
          <h2 className="text-display-lg">Contraseña cambiada</h2>
          <p className="mt-2 text-muted-foreground">Listo. Desde ahora entras con tu contraseña nueva.</p>
          <Button className="mt-6" onClick={() => window.location.assign('/')}>Ir al portal</Button>
        </div>
      )}
      {estado === 'listo' && (
        <div>
          <h2 className="text-display-lg">Crea tu contraseña nueva</h2>
          <p className="mt-2 text-muted-foreground">Usa mínimo {CLAVE_MINIMA} caracteres. Mejor una frase larga que solo tú recuerdes.</p>
          <form className="mt-6 space-y-4" onSubmit={enviar} noValidate>
            {error && <Alert variant="danger" title="No pudimos cambiarla">{error}</Alert>}
            <Clave id="nueva-1" label="Contraseña nueva" hint={`Mínimo ${CLAVE_MINIMA} caracteres.`} value={c1} onChange={setC1} error={errA} autoComplete="new-password" />
            <Clave id="nueva-2" label="Repite la contraseña" value={c2} onChange={setC2} error={errB} autoComplete="new-password" />
            <Button type="submit" size="lg" className="w-full" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar contraseña'}</Button>
          </form>
        </div>
      )}
    </EntradaLayout>
  );
}
