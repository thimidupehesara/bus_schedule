import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/tv/',
  plugins: [react()],
  build: {
    // The TV runs Chrome 101 inside a Trusted Web Activity.
    target: 'chrome101',
    outDir: 'dist',
  },
});

