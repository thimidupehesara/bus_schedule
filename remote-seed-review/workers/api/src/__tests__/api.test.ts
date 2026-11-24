import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../index.js';
import { database } from './database.js';
import sample from '../../../../packages/shared/src/sample-schedule.json' with { type: 'json' };
import { Store } from '../store.js';
import { ScheduleDocumentSchema, type BusService, type ScheduleDocument } from '@bus-schedule/shared';
let fixture: ReturnType<typeof database>, env: Env;
beforeEach(() => {
  fixture = database();
  fixture.sqlite
    .prepare('INSERT INTO users(login_id,display_name,role,created_at) VALUES(?,?,?,?)')
    .run('admin@example.com', 'Admin', 'ADMIN', new Date().toISOString());
  fixture.sqlite
    .prepare('INSERT INTO users(login_id,display_name,role,created_at) VALUES(?,?,?,?)')
    .run('editor@example.com', 'Editor', 'EDITOR', new Date().toISOString());
  env = {
    DB: fixture.db,
    ASSETS: { fetch: async () => new Response('<html></html>') } as unknown as Fetcher,
    DEV_BYPASS_AUTH_EMAIL: 'admin@example.com',
  };
});
afterEach(() => fixture.sqlite.close());
async function request(path: string, method = 'GET', body?: unknown, config: Env = env) {
  const response = await worker.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        Origin: 'http://localhost',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
    }),
    config,
  );
  const data = (await response.json()) as Record<string, unknown>;
  return { response, data };
}
async function seed() {
  expect((await request('/api/draft/import', 'POST', sample)).response.status).toBe(200);
  const draft = await request('/api/draft');
  const published = await request('/api/publish', 'POST', {
    draftRevision: draft.data['draftRevision'],
    confirm: true,
  });
  expect(published.response.status).toBe(200);
  expect(published.data['hasUnpublishedChanges']).toBe(false);
  return published;
}
describe('local SQLite API integration', () => {
  it('fails closed for no JWT/config, unknown and disabled users, and remote bypass', async () => {
    expect(
      (await request('/api/auth/me', 'GET', undefined, { ...env, DEV_BYPASS_AUTH_EMAIL: '' }))
        .response.status,
    ).toBe(401);
    expect(
      (
        await request('/api/auth/me', 'GET', undefined, {
          ...env,
          DEV_BYPASS_AUTH_EMAIL: 'unknown@example.com',
        })
      ).response.status,
    ).toBe(403);
    fixture.sqlite.exec("UPDATE users SET disabled=1 WHERE login_id='editor@example.com'");
    expect(
      (
        await request('/api/auth/me', 'GET', undefined, {
          ...env,
          DEV_BYPASS_AUTH_EMAIL: 'editor@example.com',
        })
      ).response.status,
    ).toBe(403);
    expect(
      (await worker.fetch(new Request('https://bus.example.com/api/auth/me'), env)).status,
    ).toBe(401);
    expect((await request('/api/auth/me')).data['user']).toMatchObject({
      email: 'admin@example.com',
      role: 'ADMIN',
    });
    const first = fixture.sqlite.prepare('SELECT last_login_at FROM users WHERE id=1').get();
    await request('/api/auth/me');
    expect(fixture.sqlite.prepare('SELECT last_login_at FROM users WHERE id=1').get()).toEqual(
      first,
    );
  });
  it(
    'returns 503 before publication and keeps draft edits invisible until publish',
    async () => {
      const empty = await request('/schedule.json');
      expect(empty.response.status).toBe(503);
      expect(empty.response.headers.get('Retry-After')).toBe('60');
      await seed();
      const first = await request('/schedule.json');
      const service = { ...sample.services[0], arrival: '00:55', departure: '01:05' };
      expect(
        (await request(`/api/draft/services/${service.id}`, 'PUT', service)).response.status,
      ).toBe(200);
      const still = await request('/schedule.json');
      expect(still.data).toEqual(first.data);
      expect(still.response.headers.get('ETag')).toBe(first.response.headers.get('ETag'));
      const preview = await request('/api/publish/preview', 'POST', {});
      expect(preview.data['diff']).toMatchObject({ changed: [{ id: service.id }] });
      expect(
        (
          await request('/api/publish', 'POST', {
            draftRevision: Number(preview.data['draftRevision']) - 1,
            confirm: true,
          })
        ).response.status,
      ).toBe(409);
      expect(
        (
          await request('/api/publish', 'POST', {
            draftRevision: preview.data['draftRevision'],
            confirm: false,
          })
        ).response.status,
      ).toBe(400);
      expect(
        (
          await request('/api/publish', 'POST', {
            draftRevision: preview.data['draftRevision'],
            confirm: true,
          })
        ).data['version'],
      ).toBe(2);
      const second = await request('/schedule.json');
      expect(second.response.headers.get('ETag')).not.toBe(first.response.headers.get('ETag'));
      const conditional = await worker.fetch(
        new Request('http://localhost/schedule.json', {
          headers: { 'If-None-Match': `"other", W/${second.response.headers.get('ETag')}` },
        }),
        env,
      );
      expect(conditional.status).toBe(304);
      expect(await conditional.text()).toBe('');
      expect(conditional.headers.get('X-Server-Time')).toBeTruthy();
      expect(
        (await request('/api/rollback', 'POST', { version: 1, confirm: true })).data['version'],
      ).toBe(3);
      const reverted = await request('/schedule.json');
      expect(reverted.data['services']).toEqual(first.data['services']);
      expect((await request('/api/draft')).data['hasUnpublishedChanges']).toBe(false);
      expect(
        fixture.sqlite.prepare('SELECT kind,rolled_back_from FROM snapshots WHERE version=3').get(),
      ).toMatchObject({ kind: 'ROLLBACK', rolled_back_from: 1 });
    }, 30000);
  it('returns bilingual errors and normalizes safe time input', async () => {
    const bad = await request('/api/draft/services', 'POST', {
      ...sample.services[0],
      departure: '24:10',
      destination: { si: 'Colombo', en: 'Colombo' },
    });
    expect(bad.response.status).toBe(422);
    expect(bad.data['error']).toMatchObject({
      details: [
        { message_en: expect.any(String), message_si: expect.stringMatching(/[\u0D80-\u0DFF]/) },
      ],
    });
    const latin = await request('/api/draft/services', 'POST', {
      ...sample.services[0],
      destination: { si: 'Colombo', en: 'Colombo' },
    });
    expect(latin.response.status).toBe(422);
    const good = await request('/api/draft/services', 'POST', {
      ...sample.services[0],
      arrival: null,
      departure: '5.30',
    });
    expect(good.response.status).toBe(201);
    expect(good.data['service']).toMatchObject({ departure: '05:30' });

    // Verify arrival time handling on POST and PUT
    const withArrival = await request('/api/draft/services', 'POST', {
      ...sample.services[0],
      id: crypto.randomUUID(),
      departure: '08:30',
      arrival: '08:15',
    });
    expect(withArrival.response.status).toBe(201);
    expect(withArrival.data['service']).toMatchObject({ departure: '08:30', arrival: '08:15' });

    const updatedId = (withArrival.data['service'] as { id: string }).id;
    const updateClear = await request(`/api/draft/services/${updatedId}`, 'PUT', {
      ...(withArrival.data['service'] as object),
      arrival: null,
    });
    expect(updateClear.response.status).toBe(200);
    expect(updateClear.data['service']).toMatchObject({ arrival: null });

    const tooLongWait = await request(`/api/draft/services/${updatedId}`, 'PUT', {
      ...(withArrival.data['service'] as object),
      departure: '08:30',
      arrival: '04:00', // 270 minutes wait > 180 min limit
    });
    expect(tooLongWait.response.status).toBe(422);

    // Verify via route handling on POST and PUT
    const withVia = await request('/api/draft/services', 'POST', {
      ...sample.services[0],
      id: crypto.randomUUID(),
      departure: '09:30',
      arrival: null,
      via: { si: 'කදුරුවෙල', en: 'Kaduruwela' },
    });
    expect(withVia.response.status).toBe(201);
    expect(withVia.data['service']).toMatchObject({
      departure: '09:30',
      via: { si: 'කදුරුවෙල', en: 'Kaduruwela' },
    });

    const withStringVia = await request('/api/draft/services', 'POST', {
      ...sample.services[0],
      id: crypto.randomUUID(),
      departure: '10:30',
      arrival: null,
      via: 'Dambulla',
    });
    expect(withStringVia.response.status).toBe(201);
    expect(withStringVia.data['service']).toMatchObject({
      departure: '10:30',
      via: 'Dambulla',
    });

    const viaServiceId = (withVia.data['service'] as { id: string }).id;
    const clearVia = await request(`/api/draft/services/${viaServiceId}`, 'PUT', {
      ...(withVia.data['service'] as object),
      via: null,
    });
    expect(clearVia.response.status).toBe(200);
    expect(clearVia.data['service']).toMatchObject({ via: null });
  });
  it('enforces editor roles and CSRF for every mutation', async () => {
    const editor = { ...env, DEV_BYPASS_AUTH_EMAIL: 'editor@example.com' };
    for (const [path, method, body] of [
      ['/api/draft/display', 'PUT', sample.display],
      ['/api/draft/station', 'PUT', sample.station],
      ['/api/draft/import', 'POST', sample],
      ['/api/users', 'POST', {}],
      ['/api/users', 'GET', undefined],
    ] as const)
      expect((await request(path, method, body, editor)).response.status).toBe(403);
    const response = await worker.fetch(
      new Request('http://localhost/api/draft/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await seed();
    expect(
      (await request('/api/rollback', 'POST', { version: 1, confirm: true }, editor)).response
        .status,
    ).toBe(200);
  }, 30000);
  it('enforces user limits, case insensitive identities, and self protection', async () => {
    expect((await request('/api/users/1', 'PUT', { disabled: true })).response.status).toBe(409);
    expect((await request('/api/users/1', 'PUT', { role: 'EDITOR' })).response.status).toBe(409);
    expect(
      (
        await request('/api/users', 'POST', {
          email: 'ADMIN@example.com',
          displayName: 'Copy',
          role: 'ADMIN',
        })
      ).response.status,
    ).toBe(409);
    expect(
      (await request('/api/users', 'POST', { email: 'bad', displayName: 'Bad', role: 'ADMIN' }))
        .response.status,
    ).toBe(422);
    for (let i = 0; i < 18; i++)
      expect(
        (
          await request('/api/users', 'POST', {
            email: `staff${i}@example.com`,
            displayName: 'Staff',
            role: 'EDITOR',
          })
        ).response.status,
      ).toBe(201);
    expect(
      (
        await request('/api/users', 'POST', {
          email: 'overflow@example.com',
          displayName: 'Staff',
          role: 'EDITOR',
        })
      ).response.status,
    ).toBe(409);
    expect((await request('/api/users', 'GET')).data['users']).toHaveLength(20);
    expect(() => fixture.sqlite.exec("UPDATE users SET role='EDITOR' WHERE id=1")).toThrow(
      'last active admin',
    );
  });
  it('keeps failed guarded transactions atomic and rejects concurrent publish of stale state', async () => {
    await seed();
    const store = new Store(env.DB),
      state = await store.draft(),
      user = { loginId: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' as const };
    const results = await Promise.allSettled([
      store.publish(state, user, state.document, 'PUBLISH', null),
      store.publish(state, user, state.document, 'PUBLISH', null),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    const current = await store.draft();
    expect(current.maximum).toBe(2);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM mutation_guard').get()).toMatchObject({
      n: 0,
    });
    await expect(
      store.edit(state, user, [store.sql('DELETE FROM draft_services')], 'BAD_EDIT'),
    ).rejects.toMatchObject({ status: 409 });
    expect((await store.draft()).document.services).toHaveLength(sample.services.length);
  });
  it('retains 50 snapshots and increases versions after pruning and rollback', async () => {
    const store = new Store(env.DB),
      user = { loginId: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' as const };
    const doc = ScheduleDocumentSchema.parse(sample);
    for (let i = 0; i < 53; i++)
      await store.publish(await store.draft(), user, doc, 'PUBLISH', null);
    expect(
      fixture.sqlite
        .prepare('SELECT COUNT(*) AS n,MIN(version) AS first,MAX(version) AS last FROM snapshots')
        .get(),
    ).toMatchObject({ n: 50, first: 4, last: 53 });
    expect(
      (await request('/api/rollback', 'POST', { version: 4, confirm: true })).data['version'],
    ).toBe(54);
  }, 45000);
  it('supports duplicate overrides, deletion and discard without accidental exact duplicates', async () => {
    await seed();
    const id = sample.services[0]!.id;
    expect((await request(`/api/draft/services/${id}/duplicate`, 'POST', {})).response.status).toBe(
      422,
    );
    const copy = await request(`/api/draft/services/${id}/duplicate`, 'POST', {
      departure: '01:15',
    });
    expect(copy.response.status).toBe(201);
    expect((await request(`/api/draft/services/${id}`, 'DELETE', {})).response.status).toBe(200);
    expect((await request('/api/draft/discard', 'POST', {})).response.status).toBe(200);
    expect((await request('/api/draft')).data['hasUnpublishedChanges']).toBe(false);
  });
});

describe('backend fixes', () => {
  it('rolls back expired alerts as disabled with bilingual notice and atomic draft reset', async () => {
    await seed();
    const old = ScheduleDocumentSchema.parse(structuredClone(sample));
    old.alert = {
      enabled: true,
      severity: 'INFO',
      text: { en: 'Old notice', si: 'පැරණි නිවේදනය' },
      expiresAt: '2020-01-01T00:00:00Z',
    };
    fixture.sqlite.prepare('UPDATE snapshots SET body=? WHERE version=1').run(JSON.stringify(old));
    const result = await request('/api/rollback', 'POST', { version: 1, confirm: true });
    expect(result.response.status).toBe(200);
    expect(result.data).toMatchObject({
      version: 2,
      alertDisabled: true,
      message_en: expect.stringContaining('expired'),
      message_si: expect.stringMatching(/[\u0D80-\u0DFF]/),
    });
    const live = await request('/schedule.json');
    expect(live.data['alert']).toMatchObject({ enabled: false, expiresAt: old.alert.expiresAt });
    expect((await request('/api/draft')).data['document']).toMatchObject({
      alert: { enabled: false },
    });
    expect(
      JSON.parse(
        fixture.sqlite.prepare('SELECT body FROM snapshots WHERE version=1').get()!.body as string,
      ).alert.enabled,
    ).toBe(true);
  });
  it('restores schema-valid historical services despite strict errors and returns warnings', async () => {
    await seed();
    const old = ScheduleDocumentSchema.parse(structuredClone(sample));
    old.services[0]!.destination.si = 'Legacy Latin name';
    fixture.sqlite.prepare('UPDATE snapshots SET body=? WHERE version=1').run(JSON.stringify(old));
    const result = await request('/api/rollback', 'POST', { version: 1, confirm: true });
    expect(result.response.status).toBe(200);
    expect(result.data).toMatchObject({ version: 2, alertDisabled: false });
    expect(result.data['warnings']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SCRIPT',
          serviceId: old.services[0]!.id,
          severity: 'warning',
          message_en: expect.any(String),
          message_si: expect.stringMatching(/[\u0D80-\u0DFF]/),
        }),
        expect.objectContaining({ code: 'OVERNIGHT', severity: 'warning' }),
      ]),
    );
    expect((await request('/schedule.json')).data['services']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destination: old.services[0]!.destination }),
      ]),
    );
    const draft = await request('/api/draft');
    expect(
      (
        await request('/api/publish', 'POST', {
          draftRevision: draft.data['draftRevision'],
          confirm: true,
        })
      ).response.status,
    ).toBe(422);
  });
  it.each(['invalid-time', 'invalid-json'])(
    'blocks corrupted snapshots (%s) without a new version',
    async (corruption) => {
      await seed();
      const old = ScheduleDocumentSchema.parse(structuredClone(sample));
      old.services[0]!.departure = '24:10';
      fixture.sqlite
        .prepare(
          'INSERT INTO snapshots(version,published_at,published_by,kind,body,etag) VALUES(2,?,?,?, ?,?)',
        )
        .run(
          new Date().toISOString(),
          'test',
          'PUBLISH',
          corruption === 'invalid-json' ? '{' : JSON.stringify(old),
          'unused',
        );
      const before = await request('/api/draft');
      const result = await request('/api/rollback', 'POST', { version: 2, confirm: true });
      expect(result.response.status).toBe(422);
      expect(result.data['error']).toMatchObject({ code: 'VALIDATION' });
      expect((await request('/schedule.json')).data['version']).toBe(1);
      expect((await request('/api/draft')).data).toEqual(before.data);
      expect(fixture.sqlite.prepare('SELECT MAX(version) AS n FROM snapshots').get()).toMatchObject(
        { n: 2 },
      );
    },
  );
  it('returns DUPLICATE_EMAIL for case-insensitive existing and concurrent user creation', async () => {
    const duplicate = await request('/api/users', 'POST', {
      email: 'ADMIN@example.com',
      displayName: 'Copy',
      role: 'ADMIN',
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.data['error']).toMatchObject({
      code: 'DUPLICATE_EMAIL',
      message: expect.stringContaining('already exists'),
    });
    const body = { email: 'new@example.com', displayName: 'New', role: 'EDITOR' };
    const results = await Promise.all([
      request('/api/users', 'POST', body),
      request('/api/users', 'POST', { ...body, email: 'NEW@example.com' }),
    ]);
    expect(results.map((r) => r.response.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.response.status === 409)!.data['error']).toMatchObject({
      code: 'DUPLICATE_EMAIL',
    });
    expect(
      fixture.sqlite
        .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='USER_CREATE'")
        .get(),
    ).toMatchObject({ n: 1 });
  });
  it('returns exact rejection reasons on POST /api/publish and auto-deduplicates via POST /api/draft/deduplicate', async () => {
    await seed();
    const firstService = sample.services[0];
    const duplicateService = {
      ...firstService,
      id: 'f9999999-9999-9999-9999-999999999999',
    };
    // Force insert duplicate into draft
    fixture.sqlite
      .prepare('INSERT INTO draft_services(id,data,updated_at,updated_by) VALUES(?,?,?,?)')
      .run(
        duplicateService.id,
        JSON.stringify(duplicateService),
        new Date().toISOString(),
        'admin@example.com',
      );
    // Bump draft meta revision
    fixture.sqlite
      .prepare('UPDATE draft_meta SET revision=revision+1 WHERE id=1')
      .run();

    const updatedDraft = await request('/api/draft');
    expect(updatedDraft.data['validation']).toMatchObject({ ok: false });

    // Attempt to publish
    const publishAttempt = await request('/api/publish', 'POST', {
      draftRevision: updatedDraft.data['draftRevision'],
      confirm: true,
    });
    expect(publishAttempt.response.status).toBe(422);
    expect(publishAttempt.data['error']).toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('Publish rejected due to'),
      details: expect.arrayContaining([
        expect.objectContaining({
          code: 'DUPLICATE_SERVICE',
          serviceId: expect.any(String),
          message_en: expect.stringContaining('Duplicates service'),
        }),
      ]),
    });

    // Run auto-deduplicate endpoint
    const dedupRes = await request('/api/draft/deduplicate', 'POST', {});
    expect(dedupRes.response.status).toBe(200);
    expect(dedupRes.data).toMatchObject({
      ok: true,
      removedCount: 1,
      removedServices: expect.arrayContaining([
        expect.objectContaining({
          id: duplicateService.id,
          departure: duplicateService.departure,
        }),
      ]),
    });

    // Check draft is now clean
    const cleanDraft = await request('/api/draft');
    expect(cleanDraft.data['validation']).toMatchObject({ ok: true });

    // Now publish should succeed cleanly
    const finalPublish = await request('/api/publish', 'POST', {
      draftRevision: cleanDraft.data['draftRevision'],
      confirm: true,
    });
    expect(finalPublish.response.status).toBe(200);
    expect(finalPublish.data).toMatchObject({ ok: true, version: 2 });
    expect(finalPublish.data['reloadNonce']).toBeDefined();
    expect(
      fixture.sqlite
        .prepare("SELECT detail FROM audit_log WHERE action='TV_RELOAD' ORDER BY id DESC LIMIT 1")
        .get(),
    ).toBeDefined();
  }, 20000);

  it('supports POST /api/draft/import with replace mode auto-deduplicating identical departures', async () => {
    await seed();
    const service1 = { ...sample.services[0], id: '00000000-0000-0000-0000-000000000001' };
    const service1Dup = { ...sample.services[0], id: '00000000-0000-0000-0000-000000000002' };
    const importRes = await request('/api/draft/import', 'POST', {
      mode: 'replace',
      services: [service1, service1Dup],
    });
    expect(importRes.response.status).toBe(200);
    expect(importRes.data).toMatchObject({ ok: true });

    const draft = await request('/api/draft');
    expect((draft.data['document'] as ScheduleDocument).services).toHaveLength(1);
    expect(draft.data['validation']).toMatchObject({ ok: true });
  }, 20000);

  it('supports DELETE /api/draft/services clearing all draft services in one request', async () => {
    await seed();
    const draftBefore = await request('/api/draft');
    expect((draftBefore.data['document'] as ScheduleDocument).services.length).toBeGreaterThan(0);

    const deleteRes = await request('/api/draft/services', 'DELETE', {});
    expect(deleteRes.response.status).toBe(200);
    expect(deleteRes.data).toMatchObject({ ok: true });
    expect(deleteRes.data['deletedCount']).toBeGreaterThan(0);

    const draftAfter = await request('/api/draft');
    expect((draftAfter.data['document'] as ScheduleDocument).services).toHaveLength(0);
    expect(
      fixture.sqlite
        .prepare("SELECT detail FROM audit_log WHERE action='SERVICE_DELETE_ALL' ORDER BY id DESC LIMIT 1")
        .get(),
    ).toBeDefined();
  }, 20000);

  it('supports POST /api/draft/activate-all activating all draft services in one request', async () => {
    await seed();
    // First inactivate all services
    const draftBefore = await request('/api/draft');
    const services = (draftBefore.data['document'] as ScheduleDocument).services;
    for (const s of services) {
      await request(`/api/draft/services/${s.id}`, 'PUT', { ...s, active: false });
    }
    const draftInactivated = await request('/api/draft');
    const inactivatedServices = (draftInactivated.data['document'] as ScheduleDocument).services;
    expect(inactivatedServices.every((s) => s.active === false)).toBe(true);

    // Call activate-all
    const activateRes = await request('/api/draft/activate-all', 'POST', {});
    expect(activateRes.response.status).toBe(200);
    expect(activateRes.data).toMatchObject({ ok: true });

    const draftAfter = await request('/api/draft');
    const activeServices = (draftAfter.data['document'] as ScheduleDocument).services;
    expect(activeServices.length).toBeGreaterThan(0);
    expect(activeServices.every((s) => s.active === true)).toBe(true);
  }, 20000);

  it('supports POST /api/draft/import defaulting active: true and all 7 days when omitted', async () => {
    await seed();
    const incompleteRow = {
      destination: { si: 'කොළඹ', en: 'Colombo' },
      origin: { si: 'මහියංගනය', en: 'Mahiyanganaya' },
      departure: '10:00',
      operator: 'CTB',
      serviceType: 'NORMAL',
      // active and days omitted
    };
    const importRes = await request('/api/draft/import', 'POST', {
      mode: 'replace',
      services: [incompleteRow],
    });
    expect(importRes.response.status).toBe(200);
    expect(importRes.data).toMatchObject({ ok: true });

    const draft = await request('/api/draft');
    const importedServices = (draft.data['document'] as ScheduleDocument).services;
    expect(importedServices).toHaveLength(1);
    expect(importedServices[0]?.active).toBe(true);
    expect(importedServices[0]?.days).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
  }, 20000);

  it('rejects POST /api/draft/import with empty services array to prevent wiping timetable', async () => {
    await seed();
    const draftBefore = await request('/api/draft');
    const countBefore = (draftBefore.data['document'] as ScheduleDocument).services.length;
    expect(countBefore).toBeGreaterThan(0);

    const emptyRes = await request('/api/draft/import', 'POST', {
      mode: 'replace',
      services: [],
    });
    expect(emptyRes.response.status).toBe(422);
    expect(emptyRes.data).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });

    const draftAfter = await request('/api/draft');
    expect((draftAfter.data['document'] as ScheduleDocument).services).toHaveLength(countBefore);
  }, 20000);

  it('rejects POST /api/draft/import if any row is invalid and preserves existing draft intact', async () => {
    await seed();
    const draftBefore = await request('/api/draft');
    const countBefore = (draftBefore.data['document'] as ScheduleDocument).services.length;

    const invalidImportRes = await request('/api/draft/import', 'POST', {
      mode: 'replace',
      services: [
        {
          destination: { si: 'කොළඹ', en: 'Colombo' },
          origin: { si: 'මහියංගනය', en: 'Mahiyanganaya' },
          departure: '99:99',
          operator: 'CTB',
          serviceType: 'NORMAL',
        },
      ],
    });
    expect(invalidImportRes.response.status).toBe(422);

    const draftAfter = await request('/api/draft');
    expect((draftAfter.data['document'] as ScheduleDocument).services).toHaveLength(countBefore);
  }, 20000);

  it('supports importing 150+ bus services in batched chunks without exceeding limits', async () => {
    await seed();
    const largeServiceList = Array.from({ length: 150 }, (_, i) => {
      const hour = String(Math.floor(i / 60)).padStart(2, '0');
      const min = String(i % 60).padStart(2, '0');
      return {
        id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
        destination: { si: 'කොළඹ', en: 'Colombo' },
        origin: { si: 'මහියංගනය', en: 'Mahiyanganaya' },
        departure: `${hour}:${min}`,
        arrival: null,
        operator: i % 2 === 0 ? 'CTB' : 'PVT',
        serviceType: 'NORMAL',
        days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        active: true,
      };
    });

    const importRes = await request('/api/draft/import', 'POST', {
      mode: 'replace',
      services: largeServiceList,
    });
    expect(importRes.response.status).toBe(200);
    expect(importRes.data).toMatchObject({ ok: true });
    expect(importRes.data['addedCount']).toBe(150);

    const draft = await request('/api/draft');
    expect((draft.data['document'] as ScheduleDocument).services).toHaveLength(150);
  }, 20000);

  it('loads, previews and publishes a full code-weekday draft without network self-fetches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network fetch'));
    try {
      const doc = {
        ...sample,
        lastVerified: new Date().toISOString().slice(0, 10),
        services: sample.services.map((service: unknown) => ({
          ...(service as BusService),
          days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          active: true,
        })),
      };
      expect((await request('/api/draft/import', 'POST', doc)).response.status).toBe(200);
      const draft = await request('/api/draft');
      expect(draft.response.status).toBe(200);
      const preview = await request('/api/publish/preview', 'POST', {
        draftRevision: draft.data['draftRevision'] as number,
      });
      expect(preview.response.status).toBe(200);
      expect(preview.data['nextVersion']).toBe(1);
      const published = await request('/api/publish', 'POST', {
        confirm: true,
        draftRevision: preview.data['draftRevision'] as number,
      });
      expect(published.response.status).toBe(200);
      expect(published.response.headers.get('content-type')).toContain('application/json');
      expect(published.data['version']).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
