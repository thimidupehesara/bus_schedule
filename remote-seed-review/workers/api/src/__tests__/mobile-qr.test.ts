import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import worker, { type Env } from '../index.js';
import { database } from './database.js';

let fixture: ReturnType<typeof database>, env: Env;

beforeEach(() => {
  fixture = database();
  fixture.sqlite
    .prepare('INSERT INTO users(login_id,display_name,role,created_at) VALUES(?,?,?,?)')
    .run('admin@example.com', 'Admin', 'ADMIN', new Date().toISOString());

  env = {
    DB: fixture.db,
    ASSETS: { fetch: async () => new Response('<html></html>') } as unknown as Fetcher,
    DEV_BYPASS_AUTH_EMAIL: 'admin@example.com',
  };
});

afterEach(() => fixture.sqlite.close());

describe('Mobile QR and Suggestions API', () => {
  it('redirects /qr to /mobile/ and counts scans and unique visitors with IP hashing', async () => {
    // First scan from IP 1.2.3.4
    const res1 = await worker.fetch(
      new Request('http://localhost/qr', {
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      }),
      env,
    );
    expect(res1.status).toBe(302);
    expect(res1.headers.get('Location')).toBe('http://localhost/mobile/');

    // Second scan from SAME IP
    const res2 = await worker.fetch(
      new Request('http://localhost/qr', {
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      }),
      env,
    );
    expect(res2.status).toBe(302);

    // Third scan from DIFFERENT IP
    const res3 = await worker.fetch(
      new Request('http://localhost/qr', {
        headers: { 'cf-connecting-ip': '5.6.7.8' },
      }),
      env,
    );
    expect(res3.status).toBe(302);

    // Query stats from database
    const stats = fixture.sqlite
      .prepare('SELECT unique_visitors, total_scans FROM qr_daily_stats')
      .all() as { unique_visitors: number; total_scans: number }[];

    expect(stats).toHaveLength(1);
    expect(stats[0]!.total_scans).toBe(3);
    expect(stats[0]!.unique_visitors).toBe(2);

    // Verify raw IPs are NOT stored anywhere
    const uniques = fixture.sqlite.prepare('SELECT * FROM qr_daily_uniques').all() as {
      scan_date: string;
      ip_hash: string;
    }[];
    expect(uniques).toHaveLength(2);
    for (const row of uniques) {
      expect(row.ip_hash).not.toContain('1.2.3.4');
      expect(row.ip_hash).not.toContain('5.6.7.8');
      expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('handles suggestion submission and validation', async () => {
    // Valid submission
    const res = await worker.fetch(
      new Request('http://localhost/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'WRONG_TIME',
          message: 'The 10:00 AM bus to Kandy actually left at 10:30 AM.',
          routeHint: 'Kandy',
        }),
      }),
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe('string');

    // Query suggestions from database
    const rows = fixture.sqlite
      .prepare('SELECT * FROM suggestions WHERE id = ?')
      .all(body.id) as {
      id: string;
      category: string;
      route_hint: string;
      message: string;
      status: string;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]!.category).toBe('WRONG_TIME');
    expect(rows[0]!.route_hint).toBe('Kandy');
    expect(rows[0]!.message).toContain('10:00 AM bus');
    expect(rows[0]!.status).toBe('OPEN');

    // Invalid category
    const invalidCat = await worker.fetch(
      new Request('http://localhost/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'NOT_VALID',
          message: 'Some issue message.',
        }),
      }),
      env,
    );
    expect(invalidCat.status).toBe(422);

    // Too short message
    const tooShort = await worker.fetch(
      new Request('http://localhost/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'APP_ISSUE',
          message: 'hi',
        }),
      }),
      env,
    );
    expect(tooShort.status).toBe(422);
  });

  it('admin endpoints list suggestions and qr stats', async () => {
    // Seed a suggestion
    await worker.fetch(
      new Request('http://localhost/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'MISSING_BUS',
          message: 'No 7:00 AM bus on Sunday.',
        }),
      }),
      env,
    );

    // Request admin suggestions
    const adminRes = await worker.fetch(
      new Request('http://localhost/api/admin/suggestions', {
        headers: {
          Origin: 'http://localhost',
          'X-Requested-With': 'XMLHttpRequest',
        },
      }),
      env,
    );
    expect(adminRes.status).toBe(200);
    const data = (await adminRes.json()) as { ok: boolean; suggestions: { id: string; status: string }[] };
    expect(data.ok).toBe(true);
    expect(data.suggestions.length).toBeGreaterThanOrEqual(1);
    const sugId = data.suggestions[0]!.id;
    expect(data.suggestions[0]!.status).toBe('OPEN');

    // Mark resolved via PATCH
    const patchRes = await worker.fetch(
      new Request(`http://localhost/api/admin/suggestions/${sugId}`, {
        method: 'PATCH',
        headers: {
          Origin: 'http://localhost',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'RESOLVED' }),
      }),
      env,
    );
    expect(patchRes.status).toBe(200);
    const patchData = (await patchRes.json()) as { ok: boolean; status: string };
    expect(patchData.ok).toBe(true);
    expect(patchData.status).toBe('RESOLVED');

    // Verify in db
    const updated = fixture.sqlite
      .prepare('SELECT status FROM suggestions WHERE id = ?')
      .get(sugId) as { status: string };
    expect(updated.status).toBe('RESOLVED');

    // Request admin qr stats
    const statsRes = await worker.fetch(
      new Request('http://localhost/api/admin/qr-stats', {
        headers: {
          Origin: 'http://localhost',
          'X-Requested-With': 'XMLHttpRequest',
        },
      }),
      env,
    );
    expect(statsRes.status).toBe(200);
    const statsData = (await statsRes.json()) as { ok: boolean; stats: unknown[] };
    expect(statsData.ok).toBe(true);

    // Trigger TV Reload via POST /api/admin/tv-reload
    const reloadRes = await worker.fetch(
      new Request('http://localhost/api/admin/tv-reload', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
          'X-Requested-With': 'XMLHttpRequest',
        },
      }),
      env,
    );
    expect(reloadRes.status).toBe(200);
    const reloadData = (await reloadRes.json()) as { ok: boolean; reloadNonce: string };
    expect(reloadData.ok).toBe(true);
    expect(typeof reloadData.reloadNonce).toBe('string');
    expect(reloadData.reloadNonce.length).toBeGreaterThan(0);

    // Verify GET /tv/version.json returns the bumped reloadNonce
    const versionRes = await worker.fetch(
      new Request('http://localhost/tv/version.json'),
      {
        ...env,
        ASSETS: {
          fetch: async () =>
            new Response(JSON.stringify({ buildId: 'test-build-123' }), {
              headers: { 'Content-Type': 'application/json' },
            }),
        } as unknown as Fetcher,
      },
    );
    expect(versionRes.status).toBe(200);
    expect(versionRes.headers.get('Cache-Control')).toContain('no-cache');
    const versionData = (await versionRes.json()) as {
      buildId: string;
      reloadNonce: string;
      forceReloadToken: string;
    };
    expect(versionData.buildId).toBe('test-build-123');
    expect(versionData.reloadNonce).toBe(reloadData.reloadNonce);
    expect(versionData.forceReloadToken).toBe(reloadData.reloadNonce);
  });
});

