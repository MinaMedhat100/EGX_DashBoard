import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// Frontend dev server proxies /api to the Express backend (port 3001).
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // Bind 0.0.0.0 so the dashboard is reachable from another device on the same LAN
    // (phone -> http://<this-machine-ip>:5173). /api is still proxied locally to 3001,
    // so the Express backend and the FastAPI bridge stay off the network.
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
