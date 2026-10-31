import { defineConfig } from 'vite';

const apiTarget = process.env.ZUR_API_PROXY_TARGET || 'http://localhost:3001';
// Keep the browser's Host so the API's same-origin CSRF check sees the dev origin, as behind Caddy.
const proxyRoute = { target: apiTarget, changeOrigin: false };

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': proxyRoute,
      '/mcp': proxyRoute,
    },
  },
  build: {
    target: 'es2022',
  },
});
