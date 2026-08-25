/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'rgb(var(--bg) / <alpha-value>)',
          card: 'rgb(var(--card) / <alpha-value>)',
          'card-hover': 'rgb(var(--card-hover) / <alpha-value>)',
        },
        surface: 'rgb(var(--surface) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        accent: {
          purple: 'rgb(var(--accent-deep) / <alpha-value>)',
          'purple-lt': 'rgb(var(--accent) / <alpha-value>)',
          cyan: 'rgb(var(--accent-2) / <alpha-value>)',
          magenta: 'rgb(var(--accent) / <alpha-value>)',
          teal: 'rgb(var(--accent-2) / <alpha-value>)',
        },
        txt: {
          primary: 'rgb(var(--text) / <alpha-value>)',
          secondary: 'rgb(var(--muted) / <alpha-value>)',
        },
        status: {
          red: 'rgb(var(--status-red) / <alpha-value>)',
          orange: 'rgb(var(--status-orange) / <alpha-value>)',
          yellow: 'rgb(var(--status-yellow) / <alpha-value>)',
          green: 'rgb(var(--status-green) / <alpha-value>)',
          purple: 'rgb(var(--status-purple) / <alpha-value>)',
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
