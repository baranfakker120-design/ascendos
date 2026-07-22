import type { Config } from 'tailwindcss';

/**
 * Design-Tokens laufen über CSS-Variablen (src/index.css), damit
 * organizations.branding sie später zur Laufzeit überschreiben kann
 * (White-Label, ADR-002/012) — ohne Rebuild.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-ink': 'rgb(var(--color-primary-ink) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-deep': 'rgb(var(--color-accent-deep) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
