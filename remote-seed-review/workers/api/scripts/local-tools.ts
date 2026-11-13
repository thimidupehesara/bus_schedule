import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const apiDirectory = fileURLToPath(new URL('../', import.meta.url));
export const wrangler = join(
  dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),
  'bin/wrangler.js',
);
export const quoteSql = (value: string): string => `'${value.replace(/'/g, "''")}'`;
export function runWrangler(args: string[]): void {
  execFileSync(process.execPath, [wrangler, ...args], {
    cwd: apiDirectory,
    stdio: 'inherit',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
}
export function executeSql(sql: string, remote = false, persist?: string): void {
  const directory = mkdtempSync(join(tmpdir(), 'bus-sql-')),
    file = join(directory, 'query.sql');
  try {
    writeFileSync(file, sql, { encoding: 'utf8', mode: 0o600 });
    runWrangler([
      'd1',
      'execute',
      'DB',
      remote ? '--remote' : '--local',
      '--file',
      file,
      ...(persist ? ['--persist-to', persist] : []),
    ]);
  } finally {
    rmSync(file, { force: true });
    rmdirSync(directory);
  }
}
