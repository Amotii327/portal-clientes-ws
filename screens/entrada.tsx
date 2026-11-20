'use client';
import * as React from 'react';
import { ArrowLeft, Eye, EyeOff, MailCheck, ShieldCheck, TimerReset } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { ALTO_PANTALLA, Logo } from '@/components/shell/shell';
import { cn } from '@/lib/utils';
import { Enlace, ir } from '@/lib/router';
import { useStore } from '@/lib/store';

export function EntradaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn('grid lg:grid-cols-2', ALTO_PANTALLA)}>
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex">
        <div className="pointer-events-none absolute -left-24 top-1/3 size-96 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <Logo />
        <div className="relative">
          <h1 className="text-display-xl">Tu proyecto, <span className="text-primary-text">a la vista.</span></h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">Entra y mira en qué va, qué tienes que aprobar, cuánto has pagado y qué has pedido. Sin preguntar por correo ni por chat.</p>
        </div>
        <p className="relative text-sm text-muted-foreground">Equipo Websourcing</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo className="h-8" /></div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Clave({ id, label, hint, error, value, onChange, autoComplete }: { id: string; label: string; hint?: string; error?: string; value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const [ver, setVer] = React.useState(false);
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="relative">
        <Input id={id} type={ver ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={!!error} className="pr-11" />
        <button type="button" onClick={() => setVer(!ver)} className="absolute right-1 top-1 flex size-8 items-center justify-center rounded text-muted-foreground hover:text-foreground" aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}

export function Login() {
  const { estadoPantalla } = useStore();
  const [correo, setCorreo] = React.useState('administrador@empresa-ejemplo.co');
  const [clave, setClave] = React.useState('');
  const [err, setErr] = React.useState('');
  const bloqueada = estadoPantalla === 'error';
  return (
    <div>
      <h2 className="text-display-lg">Entrar</h2>
      <p className="mt-2 text-muted-foreground">Usa el correo con el que te invitamos.</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (clave.length < 1) { setErr('Escribe tu contraseña.'); return; } ir('/entrada/codigo'); }}>
        {bloqueada && <Alert variant="danger" title="Cuenta frenada por 15 minutos">Fallaste la contraseña 5 veces seguidas. Es una medida de seguridad. Puedes esperar o <a className="text-primary-text underline" href="#/entrada/recuperar">cambiar tu contraseña</a>.</Alert>}
        <Field label="Correo" htmlFor="correo"><Input id="correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="username" /></Field>
        <Clave id="clave" label="Contraseña" value={clave} onChange={(v) => { setClave(v); setErr(''); }} error={err} autoComplete="current-password" />
        <Button type="submit" size="lg" className="w-full" disabled={bloqueada}>Entrar</Button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <Enlace to="/entrada/recuperar" className="text-primary-text hover:underline">Olvidé mi contraseña</Enlace>
          <Enlace to="/entrada/invitacion" className="text-muted-foreground hover:text-foreground">Tengo una invitación</Enlace>
        </div>
      </form>
    </div>
  );
}

export function Invitacion() {
  const { estadoPantalla, empresa, rol } = useStore();
  const [c1, setC1] = React.useState('');
  const [c2, setC2] = React.useState('');
  const [ok, setOk] = React.useState(false);
  const [intento, setIntento] = React.useState(false);
  if (estadoPantalla === 'error') {
    return (
      <div>
        <h2 className="text-display-lg">Esta invitación venció</h2>
        <p className="mt-2 text-muted-foreground">Los enlaces de invitación duran 7 días. Pídele al administrador de tu empresa que te envíe uno nuevo.</p>
        <Alert variant="warning" className="mt-6" title="¿Qué hago ahora?">Escríbele a la persona que te invitó. Si no sabes quién fue, escríbenos y te ayudamos.</Alert>
        <Button className="mt-6" variant="outline" asChild><Enlace to="/entrada/login"><ArrowLeft />Ir a entrar</Enlace></Button>
      </div>
    );
  }
  const errClave = intento && c1.length < 10 ? 'Mínimo 10 caracteres.' : '';
  const errIgual = intento && c1 !== c2 ? 'Las contraseñas no coinciden.' : '';
  const errPol = intento && !ok ? 'Debes aceptar la política de datos para continuar.' : '';
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-widest text-primary-text">Invitación</p>
      <h2 className="mt-1 text-display-lg">Activa tu cuenta</h2>
      <p className="mt-2 text-muted-foreground">Te invitaron a entrar a <strong className="text-foreground">{rol === 'super' ? 'Comercial Ejemplo S.A.S.' : empresa.nombre}</strong> como Equipo del cliente. El enlace vence en 7 días.</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); setIntento(true); if (c1.length >= 10 && c1 === c2 && ok) ir('/entrada/codigo'); }}>
        <Field label="Correo" htmlFor="inv-correo" hint="Es el correo al que llegó la invitación."><Input id="inv-correo" value="operaciones@empresa-ejemplo.co" readOnly disabled /></Field>
        <Clave id="inv-c1" label="Crea tu contraseña" hint="Mínimo 10 caracteres. Revisamos que no sea una contraseña filtrada." value={c1} onChange={setC1} error={errClave} autoComplete="new-password" />
        <Clave id="inv-c2" label="Repite tu contraseña" value={c2} onChange={setC2} error={errIgual} autoComplete="new-password" />
        <div>
          <Checkbox checked={ok} onChange={setOk} label={<>Acepto la <a href="#/entrada/invitacion" className="text-primary-text underline">política de tratamiento de datos</a> (Ley 1581 de 2012). Websourcing usa proveedores tecnológicos externos para guardar y procesar la información.</>} />
          {errPol && <p className="mt-1.5 text-xs text-danger" role="alert">{errPol}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full">Activar mi cuenta</Button>
      </form>
    </div>
  );
}

