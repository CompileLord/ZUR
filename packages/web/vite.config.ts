import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': process.env.ZUR_API_PROXY_TARGET || 'http://localhost:3001',
    },
  },
  build: {
    target: 'es2022',
  },
});
