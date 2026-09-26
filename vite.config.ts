import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { serviceWorker } from './sw-plugin';

export default defineConfig({
  // relative paths, so the built game works from any folder or sub-path
  base: './',
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: {
    // HMR can be disabled (e.g. when an external tool edits files) with DISABLE_HMR=true.
    hmr: process.env.DISABLE_HMR !== 'true'
  },
  build: {
    chunkSizeWarningLimit: 4000
  }
});
