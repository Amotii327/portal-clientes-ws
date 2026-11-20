import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';

const display = Poppins({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Portal de clientes · Websourcing',
  description: 'Prototipo navegable del portal de clientes de Websourcing (datos de ejemplo).',
  icons: { icon: './marca/icono.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
