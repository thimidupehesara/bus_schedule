import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Target Chrome 109 so the output runs on the WebView used in Android
    // boxes with Chrome 119 engine. Chrome 109 is a safe conservative floor
    // that covers all ES2022 features available in Chrome 119.
    target: 'chrome109',
    outDir: 'dist',
  },
});

