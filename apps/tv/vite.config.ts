import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: '/tv/',
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 52'],
    }),
  ],
  build: {
    outDir: 'dist',
  },
});