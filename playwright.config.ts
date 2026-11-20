import { defineConfig } from '@playwright/test';

/**
 * Pruebas de la app real con Supabase SIMULADO (tests/mock-supabase/servidor.mjs): no hay Supabase real aquí.
 * - Servidor A (3100): modo desarrollo con MOSTRAR_ENLACE_INVITACION_DEV=true (el super admin ve el enlace).
 * - Servidor B (3101): igual pero SIN esa variable: el enlace/token no puede llegar al navegador.
 * El navegador es el Chrome instalado en el equipo (no se descargan navegadores).
 */
// PW_PUERTO (y el siguiente para el servidor B) y PW_MOCK_PUERTO permiten correr sin chocar con otros frentes.
const PA = process.env.PW_PUERTO || process.env.PUERTO_APP || '3100';
const PB = process.env.PW_PUERTO ? String(Number(process.env.PW_PUERTO) + 1) : process.env.PUERTO_APP_B || '3101';
const PM = process.env.PW_MOCK_PUERTO || process.env.MOCK_PUERTO || '54399';
process.env.MOCK_PUERTO = PM;
const MOCK = `http://127.0.0.1:${PM}`;
const comun = {
  NEXT_OUTPUT: 'server',
  NEXT_PUBLIC_SUPABASE_URL: MOCK,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'llave-publica-de-prueba',
  NEXT_TELEMETRY_DISABLED: '1',
};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1, // el Supabase simulado guarda estado compartido
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    launchOptions: { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] },
    trace: 'off',
    locale: 'es-CO',
  },
  projects: [
    { name: 'escritorio', testIgnore: /capturas|sin-enlace/, use: { baseURL: `http://127.0.0.1:${PA}`, viewport: { width: 1440, height: 900 } } },
    { name: 'sin-enlace', testMatch: /sin-enlace/, use: { baseURL: `http://127.0.0.1:${PB}`, viewport: { width: 1440, height: 900 } } },
    { name: 'capturas-1440', testMatch: /capturas/, use: { baseURL: `http://127.0.0.1:${PA}`, viewport: { width: 1440, height: 900 } } },
    { name: 'capturas-390', testMatch: /capturas/, use: { baseURL: `http://127.0.0.1:${PA}`, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
  webServer: [
    { command: 'node tests/mock-supabase/servidor.mjs', url: `${MOCK}/__estado`, reuseExistingServer: true, timeout: 20_000 },
    {
      command: `npx next dev -p ${PA}`, url: `http://127.0.0.1:${PA}/entrar`, reuseExistingServer: true, timeout: 180_000,
      env: { ...comun, NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PA}`, MOSTRAR_ENLACE_INVITACION_DEV: 'true', NEXT_DIST_DIR: process.env.DIST_A || (PA === '3100' ? '.next-servidor' : `.next-servidor-${PA}`) },
    },
    {
      command: `npx next dev -p ${PB}`, url: `http://127.0.0.1:${PB}/entrar`, reuseExistingServer: true, timeout: 180_000,
      env: { ...comun, NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PB}`, NEXT_DIST_DIR: process.env.DIST_B || (PB === '3101' ? '.next-servidor-b' : `.next-servidor-${PB}`) },
    },
  ],
});
