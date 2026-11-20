import type { Config } from 'tailwindcss';

/** Todos los colores salen de variables CSS (app/globals.css). Para ajustar la marca
 *  o el gusto del dueño, se cambian ahí; ninguna pantalla usa colores sueltos. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './screens/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: token('background'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        foreground: token('foreground'),
        muted: token('muted'),
        'muted-foreground': token('muted-foreground'),
        primary: token('primary'),
        'primary-foreground': token('primary-foreground'),
        'primary-text': token('primary-text'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        info: token('info'),
        ring: token('ring'),
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { sm: 'var(--radius-sm)', DEFAULT: 'var(--radius)', md: 'var(--radius)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)' },
      fontSize: {
        'display-xl': ['clamp(2rem, 4vw + 1rem, 3.25rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(1.625rem, 2vw + 1rem, 2.25rem)', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
        'display-md': ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      boxShadow: { card: 'var(--shadow-card)' },
    },
  },
  plugins: [],
};
export default config;
