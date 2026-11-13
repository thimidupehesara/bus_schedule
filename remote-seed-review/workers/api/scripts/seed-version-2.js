import { readFileSync, writeFileSync, rmSync, rmdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const samplePath = join(import.meta.dirname, '../../../packages/shared/src/sample-schedule.json');
const sample = JSON.parse(readFileSync(samplePath, 'utf8'));

// Sort services
const services = [...sample.services].sort((a, b) =>
  a.departure.localeCompare(b.departure) ||
  (a.arrival ?? '').localeCompare(b.arrival ?? '') ||
  a.destination.en.localeCompare(b.destination.en) ||
  a.id.localeCompare(b.id)
);

const now = new Date().toISOString();
const document = {
  schemaVersion: 1,
  version: 6,
  publishedAt: now,
  lastVerified: sample.lastVerified || '2026-11-13',
  timezone: 'Asia/Colombo',
  station: sample.station,
  alert: sample.alert,
  display: sample.display,
  services,
};

const body = JSON.stringify(document);

// calculate ETag
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
const hex = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
const etag = `"v6-${hex.slice(0, 16)}"`;

const quoteSql = (val) => `'${val.replace(/'/g, "''")}'`;

const sql = `
INSERT INTO snapshots(version, published_at, published_by, kind, body, etag)
VALUES(6, ${quoteSql(now)}, 'owner', 'PUBLISH', ${quoteSql(body)}, ${quoteSql(etag)});

INSERT INTO live_pointer(id, version)
VALUES(1, 6)
ON CONFLICT(id) DO UPDATE SET version = 6;

INSERT INTO audit_log(at, login_id, action, detail)
VALUES(${quoteSql(now)}, 'owner', 'PUBLISH', 'TV safeArea 1.5%, Trincomalee spelling ත්‍රිකුණාමලය, mobileUrl /qr, 4 rowsPerPage, orange next-bus');
`;

console.log('Document prepared:');
console.log('Version:', 6);
console.log('Services:', services.length);
console.log('ETag:', etag);
console.log('Station:', document.station.name.si);

const dir = mkdtempSync(join(tmpdir(), 'bus-d1-'));
const sqlFile = join(dir, 'seed2.sql');
writeFileSync(sqlFile, sql, 'utf8');

const wranglerPath = join(
  import.meta.dirname,
  '../../../node_modules/wrangler/bin/wrangler.js'
);

try {
  console.log('Executing on remote D1 database...');
  const output = execFileSync(
    process.execPath,
    ['--no-warnings', wranglerPath, 'd1', 'execute', 'DB', '--remote', '--file', sqlFile],
    {
      cwd: join(import.meta.dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    }
  );
  console.log(output);
  console.log('SUCCESS: Remote database updated to version 6!');
} finally {
  rmSync(sqlFile, { force: true });
  rmdirSync(dir, { recursive: true });
}
