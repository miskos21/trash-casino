import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), '').VITE_BACKEND_TARGET ?? 'http://localhost:8080';
  return {
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target },
      '/ws': { target, ws: true },
    },
  },
  };
});
