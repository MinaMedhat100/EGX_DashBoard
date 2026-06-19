import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend dev server proxies /api to the Express backend (port 3001).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
