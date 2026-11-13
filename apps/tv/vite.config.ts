import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: '/tv/',
  plugins: [
    react(),
    legacy({ targets: ['chrome >= 52'] }),
    {
      name: 'tv-service-worker',
      apply: 'build',
      enforce: 'post',
      // Legacy and modern bundles are written in separate Rollup passes.
      closeBundle() {
        const dist = fileURLToPath(new URL('./dist/', import.meta.url));
        const files = readdirSync(dist, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name !== 'sw.js')
          .map((entry) =>
            join(entry.parentPath, entry.name).slice(dist.length).replaceAll('\\', '/'),
          )
          .sort();
        const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(JSON.stringify(files)).update(source);
        for (const file of files) hash.update(readFileSync(join(dist, file)));
        const cacheName = JSON.stringify('bus-tv-' + hash.digest('hex').slice(0, 16));
        const precache = JSON.stringify(files.map((file) => '/tv/' + file));
        writeFileSync(
          join(dist, 'sw.js'),
          `const CACHE_NAME = ${cacheName};\nconst PRECACHE = ${precache};\n${source}`,
        );
      },
    },
  ],
  build: { target: 'chrome100', outDir: 'dist' },
});
