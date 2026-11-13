import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
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
const tvHtml = readFileSync(resolve(root, 'workers/api/public/tv/index.html'), 'utf8');
const scriptHashes = [...tvHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source): source is string => Boolean(source))
  .map((source) => ` 'sha256-${createHash('sha256').update(source).digest('base64')}'`)
  .join('');
const csp = "default-src 'self'; script-src 'self'";
const cspRest =
  "; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
writeFileSync(
  resolve(root, 'workers/api/public/_headers'),
  `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: ${csp}${cspRest}
/admin/*
  Cache-Control: no-store
/tv/*
  Cache-Control: no-cache
  ! Content-Security-Policy
  Content-Security-Policy: ${csp}${scriptHashes}${cspRest}
/tv/sw.js
  ! Cache-Control
  Cache-Control: no-cache
`,
);
console.log('Assembled /tv/ and /admin/ with security headers.');