export function Recuperar() {
  const [enviado, setEnviado] = React.useState(false);
  const [correo, setCorreo] = React.useState('');
  if (enviado) {
    return (
      <div>
        <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary-text"><MailCheck className="size-7" /></div>
        <h2 className="text-display-lg">Revisa tu correo</h2>
        <p className="mt-2 text-muted-foreground">Si <strong className="text-foreground">{correo}</strong> está registrado, te enviamos un enlace para crear una contraseña nueva. Llega en unos minutos.</p>
        <Button className="mt-6" variant="outline" asChild><Enlace to="/entrada/login"><ArrowLeft />Volver a entrar</Enlace></Button>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-display-lg">Recuperar contraseña</h2>
      <p className="mt-2 text-muted-foreground">Escribe tu correo y te enviamos un enlace para cambiarla. No necesitas ayuda de nadie.</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); setEnviado(true); }}>
        <Field label="Correo" htmlFor="rec-correo"><Input id="rec-correo" type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tucorreo@empresa.co" /></Field>
        <Button type="submit" size="lg" className="w-full">Enviar enlace</Button>
        <Button variant="ghost" className="w-full" asChild><Enlace to="/entrada/login"><ArrowLeft />Volver</Enlace></Button>
      </form>
    </div>
  );
}

export function Codigo() {
  const { rol, estadoPantalla } = useStore();
  const [cod, setCod] = React.useState('');
  const [err, setErr] = React.useState('');
  const obligatorio = rol !== 'equipo';
  const inicio = rol === 'super' ? '/admin/panel' : '/cliente/inicio';
  return (
    <div>
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary-text"><ShieldCheck className="size-7" /></div>
      <h2 className="text-display-lg">Código de verificación</h2>
      <p className="mt-2 text-muted-foreground">{obligatorio ? 'Abre la app de verificación de tu celular y escribe el código de 6 dígitos. Es obligatorio para tu cuenta porque ves dinero y apruebas entregas.' : 'Te enviamos un código de 6 dígitos a tu correo. Escríbelo aquí.'}</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (cod.length < 6 || cod === '000000') { setErr('Ese código no es correcto o ya venció. Intenta de nuevo.'); return; } ir(inicio); }}>
        {estadoPantalla === 'error' && <Alert variant="danger" title="Demasiados intentos">Espera 15 minutos para volver a intentarlo.</Alert>}
        <Field label="Código de 6 dígitos" htmlFor="codigo" error={err}>
          <Input id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={cod} onChange={(e) => { setCod(e.target.value.replace(/\D/g, '')); setErr(''); }} aria-invalid={!!err} className="h-14 text-center font-display text-2xl tracking-[0.5em]" placeholder="······" />
        </Field>
        <Button type="submit" size="lg" className="w-full">Verificar y entrar</Button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <button type="button" className="inline-flex items-center gap-1.5 text-primary-text hover:underline"><TimerReset className="size-4" />{obligatorio ? 'Usar un código de respaldo' : 'Reenviar código'}</button>
          <Enlace to="/entrada/login" className="text-muted-foreground hover:text-foreground">Cancelar</Enlace>
        </div>
      </form>
      <Card className="mt-6 p-4 text-sm text-muted-foreground">Para probar, escribe cualquier número de 6 dígitos (000000 simula un error).</Card>
    </div>
  );
}
