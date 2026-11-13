import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/tv/',
  plugins: [
    react(),
    {
      name: 'tv-service-worker',
      apply: 'build',
      enforce: 'post',
      generateBundle(_, bundle) {
        const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
        const publicFiles = (
          existsSync(publicDir)
            ? readdirSync(publicDir, { recursive: true, withFileTypes: true })
            : []
        )
          .filter((entry) => entry.isFile())
          .map((entry) =>
            join(entry.parentPath, entry.name).slice(publicDir.length).replaceAll('\\', '/'),
          );
        const files = [...new Set([...Object.keys(bundle), ...publicFiles])].sort();
        const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(JSON.stringify(files)).update(source);
        for (const file of files) {
          const item = bundle[file];
          hash.update(
            item
              ? item.type === 'asset'
                ? item.source
                : item.code
              : readFileSync(join(publicDir, file)),
          );
        }
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: `const CACHE_NAME = ${JSON.stringify('bus-tv-' + hash.digest('hex').slice(0, 16))};\nconst PRECACHE = ${JSON.stringify(files.map((file) => '/tv/' + file))};\n${source}`,
        });
      },
    },
  ],
  build: { target: 'chrome100', outDir: 'dist' },
});
