import { cpSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env['npm_execpath'];
if (!npm) throw new Error('Run through npm run assemble.');
for (const app of ['tv', 'admin', 'mobile']) {
  execFileSync(process.execPath, [npm, 'run', 'build', `--workspace=apps/${app}`], {
    cwd: root,
    stdio: 'inherit',
  });
  const target = resolve(root, 'workers/api/public', app);
  if (!target.startsWith(resolve(root, 'workers/api/public') + sep))
    throw new Error('Unsafe asset target');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(resolve(root, 'apps', app, 'dist'), target, { recursive: true });
}
writeFileSync(
  resolve(root, 'workers/api/public/_headers'),
  `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
/admin/*
  Cache-Control: no-store
/tv/*
  Cache-Control: no-cache
/tv/manifest.webmanifest
  Content-Type: application/manifest+json
  Cache-Control: no-cache
/mobile/*
  Cache-Control: no-cache
/mobile/manifest.webmanifest
  Content-Type: application/manifest+json
  Cache-Control: no-cache
/mobile/sw.js
  Content-Type: application/javascript; charset=utf-8
  Cache-Control: no-cache
/mobile/*.apk
  Content-Type: application/vnd.android.package-archive
  Content-Disposition: attachment; filename="mahiyanganaya-bus-mobile.apk"
  Cache-Control: public, max-age=3600


`,
);
console.log('Assembled /tv/, /admin/, and /mobile/ with security headers.');
