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
          0: '#0a0a0f',
          1: '#111118',
          2: '#1a1a24',
          3: '#23232f',
          4: '#2d2d3a',
        },
        border: {
          DEFAULT: '#2d2d3a',
          hover: '#3d3d4a',
          active: '#5a5a6e',
        },
        txt: {
          primary: '#e8e8ed',
          secondary: '#9898a8',
          muted: '#6a6a7a',
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
