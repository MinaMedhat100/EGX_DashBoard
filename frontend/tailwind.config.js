/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0d0b1e',
          card: '#12102a',
          'card-hover': '#1a1833',
        },
        accent: {
          purple: '#7c3aed',
          'purple-lt': '#a855f7',
          cyan: '#06b6d4',
          magenta: '#ec4899',
          teal: '#14b8a6',
        },
        txt: {
          primary: '#f1f5f9',
          secondary: '#94a3b8',
        },
        status: {
          red: '#ef4444',
          orange: '#f97316',
          yellow: '#eab308',
          green: '#22c55e',
          purple: '#a855f7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(124, 58, 237, 0.25)',
        'glow-lg': '0 0 40px rgba(124, 58, 237, 0.35)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'flash-green': {
          '0%': { backgroundColor: 'rgba(34,197,94,0.35)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'flash-red': {
          '0%': { backgroundColor: 'rgba(239,68,68,0.35)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
        'flash-green': 'flash-green 1s ease-out',
        'flash-red': 'flash-red 1s ease-out',
        'fade-in': 'fade-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
