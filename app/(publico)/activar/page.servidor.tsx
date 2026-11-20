import { PantallaActivar } from '@/components/portal/activar';

export const dynamic = 'force-dynamic';
// El enlace lleva el token de la invitación: sin Referer, sin caché y sin indexar.
export const metadata = { title: 'Activar cuenta · Portal de clientes Websourcing', referrer: 'no-referrer' as const, robots: { index: false, follow: false } };

export default function Page() {
  return <PantallaActivar />;
}
