'use client';
import * as React from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Clave, EntradaLayout } from '@/screens/entrada';
import { Enlace } from '@/lib/router';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { aceptarInvitacion, politicaVigente } from '@/lib/portal/acciones';
import { codigoDeError, mensajeDeError } from '@/lib/portal/errores';
import { CLAVE_MINIMA, errorDeClave, mensajeDeAuth } from '@/lib/app/auth-errores';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Paso = 'cargando' | 'sin_enlace' | 'crear' | 'confirmar_correo' | 'completar';

function PoliticaDatos({ version }: { version: string }) {
  return (
    <details className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Leer la política de tratamiento de datos <span className="font-normal text-muted-foreground">(versión {version})</span></summary>
      <div className="mt-3 space-y-2 text-muted-foreground">
        <p>Websourcing trata tus datos personales (nombre, correo, celular y el uso que haces del portal) solo para darte acceso y atender tu proyecto, de acuerdo con la Ley 1581 de 2012 de Colombia.</p>
        <p>Usamos proveedores tecnológicos externos para guardar y procesar la información. No vendemos tus datos.</p>
        <p>Puedes pedir en cualquier momento conocer, corregir o eliminar tus datos escribiendo al Equipo Websourcing.</p>
      </div>
    </details>
  );
}

/** Activar la cuenta con el enlace de la invitación (/activar?token=...). */
export function PantallaActivar() {
  const [paso, setPaso] = React.useState<Paso>('cargando');
  const token = React.useRef<string>('');
  const [version, setVersion] = React.useState('');
  const [errCarga, setErrCarga] = React.useState('');
  const [correoSesion, setCorreoSesion] = React.useState('');
  // paso crear
  const [modo, setModo] = React.useState<'crear' | 'entrar'>('crear');
  const [correo, setCorreo] = React.useState('');
  const [c1, setC1] = React.useState('');
  const [c2, setC2] = React.useState('');
  // paso completar
  const [nombre, setNombre] = React.useState('');
  const [celular, setCelular] = React.useState('');
  const [acepto, setAcepto] = React.useState(false);
  const [intento, setIntento] = React.useState(false);
  const [error, setError] = React.useState('');
  const [yaMiembro, setYaMiembro] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  const cargar = React.useCallback(async () => {
    setErrCarga('');
    token.current = new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
    if (!token.current) { setPaso('sin_enlace'); return; }
    const c = crearClienteNavegador();
    const [pol, ses] = await Promise.all([politicaVigente(c), c.auth.getUser()]);
    if (pol.error || !pol.data) { setErrCarga('No pudimos cargar la política de datos. Intenta de nuevo.'); setPaso('crear'); return; }
    setVersion(pol.data as string);
    if (ses.data.user) { setCorreoSesion(ses.data.user.email ?? ''); setPaso('completar'); } else setPaso('crear');
  }, []);
  React.useEffect(() => { void cargar(); }, [cargar]);

  const crearCuenta = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntento(true); setError('');
    if (!CORREO.test(correo.trim()) || errorDeClave(c1) || (modo === 'crear' && c1 !== c2)) return;
    setEnviando(true);
    const c = crearClienteNavegador();
    if (modo === 'entrar') {
      const { data, error: err } = await c.auth.signInWithPassword({ email: correo.trim(), password: c1 });
      setEnviando(false);
      if (err) { setError(mensajeDeAuth(err)); return; }
      setCorreoSesion(data.user?.email ?? correo.trim()); setIntento(false); setPaso('completar');
      return;
    }
    const { data, error: err } = await c.auth.signUp({ email: correo.trim(), password: c1, options: { emailRedirectTo: window.location.href } });
    setEnviando(false);
    if (err) {
      if (err.code === 'user_already_exists') setModo('entrar');
      setError(mensajeDeAuth(err));
      return;
    }
    setIntento(false);
    if (data.session) { setCorreoSesion(correo.trim()); setPaso('completar'); } else setPaso('confirmar_correo');
  };

  const yaConfirme = async () => {
    setError(''); setEnviando(true);
    const { data, error: err } = await crearClienteNavegador().auth.signInWithPassword({ email: correo.trim(), password: c1 });
    setEnviando(false);
    if (err) { setError(mensajeDeAuth(err)); return; }
    setCorreoSesion(data.user?.email ?? correo.trim()); setPaso('completar');
  };

  const salirDeEstaCuenta = async () => {
    await crearClienteNavegador().auth.signOut();
    setCorreoSesion(''); setError(''); setPaso('crear');
  };

  const completar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntento(true); setError('');
    const celularOk = !celular.trim() || /^\+?[\d\s-]{7,15}$/.test(celular.trim());
    if (nombre.trim().length < 2 || !celularOk || !acepto) return;
    setEnviando(true);
    const c = crearClienteNavegador();
    const { error: err } = await aceptarInvitacion(c, { p_token: token.current, p_version_politica: version, p_nombre: nombre.trim(), p_celular: celular.trim() || null });
    if (err) {
      setEnviando(false);
      const cod = codigoDeError(err);
      setYaMiembro(cod === 'ya_es_miembro');
      if (cod === 'politica_version_invalida') void cargar();
      setError(mensajeDeError(err));
      return;
    }
    window.location.assign('/'); // el servidor decide: código adicional (2FA) o inicio
  };

  const errCorreo = intento && !CORREO.test(correo.trim()) ? 'Escribe un correo válido.' : '';
  const errClave = intento ? errorDeClave(c1) : '';
  const errIgual = intento && modo === 'crear' && c1 !== c2 ? 'Las contraseñas no coinciden.' : '';

  return (
    <EntradaLayout>
      {paso === 'cargando' && <div role="status" className="space-y-3"><div className="skeleton h-8 w-2/3" /><div className="skeleton h-40" /><span className="sr-only">Cargando…</span></div>}

      {paso === 'sin_enlace' && (
        <div>
          <h2 className="text-display-lg">Este enlace no es válido</h2>
          <p className="mt-2 text-muted-foreground">Para activar tu cuenta necesitas abrir el enlace completo del correo de invitación. Los enlaces duran 7 días.</p>
          <Alert variant="warning" className="mt-6" title="¿Qué hago ahora?">Pídele al administrador de tu empresa que te envíe una invitación nueva. Si no sabes quién fue, escríbenos y te ayudamos.</Alert>
          <Button className="mt-6" variant="outline" asChild><Enlace to="/entrar"><ArrowLeft />Ir a entrar</Enlace></Button>
        </div>
      )}

      {paso === 'crear' && (
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-primary-text">Invitación</p>
          <h2 className="mt-1 text-display-lg">{modo === 'crear' ? 'Activa tu cuenta' : 'Entra para activar tu cuenta'}</h2>
          <p className="mt-2 text-muted-foreground">{modo === 'crear' ? 'Escribe el correo al que llegó la invitación y crea tu contraseña. El enlace vence a los 7 días.' : 'Ese correo ya tiene una cuenta. Entra con tu contraseña y seguimos.'}</p>
          <form className="mt-6 space-y-4" onSubmit={crearCuenta} noValidate>
            {errCarga && <Alert variant="danger" title="Algo falló">{errCarga}</Alert>}
            {error && <Alert variant="danger" title="No pudimos continuar">{error}</Alert>}
            <Field label="Correo" htmlFor="inv-correo" hint="Es el correo al que llegó la invitación." error={errCorreo}><Input id="inv-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="username" aria-invalid={!!errCorreo} /></Field>
            <Clave id="inv-c1" label={modo === 'crear' ? 'Crea tu contraseña' : 'Tu contraseña'} hint={modo === 'crear' ? `Mínimo ${CLAVE_MINIMA} caracteres. No uses una contraseña que ya hayas usado en otro sitio.` : undefined} value={c1} onChange={setC1} error={errClave} autoComplete={modo === 'crear' ? 'new-password' : 'current-password'} />
            {modo === 'crear' && <Clave id="inv-c2" label="Repite tu contraseña" value={c2} onChange={setC2} error={errIgual} autoComplete="new-password" />}
            <Button type="submit" size="lg" className="w-full" disabled={enviando}>{enviando ? 'Un momento…' : modo === 'crear' ? 'Continuar' : 'Entrar y continuar'}</Button>
            <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => { setModo(modo === 'crear' ? 'entrar' : 'crear'); setError(''); setIntento(false); }}>{modo === 'crear' ? 'Ya tengo una cuenta: entrar' : 'Crear una cuenta nueva'}</button>
          </form>
        </div>
      )}

      {paso === 'confirmar_correo' && (
        <div>
          <h2 className="text-display-lg">Confirma tu correo</h2>
          <p className="mt-2 text-muted-foreground">Te enviamos un mensaje a <strong className="text-foreground">{correo.trim()}</strong>. Ábrelo y toca el botón de confirmar: te traerá de vuelta aquí para terminar.</p>
          {error && <Alert variant="danger" className="mt-4" title="Todavía no">{error}</Alert>}
          <Button className="mt-6 w-full" size="lg" onClick={() => void yaConfirme()} disabled={enviando}>Ya confirmé mi correo</Button>
        </div>
      )}

      {paso === 'completar' && (
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-primary-text">Último paso</p>
          <h2 className="mt-1 text-display-lg">Cuéntanos quién eres</h2>
          <p className="mt-2 text-muted-foreground">Estás activando la cuenta de <strong className="text-foreground">{correoSesion}</strong>. <button type="button" className="text-primary-text underline" onClick={() => void salirDeEstaCuenta()}>¿No eres tú?</button></p>
          <form className="mt-6 space-y-4" onSubmit={completar} noValidate>
            {error && (
              <Alert variant="danger" title="No pudimos activar tu cuenta" action={yaMiembro ? <Button size="sm" variant="outline" onClick={() => window.location.assign('/')}>Ir al portal</Button> : undefined}>{error}</Alert>
            )}
            <Field label="Nombre completo" htmlFor="inv-nombre" error={intento && nombre.trim().length < 2 ? 'Escribe tu nombre.' : undefined}><Input id="inv-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={120} /></Field>
            <Field label="Celular (opcional)" htmlFor="inv-celular" error={intento && celular.trim() && !/^\+?[\d\s-]{7,15}$/.test(celular.trim()) ? 'Escribe solo números, por ejemplo 300 123 4567.' : undefined}><Input id="inv-celular" type="tel" value={celular} onChange={(e) => setCelular(e.target.value)} autoComplete="tel" inputMode="tel" /></Field>
            <PoliticaDatos version={version} />
            <div>
              <Checkbox id="inv-acepto" checked={acepto} onChange={setAcepto} label={<>Acepto la política de tratamiento de datos (Ley 1581 de 2012). Websourcing usa proveedores tecnológicos externos para guardar y procesar la información.</>} />
              {intento && !acepto && <p className="mt-1.5 text-xs text-danger" role="alert">Debes aceptar la política de datos para continuar.</p>}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={enviando}><ShieldCheck />{enviando ? 'Activando…' : 'Activar mi cuenta'}</Button>
          </form>
        </div>
      )}
    </EntradaLayout>
  );
}
