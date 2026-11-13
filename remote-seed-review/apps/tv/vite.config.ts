import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const buildId = Date.now().toString();

function writeBuildVersion(): Plugin {
  return {
    name: 'write-build-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }),
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/tv/version.json' || req.url === '/version.json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(JSON.stringify({ buildId }));
          return;
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/tv/',
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  plugins: [react(), writeBuildVersion()],
  build: {
    // The TV runs Chrome 101 inside a Trusted Web Activity.
    target: 'chrome101',
    outDir: 'dist',
  },
});

