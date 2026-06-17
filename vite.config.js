import { defineConfig } from 'vite';

// Minimal Vite config. The project is plain ES modules + Three.js — no framework.
export default defineConfig({
  server: {
    host: true,
    port: 3000,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
