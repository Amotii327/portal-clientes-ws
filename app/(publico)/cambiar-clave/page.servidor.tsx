import { PantallaCambiarClave } from '@/components/portal/entrada';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cambiar contraseña · Portal de clientes Websourcing', robots: { index: false, follow: false } };

export default function Page() {
  return <PantallaCambiarClave />;
}
