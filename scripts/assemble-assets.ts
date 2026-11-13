import { cpSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env['npm_execpath'];
if (!npm) throw new Error('Run through npm run assemble.');
for (const app of ['tv', 'admin']) {
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
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
/admin/*
  Cache-Control: no-store
/tv/*
  Cache-Control: no-cache
/tv/sw.js
  ! Cache-Control
  Cache-Control: no-cache
`,
);
console.log('Assembled /tv/ and /admin/ with security headers.');
