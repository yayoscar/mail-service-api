import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// API started with `npm run start:dev` in the repository root
const API = 'http://localhost:3002';

export default defineConfig({
  base: '/admin/',
  plugins: [vue(), tailwindcss()],
  build: {
    // Served by NestJS from dist/admin-ui, next to the compiled API
    outDir: '../dist/admin-ui',
    emptyOutDir: true,
  },
  server: {
    // Same origin in development too, so the session cookie behaves as in production
    proxy: {
      '/admin-session': API,
      '/systems': API,
      '/mailboxes': API,
    },
  },
});
