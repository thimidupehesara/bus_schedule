import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import worker, { type Env } from '../index.js';
import { database } from './database.js';

let fixture: ReturnType<typeof database>, adminEnv: Env, editorEnv: Env;

beforeEach(() => {
  fixture = database();
  fixture.sqlite
    .prepare('INSERT INTO users(id, login_id, display_name, role, disabled, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(1, 'admin@example.com', 'Admin User', 'ADMIN', 0, new Date().toISOString());

  fixture.sqlite
    .prepare('INSERT INTO users(id, login_id, display_name, role, disabled, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(2, 'editor@example.com', 'Editor User', 'EDITOR', 0, new Date().toISOString());

  adminEnv = {
    DB: fixture.db,
    ASSETS: {
      fetch: async () => new Response(JSON.stringify({ buildId: 'test-build-123' })),
    } as unknown as Fetcher,
    DEV_BYPASS_AUTH_EMAIL: 'admin@example.com',
  };

  editorEnv = {
    DB: fixture.db,
    ASSETS: {
      fetch: async () => new Response(JSON.stringify({ buildId: 'test-build-123' })),
    } as unknown as Fetcher,
    DEV_BYPASS_AUTH_EMAIL: 'editor@example.com',
  };
});

afterEach(() => fixture.sqlite.close());

async function request(path: string, method = 'GET', body?: unknown, env = adminEnv) {
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        Origin: 'http://localhost',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
      },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    }),
    env,
  );
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { res, data };
}

describe('TV Hold & Presentation API', () => {
  it('returns default tvHold state when no setting exists', async () => {
    const { res, data } = await request('/api/admin/tv-hold', 'GET');
    expect(res.status).toBe(200);
    expect(data?.ok).toBe(true);
    expect(data?.tvHold).toMatchObject({
      mode: 'auto',
      page: 1,
    });
  });

  it('sets mode to credits', async () => {
    const { res, data } = await request('/api/admin/tv-hold', 'POST', { mode: 'credits' });
    expect(res.status).toBe(200);
    expect(data?.ok).toBe(true);
    expect(data?.tvHold).toMatchObject({
      mode: 'credits',
      page: 1,
    });
    expect(typeof (data?.tvHold as Record<string, unknown>)?.updatedAt).toBe('number');

    // Verify GET retrieves updated state
    const getRes = await request('/api/admin/tv-hold', 'GET');
    expect(getRes.data?.tvHold).toMatchObject({
      mode: 'credits',
      page: 1,
    });
  });

  it('sets mode to frequent (and accepts frequent_services alias)', async () => {
    const { res, data } = await request('/api/admin/tv-hold', 'POST', { mode: 'frequent' });
    expect(res.status).toBe(200);
    expect(data?.ok).toBe(true);
    expect(data?.tvHold).toMatchObject({
      mode: 'frequent',
      page: 1,
    });
    expect(typeof (data?.tvHold as Record<string, unknown>)?.updatedAt).toBe('number');

    // Verify GET retrieves updated state
    const getRes = await request('/api/admin/tv-hold', 'GET');
    expect(getRes.data?.tvHold).toMatchObject({
      mode: 'frequent',
      page: 1,
    });

    // Verify frequent_services alias normalizes to frequent
    const aliasRes = await request('/api/admin/tv-hold', 'POST', { mode: 'frequent_services' });
    expect(aliasRes.res.status).toBe(200);
    expect(aliasRes.data?.tvHold).toMatchObject({
      mode: 'frequent',
      page: 1,
    });
  });

  it('sets mode to ceremony_logos and ceremony_qr', async () => {
    // 1. ceremony_logos
    const logosRes = await request('/api/admin/tv-hold', 'POST', { mode: 'ceremony_logos' });
    expect(logosRes.res.status).toBe(200);
    expect(logosRes.data?.ok).toBe(true);
    expect(logosRes.data?.tvHold).toMatchObject({
      mode: 'ceremony_logos',
      page: 1,
    });
    const getLogos = await request('/api/admin/tv-hold', 'GET');
    expect(getLogos.data?.tvHold).toMatchObject({
      mode: 'ceremony_logos',
    });

    // 2. ceremony_qr
    const qrRes = await request('/api/admin/tv-hold', 'POST', { mode: 'ceremony_qr' });
    expect(qrRes.res.status).toBe(200);
    expect(qrRes.data?.ok).toBe(true);
    expect(qrRes.data?.tvHold).toMatchObject({
      mode: 'ceremony_qr',
      page: 1,
    });
    const getQr = await request('/api/admin/tv-hold', 'GET');
    expect(getQr.data?.tvHold).toMatchObject({
      mode: 'ceremony_qr',
    });
  });

  it('sets mode to page with custom page number', async () => {
    const { res, data } = await request('/api/admin/tv-hold', 'POST', { mode: 'page', page: 4 });
    expect(res.status).toBe(200);
    expect(data?.ok).toBe(true);
    expect(data?.tvHold).toMatchObject({
      mode: 'page',
      page: 4,
    });

    const getRes = await request('/api/admin/tv-hold', 'GET');
    expect(getRes.data?.tvHold).toMatchObject({
      mode: 'page',
      page: 4,
    });
  });

  it('resumes mode to auto', async () => {
    // First set to credits
    await request('/api/admin/tv-hold', 'POST', { mode: 'credits' });
    // Then resume to auto
    const { res, data } = await request('/api/admin/tv-hold', 'POST', { mode: 'auto' });
    expect(res.status).toBe(200);
    expect(data?.ok).toBe(true);
    expect(data?.tvHold).toMatchObject({
      mode: 'auto',
      page: 1,
    });
  });

  it('validates mode and page parameters', async () => {
    const badMode = await request('/api/admin/tv-hold', 'POST', { mode: 'invalid' });
    expect(badMode.res.status).toBe(422);

    const badPage1 = await request('/api/admin/tv-hold', 'POST', { mode: 'page', page: -1 });
    expect(badPage1.res.status).toBe(422);

    const badPage2 = await request('/api/admin/tv-hold', 'POST', { mode: 'page', page: 101 });
    expect(badPage2.res.status).toBe(422);

    const badPage3 = await request('/api/admin/tv-hold', 'POST', { mode: 'page', page: 1.5 });
    expect(badPage3.res.status).toBe(422);
  });

  it('rejects EDITOR or unauthenticated requests with 403/401', async () => {
    const editorRes = await request('/api/admin/tv-hold', 'POST', { mode: 'credits' }, editorEnv);
    expect(editorRes.res.status).toBe(403);

    const noAuthEnv = { ...adminEnv, DEV_BYPASS_AUTH_EMAIL: undefined };
    const noAuthRes = await request('/api/admin/tv-hold', 'POST', { mode: 'credits' }, noAuthEnv);
    expect(noAuthRes.res.status).toBe(401);
  });

  it('exposes tvHold in GET /tv/version.json', async () => {
    await request('/api/admin/tv-hold', 'POST', { mode: 'page', page: 2 });

    const res = await worker.fetch(
      new Request('http://localhost/tv/version.json'),
      adminEnv,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');

    const data = (await res.json()) as { tvHold?: Record<string, unknown> };
    expect(data?.tvHold).toMatchObject({
      mode: 'page',
      page: 2,
    });
  });
});

