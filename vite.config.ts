import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // HMR can be disabled (e.g. when an external tool edits files) with DISABLE_HMR=true.
    hmr: process.env.DISABLE_HMR !== 'true'
  },
  build: {
    chunkSizeWarningLimit: 4000
  }
});
