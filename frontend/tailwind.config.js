/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)',
        },
        border: {
          DEFAULT: 'var(--border)',
          hover: 'var(--border-hover)',
          active: 'var(--border-active)',
        },
        txt: {
          primary: 'var(--txt-primary)',
          secondary: 'var(--txt-secondary)',
          muted: 'var(--txt-muted)',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          muted: '#1e3a5f',
        },
        status: {
          ok: '#22c55e',
          warn: '#eab308',
          error: '#ef4444',
          info: '#3b82f6',
          critical: '#a855f7',
        },
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '3px',
        md: '4px',
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '0.85rem' }],
      },
    },
  },
  plugins: [],
};
