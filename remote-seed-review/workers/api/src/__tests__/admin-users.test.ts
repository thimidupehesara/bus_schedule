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
    ASSETS: { fetch: async () => new Response('<html></html>') } as unknown as Fetcher,
    DEV_BYPASS_AUTH_EMAIL: 'admin@example.com',
  };

  editorEnv = {
    DB: fixture.db,
    ASSETS: { fetch: async () => new Response('<html></html>') } as unknown as Fetcher,
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

describe('Admin Users API', () => {
  it('enforces ADMIN role guard (rejects EDITOR with 403)', async () => {
    const getRes = await request('/api/admin/users', 'GET', undefined, editorEnv);
    expect(getRes.res.status).toBe(403);

    const postRes = await request(
      '/api/admin/users',
      'POST',
      { login_id: 'test@example.com', display_name: 'Test', role: 'EDITOR' },
      editorEnv,
    );
    expect(postRes.res.status).toBe(403);

    const patchRes = await request(
      '/api/admin/users/2',
      'PATCH',
      { disabled: 1 },
      editorEnv,
    );
    expect(patchRes.res.status).toBe(403);
  });

  it('GET /api/admin/users returns all users ordered by id ASC', async () => {
    const { res, data } = await request('/api/admin/users', 'GET');
    expect(res.status).toBe(200);
    const users = data?.['users'] as Array<{ login_id: string; role: string }>;
    expect(Array.isArray(users)).toBe(true);
    expect(users).toHaveLength(2);
    expect(users[0]!.login_id).toBe('admin@example.com');
    expect(users[1]!.login_id).toBe('editor@example.com');
  });

  it('POST /api/admin/users validates fields, rejects duplicates, and creates staff', async () => {
    // Missing/invalid email
    const invalidEmail = await request('/api/admin/users', 'POST', {
      login_id: 'invalid-email',
      display_name: 'Staff',
      role: 'EDITOR',
    });
    expect(invalidEmail.res.status).toBe(422);

    // Empty display name
    const emptyName = await request('/api/admin/users', 'POST', {
      login_id: 'staff@example.com',
      display_name: '   ',
      role: 'EDITOR',
    });
    expect(emptyName.res.status).toBe(422);

    // Duplicate email
    const dupRes = await request('/api/admin/users', 'POST', {
      login_id: 'editor@example.com',
      display_name: 'Editor Duplicate',
      role: 'EDITOR',
    });
    expect(dupRes.res.status).toBe(409);

    // Successful creation
    const successRes = await request('/api/admin/users', 'POST', {
      login_id: 'newstaff@example.com',
      display_name: 'New Staff',
      role: 'EDITOR',
    });
    expect(successRes.res.status).toBe(201);
    expect(successRes.data?.['ok']).toBe(true);

    // Confirm in DB
    const listRes = await request('/api/admin/users', 'GET');
    expect((listRes.data?.['users'] as unknown[])).toHaveLength(3);
  });

  it('PATCH /api/admin/users/:id prevents self-disabling and self-demotion', async () => {
    // Current admin trying to disable their own account
    const selfDisable = await request('/api/admin/users/1', 'PATCH', { disabled: 1 });
    expect(selfDisable.res.status).toBe(400);

    // Current admin trying to demote their own account to EDITOR
    const selfDemote = await request('/api/admin/users/1', 'PATCH', { role: 'EDITOR' });
    expect(selfDemote.res.status).toBe(400);

    // Updating another user (promote editor to ADMIN)
    const promoteRes = await request('/api/admin/users/2', 'PATCH', { role: 'ADMIN' });
    expect(promoteRes.res.status).toBe(200);

    // Disabling another user
    const disableRes = await request('/api/admin/users/2', 'PATCH', { disabled: 1 });
    expect(disableRes.res.status).toBe(200);

    // Re-enabling user
    const reenableRes = await request('/api/admin/users/2', 'PATCH', { disabled: 0 });
    expect(reenableRes.res.status).toBe(200);
  });
});

