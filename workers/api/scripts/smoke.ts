import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { apiDirectory, executeSql, runWrangler } from './local-tools.js';
import sample from '../../../packages/shared/src/sample-schedule.json' with { type: 'json' };
import type { ScheduleDocument } from '@bus-schedule/shared';
const persist = resolve(apiDirectory, '.wrangler', `smoke-${crypto.randomUUID()}`);
let server: Unstable_DevWorker | undefined,
  origin = '',
  checks = 0;
function pass(message: string) {
  checks++;
  console.log(`PASS ${message}`);
}
async function stop() {
  if (server) {
    await server.stop();
    server = undefined;
  }
}
async function start(email?: string) {
  // Wrangler's local dev API owns and disposes workerd on Windows without taskkill.
  server = await unstable_dev(resolve(apiDirectory, 'src/index.ts'), {
    config: resolve(apiDirectory, 'wrangler.toml'),
    local: true,
    ip: '127.0.0.1',
    port: 0,
    persistTo: persist,
    vars: { DEV_BYPASS_AUTH_EMAIL: email ?? '' },
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  });
  origin = `http://127.0.0.1:${server.port}`;
}
async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      Origin: origin,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { response, data };
}
async function main() {
  assert(!process.argv.slice(2).length, 'Smoke accepts no flags and is always local.');
  runWrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persist]);
  executeSql(
    `INSERT INTO users(login_id,display_name,role,disabled,created_at) VALUES
    ('smoke-admin@example.com','Smoke Admin','ADMIN',0,'2026-11-11T00:00:00Z'),
    ('smoke-editor@example.com','Smoke Editor','EDITOR',0,'2026-11-11T00:00:00Z'),
    ('smoke-disabled@example.com','Disabled','EDITOR',1,'2026-11-11T00:00:00Z');`,
    false,
    persist,
  );
  await start();
  const assetLinks = await fetch(`${origin}/.well-known/assetlinks.json`, {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(assetLinks.status, 200);
  assert.equal(assetLinks.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert(Array.isArray(await assetLinks.json()));
  pass('public Asset Links route serves a JSON array without authentication');
  await stop();
  await start('smoke-admin@example.com');
  assert.equal((await call('/api/auth/me')).response.status, 200);
  pass('local Access development identity authenticates');
  assert.equal((await call('/schedule.json')).response.status, 503);
  pass('unpublished schedule returns 503');
  for (const path of ['/tv/', '/admin/']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type') ?? '', /text\/html/);
    assert.match(await response.text(), /<html/i);
    assert.match(response.headers.get('Content-Security-Policy') ?? '', /script-src 'self'/);
    pass(`${path} serves HTML with CSP`);
  }
  assert.equal((await call('/api/draft/import', 'POST', sample)).response.status, 200);
  let preview = await call('/api/publish/preview', 'POST', {});
  let published = await call('/api/publish', 'POST', {
    draftRevision: preview.data['draftRevision'],
    confirm: true,
  });
  assert.equal(published.response.status, 200);
  assert.equal(published.data['version'], 1);
  pass('validated first publication creates version 1');
  const initial = await fetch(`${origin}/schedule.json`),
    initialBody = await initial.text(),
    initialEtag = initial.headers.get('ETag');
  assert.equal(initial.status, 200);
  assert(initialEtag);
  assert(initial.headers.get('X-Server-Time'));
  const conditional = await fetch(`${origin}/schedule.json`, {
    headers: { 'If-None-Match': `"unrelated", W/${initialEtag}` },
  });
  assert.equal(conditional.status, 304);
  assert.equal(await conditional.text(), '');
  assert.equal(conditional.headers.get('ETag'), initialEtag);
  assert(conditional.headers.get('X-Server-Time'));
  pass('schedule is 200 then byte-empty 304 with ETag and server time');
  const document = JSON.parse(initialBody) as ScheduleDocument,
    service = document.services[0]!;
  assert.equal(
    (await call(`/api/draft/services/${service.id}`, 'PUT', { ...service, departure: '00:45' }))
      .response.status,
    200,
  );
  assert.equal(await (await fetch(`${origin}/schedule.json`)).text(), initialBody);
  pass('draft edit does not change the public timetable');
  for (const patch of [{ departure: '24:10' }, { destination: { si: 'Colombo', en: 'Colombo' } }]) {
    const bad = await call('/api/draft/services', 'POST', { ...service, ...patch });
    assert.equal(bad.response.status, 422);
    const error = bad.data['error'] as { details: { message_en: string; message_si: string }[] };
    assert(error.details.every((i) => i.message_en && /[\u0D80-\u0DFF]/.test(i.message_si)));
  }
  pass('invalid time and Sinhala-script errors include English and Sinhala');
  preview = await call('/api/publish/preview', 'POST', {});
  assert.equal(
    (
      await call('/api/publish', 'POST', {
        draftRevision: Number(preview.data['draftRevision']) - 1,
        confirm: true,
      })
    ).response.status,
    409,
  );
  pass('stale draft revision returns 409');
  published = await call('/api/publish', 'POST', {
    draftRevision: preview.data['draftRevision'],
    confirm: true,
  });
  assert.equal(published.data['version'], 2);
  const second = await fetch(`${origin}/schedule.json`);
  assert.notEqual(second.headers.get('ETag'), initialEtag);
  pass('publication bumps version and ETag');
  assert.equal(
    (await call('/api/rollback', 'POST', { version: 1, confirm: true })).data['version'],
    3,
  );
  assert.equal((await call('/api/draft')).data['hasUnpublishedChanges'], false);
  pass('rollback creates a higher version and resets draft');
  assert.equal(
    (await call('/api/draft/alert', 'PUT', null, { 'X-Requested-With': '' })).response.status,
    403,
  );
  pass('missing CSRF header returns 403');
  assert.equal((await call('/api/users/1', 'PUT', { disabled: true })).response.status, 409);
  pass('administrator cannot disable self');
  await stop();
  await start('smoke-editor@example.com');
  assert.equal((await call('/api/draft/display', 'PUT', sample.display)).response.status, 403);
  pass('EDITOR cannot modify display settings');
  assert.equal(
    (await call('/api/rollback', 'POST', { version: 1, confirm: true })).data['version'],
    4,
  );
  pass('EDITOR can rollback');
  await stop();
  for (const email of ['unknown@example.com', 'smoke-disabled@example.com', undefined]) {
    await start(email);
    assert.equal((await call('/api/auth/me')).response.status, email ? 403 : 401);
    await stop();
  }
  pass('unknown/disabled identities return 403 and no identity returns 401');
  console.log(
    `Smoke: ${checks} checks passed. Access-only: password/PIN throttling and application cookies are not applicable.`,
  );
  console.log(
    'Smoke uses isolated .wrangler/smoke-* data; the normal local database is unchanged.',
  );
}
try {
  await main();
} finally {
  await stop();
}
