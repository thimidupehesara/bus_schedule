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

describe('Frequent Services Config API', () => {
  it('returns default frequent services config when none is saved', async () => {
    const { res, data } = await request('/api/frequent-services', 'GET');
    expect(res.status).toBe(200);
    expect(data?.ok).toBe(true);
    const config = data?.config as Record<string, unknown>;
    expect(config?.headerSi).toBe('නිතර පිටත්වන ගමනාන්ත');
    expect(Array.isArray(config?.cards)).toBe(true);
    expect((config?.cards as unknown[]).length).toBe(3);
  });

  it('updates frequent services config when requested by ADMIN', async () => {
    const newConfig = {
      headerSi: 'නිතර ධාවනය වන බස් රථ',
      headerEn: 'FREQUENT BUS DEPARTURES',
      cards: [
        {
          id: 1,
          routeLabel: 'Badulla',
          textSi: 'බදුල්ල බස් විනාඩි 15කට වරක්',
          textEn: 'Badulla buses every 15 mins',
          badgeEn: '15 MIN',
          badgeSi: 'විනාඩි 15',
        },
        {
          id: 2,
          routeLabel: 'Kandy',
          textSi: 'මහනුවර බස් විනාඩි 20කට වරක්',
          textEn: 'Kandy buses every 20 mins',
          badgeEn: '20 MIN',
          badgeSi: 'විනාඩි 20',
        },
        {
          id: 3,
          routeLabel: 'Sacred City',
          textSi: 'පූජා නගරය බස් විනාඩි 10කට වරක්',
          textEn: 'Sacred City buses every 10 mins',
          badgeEn: '10 MIN',
          badgeSi: 'විනාඩි 10',
        },
      ],
    };

    const { res, data } = await request('/api/frequent-services', 'POST', newConfig);
    expect(res.status).toBe(200);
    expect(data?.ok).toBe(true);
    const saved = data?.config as Record<string, unknown>;
    expect(saved.headerSi).toBe('නිතර ධාවනය වන බස් රථ');
    expect((saved.cards as unknown[]).length).toBe(3);
    expect(typeof saved.updatedAt).toBe('number');

    // Verify GET retrieves the updated config
    const getRes = await request('/api/frequent-services', 'GET');
    const getConfig = getRes.data?.config as Record<string, unknown>;
    expect(getConfig.headerSi).toBe('නිතර ධාවනය වන බස් රථ');
    expect(getConfig.headerEn).toBe('FREQUENT BUS DEPARTURES');

    // Verify /tv/version.json includes updated frequentServices
    const versionRes = await worker.fetch(
      new Request('http://localhost/tv/version.json'),
      adminEnv,
    );
    expect(versionRes.status).toBe(200);
    const versionData = (await versionRes.json()) as { frequentServices?: Record<string, unknown> };
    expect(versionData?.frequentServices?.headerSi).toBe('නිතර ධාවනය වන බස් රථ');
  });

  it('rejects POST from EDITOR or unauthenticated users', async () => {
    const editorRes = await request('/api/frequent-services', 'POST', { cards: [] }, editorEnv);
    expect(editorRes.res.status).toBe(403);

    const noAuthEnv = { ...adminEnv, DEV_BYPASS_AUTH_EMAIL: undefined };
    const noAuthRes = await request('/api/frequent-services', 'POST', { cards: [] }, noAuthEnv);
    expect(noAuthRes.res.status).toBe(401);
  });

  it('validates cards parameter on POST', async () => {
    const badRes1 = await request('/api/frequent-services', 'POST', { cards: [] });
    expect(badRes1.res.status).toBe(422);

    const badRes2 = await request('/api/frequent-services', 'POST', { cards: 'not-array' });
    expect(badRes2.res.status).toBe(422);
  });
});
