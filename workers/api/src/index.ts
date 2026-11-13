import {
  BusServiceSchema,
  DisplaySettingsSchema,
  ScheduleDocumentSchema,
  normalizeServiceInput,
  validateServiceStrict,
  validateAlertStrict,
  validateLastVerified,
  validateScheduleDocument,
  type ScheduleDocument,
} from '@bus-schedule/shared';
import {
  AccessAuthProvider,
  requireAdmin,
  validEmail,
  checkUserChange,
  type AuthConfig,
  type User,
  type UserRow,
  type Role,
} from './auth.js';
import { ApiError, ok, fail, checkCsrf, readJson, object, security } from './http.js';
import { Store } from './store.js';
import { ASSET_LINKS } from './assetlinks.js';
import {
  hasChanges,
  matchesEtag,
  publishWarnings,
  scheduleDiff,
  validateDocument,
  nextVersion,
} from './schedule.js';

export interface Env extends AuthConfig {
  DB: D1Database;
  ASSETS: Fetcher;
}
const invalid = (details: unknown): never => {
  throw new ApiError(422, 'VALIDATION', 'Please correct the highlighted fields.', details);
};
const notFound = (): never => {
  throw new ApiError(404, 'NOT_FOUND', 'Not found.');
};
function noteFrom(body: Record<string, unknown>): string | null {
  if (body['note'] === undefined || body['note'] === null) return null;
  if (typeof body['note'] !== 'string' || body['note'].length > 500)
    throw new ApiError(400, 'INVALID_NOTE', 'Note must be at most 500 characters.');
  return body['note'];
}
function confirmed(body: Record<string, unknown>): void {
  if (body['confirm'] !== true)
    throw new ApiError(400, 'CONFIRM_REQUIRED', 'Explicit confirm: true is required.');
}
function displayName(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    raw.trim() !== raw ||
    raw.length < 1 ||
    raw.length > 80 ||
    [...raw].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new ApiError(
      422,
      'INVALID_NAME',
      'Display name must contain 1–80 characters without surrounding whitespace or control characters.',
    );
  return raw;
}
function roleValue(raw: unknown): Role {
  if (raw !== 'ADMIN' && raw !== 'EDITOR')
    throw new ApiError(422, 'INVALID_ROLE', 'Role must be ADMIN or EDITOR.');
  return raw;
}
const userView = (u: UserRow) => ({
  id: u.id,
  email: u.login_id,
  displayName: u.display_name,
  role: u.role,
  disabled: !!u.disabled,
  createdAt: u.created_at,
  lastLoginAt: u.last_login_at,
});
async function usersRoute(
  request: Request,
  path: string,
  store: Store,
  user: User,
): Promise<Response> {
  requireAdmin(user);
  if (path === '/api/users' && request.method === 'GET') {
    const rows = await store.sql('SELECT * FROM users ORDER BY login_id').all<UserRow>();
    return ok({ users: rows.results.map(userView) });
  }
  if (path === '/api/users' && request.method === 'POST') {
    const body = object(await readJson(request));
    if (!validEmail(body['email']))
      throw new ApiError(422, 'INVALID_EMAIL', 'A valid staff email is required.');
    const email = body['email'].toLowerCase(),
      name = displayName(body['displayName']),
      role = roleValue(body['role']);
    if (await store.sql('SELECT id FROM users WHERE login_id=? COLLATE NOCASE', email).first())
      throw new ApiError(
        409,
        'DUPLICATE_EMAIL',
        'A user with this email already exists. Update the existing user instead.',
      );
    const count = await store.sql('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    if (count!.n >= 20)
      throw new ApiError(
        409,
        'USER_LIMIT',
        'At most 20 users are permitted (including disabled users).',
      );
    await store.transaction(
      user,
      [
        store.sql(
          'INSERT INTO users(login_id,display_name,role,created_at) VALUES(?,?,?,?)',
          email,
          name,
          role,
          new Date().toISOString(),
        ),
        store.audit(user, 'USER_CREATE', { email, name, role }),
      ],
      '(SELECT COUNT(*) FROM users)<20',
    );
    const row = await store.sql('SELECT * FROM users WHERE login_id=?', email).first<UserRow>();
    return ok({ user: userView(row!) }, 201);
  }
  const match = /^\/api\/users\/(\d+)$/.exec(path);
  if (match && request.method === 'PUT') {
    const body = object(await readJson(request)),
      id = Number(match[1]);
    if (
      !Object.keys(body).length ||
      Object.keys(body).some((k) => !['displayName', 'role', 'disabled'].includes(k))
    )
      throw new ApiError(
        400,
        'INVALID_PATCH',
        'Only displayName, role and disabled may be updated.',
      );
    const target = await store.sql('SELECT * FROM users WHERE id=?', id).first<UserRow>();
    if (!target) return notFound();
    const name =
      body['displayName'] === undefined ? target.display_name : displayName(body['displayName']);
    const role = body['role'] === undefined ? target.role : roleValue(body['role']);
    if (body['disabled'] !== undefined && typeof body['disabled'] !== 'boolean')
      throw new ApiError(422, 'INVALID_DISABLED', 'disabled must be boolean.');
    const disabled =
      body['disabled'] === undefined ? !!target.disabled : (body['disabled'] as boolean);
    const admins = await store
      .sql("SELECT COUNT(*) AS n FROM users WHERE role='ADMIN' AND disabled=0")
      .first<{ n: number }>();
    checkUserChange(user, target, { role, disabled }, admins!.n);
    const removes = target.role === 'ADMIN' && !target.disabled && (role !== 'ADMIN' || disabled);
    await store.transaction(
      user,
      [
        store.sql(
          'UPDATE users SET display_name=?,role=?,disabled=? WHERE id=?',
          name,
          role,
          Number(disabled),
          id,
        ),
        store.audit(user, 'USER_UPDATE', { id, name, role, disabled }),
      ],
      `EXISTS(SELECT 1 FROM users WHERE id=? AND role=? AND disabled=? AND display_name=?) ${removes ? "AND (SELECT COUNT(*) FROM users WHERE role='ADMIN' AND disabled=0)>1" : ''}`,
      [id, target.role, target.disabled, target.display_name],
    );
    return ok({
      user: userView({ ...target, display_name: name, role, disabled: Number(disabled) }),
    });
  }
  return notFound();
}
async function staff(request: Request, env: Env, path: string): Promise<Response> {
  const user = await new AccessAuthProvider(env.DB, env).authenticate(request);
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in through Cloudflare Access.');
  checkCsrf(request);
  const store = new Store(env.DB),
    method = request.method;
  if (path === '/api/auth/me' && method === 'GET')
    return ok({ user: { email: user.loginId, displayName: user.displayName, role: user.role } });
  if (path === '/api/users' || path.startsWith('/api/users/'))
    return usersRoute(request, path, store, user);
  if (['/api/draft/display', '/api/draft/station', '/api/draft/import'].includes(path))
    requireAdmin(user);
  if (path === '/api/snapshots' && method === 'GET') {
    const rows = await store
      .sql(
        `SELECT s.version,s.published_at AS publishedAt,s.published_by AS publishedBy,s.kind,s.note,s.rolled_back_from AS rolledBackFrom,
      json_array_length(s.body,'$.services') AS serviceCount, CASE WHEN p.version=s.version THEN 1 ELSE 0 END AS isLive
      FROM snapshots s LEFT JOIN live_pointer p ON p.id=1 ORDER BY s.version DESC`,
      )
      .all();
    return ok({ snapshots: rows.results.map((r) => ({ ...r, isLive: !!r['isLive'] })) });
  }
  const state = await store.draft();
  const live = state.live ? (JSON.parse(state.live.body) as ScheduleDocument) : null;
  if (path === '/api/draft' && method === 'GET')
    return ok({
      document: state.document,
      draftRevision: state.revision,
      liveVersion: state.live?.version ?? null,
      hasUnpublishedChanges: hasChanges(live, state.document),
      ...validateDocument(state.document),
    });
  if (path === '/api/publish/preview' && method === 'POST') {
    await readJson(request);
    return ok({
      diff: scheduleDiff(live, state.document),
      warnings: publishWarnings(state.document, live),
      ...validateDocument(state.document),
      draftRevision: state.revision,
      nextVersion: nextVersion(state.maximum),
    });
  }
  if (path === '/api/publish' && method === 'POST') {
    const body = object(await readJson(request));
    confirmed(body);
    if (!Number.isSafeInteger(body['draftRevision']) || body['draftRevision'] !== state.revision)
      throw new ApiError(
        409,
        'STALE_REVISION',
        'The draft changed. Preview it again before publishing.',
      );
    return ok(await store.publish(state, user, state.document, 'PUBLISH', noteFrom(body)));
  }
  if (path === '/api/rollback' && method === 'POST') {
    const body = object(await readJson(request));
    confirmed(body);
    if (!Number.isSafeInteger(body['version']) || Number(body['version']) < 1)
      throw new ApiError(400, 'INVALID_VERSION', 'A positive integer version is required.');
    const old = await store
      .sql('SELECT body FROM snapshots WHERE version=?', Number(body['version']))
      .first<{ body: string }>();
    if (!old) return notFound();
    let restored: unknown;
    try {
      restored = JSON.parse(old.body);
    } catch {
      return invalid(['The snapshot contains invalid JSON and cannot be restored.']);
    }
    const validated = validateScheduleDocument(restored);
    if (!validated.ok) return invalid(validated.errors);
    return ok(
      await store.publish(
        state,
        user,
        validated.data,
        'ROLLBACK',
        noteFrom(body),
        Number(body['version']),
      ),
    );
  }
  const serviceMatch = /^\/api\/draft\/services(?:\/([^/]+)(\/duplicate)?)?$/.exec(path);
  if (serviceMatch && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const id = serviceMatch[1],
      duplicate = !!serviceMatch[2];
    const original = state.document.services.find((s) => s.id === id);
    if (id && !original) return notFound();
    if (method === 'DELETE' && id && !duplicate) {
      await readJson(request);
      const revision = await store.edit(
        state,
        user,
        [store.sql('DELETE FROM draft_services WHERE id=?', id)],
        'SERVICE_DELETE',
        { id },
      );
      return ok({ draftRevision: revision });
    }
    if (!((method === 'POST' && (!id || duplicate)) || (method === 'PUT' && id && !duplicate)))
      return notFound();
    const body = object(await readJson(request));
    // Duplicate accepts overrides so a different time/day can pass the exact-duplicate defence.
    const raw = normalizeServiceInput({
      ...(duplicate ? original : {}),
      ...body,
      id: method === 'PUT' ? id : crypto.randomUUID(),
    });
    const issues = validateServiceStrict(raw, state.document);
    if (issues.errors.length) return invalid(issues.errors);
    const service = BusServiceSchema.parse(raw);
    if (method === 'POST' && state.document.services.length >= 300)
      throw new ApiError(422, 'SERVICE_LIMIT', 'At most 300 services are permitted.');
    const revision = await store.edit(
      state,
      user,
      [
        store.sql(
          'INSERT INTO draft_services(id,data,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,updated_by=excluded.updated_by',
          service.id,
          JSON.stringify(service),
          new Date().toISOString(),
          user.loginId,
        ),
      ],
      duplicate ? 'SERVICE_DUPLICATE' : method === 'PUT' ? 'SERVICE_UPDATE' : 'SERVICE_CREATE',
      { id: service.id },
    );
    return ok(
      { service, draftRevision: revision, warnings: issues.warnings },
      method === 'POST' ? 201 : 200,
    );
  }
  if (path === '/api/draft/discard' && method === 'POST') {
    await readJson(request);
    if (!live)
      throw new ApiError(409, 'NO_LIVE_SNAPSHOT', 'There is no published schedule to restore.');
    return ok({
      draftRevision: await store.edit(state, user, store.replace(live, user), 'DRAFT_DISCARD'),
    });
  }
  if (path === '/api/draft/import' && method === 'POST') {
    const raw = object(await readJson(request));
    if (Array.isArray(raw['services']) && raw['services'].length > 300)
      return invalid([
        {
          field: 'services',
          code: 'SERVICE_LIMIT',
          message_en: 'At most 300 services are permitted.',
          message_si: 'බස් සේවා 300 ක් දක්වා පමණක් ඇතුළත් කරන්න.',
        },
      ]);
    if (Array.isArray(raw['services']))
      raw['services'] = raw['services'].map(normalizeServiceInput);
    const shape = validateScheduleDocument(raw);
    if (!shape.ok) return invalid(shape.errors);
    const result = validateDocument(shape.data);
    if (!result.validation.ok) return invalid(result.validation.errors);
    return ok({
      draftRevision: await store.edit(state, user, store.replace(shape.data, user), 'DRAFT_IMPORT'),
      warnings: publishWarnings(shape.data, live),
    });
  }
  if (
    method === 'PUT' &&
    [
      '/api/draft/alert',
      '/api/draft/last-verified',
      '/api/draft/display',
      '/api/draft/station',
    ].includes(path)
  ) {
    const raw = await readJson(request);
    let column: string, value: string | null;
    if (path.endsWith('/alert')) {
      const errors = validateAlertStrict(raw);
      if (errors.length) return invalid(errors);
      column = 'alert';
      value = raw === null ? null : JSON.stringify(raw);
    } else if (path.endsWith('/last-verified')) {
      const date = object(raw)['lastVerified'],
        errors = validateLastVerified(date);
      if (errors.length) return invalid(errors);
      column = 'last_verified';
      value = date as string;
    } else if (path.endsWith('/display')) {
      const result = DisplaySettingsSchema.strict().safeParse(raw);
      if (!result.success) return invalid(result.error.issues);
      column = 'display';
      value = JSON.stringify(result.data);
    } else {
      const result = ScheduleDocumentSchema.safeParse({ ...state.document, station: raw });
      if (!result.success) return invalid(result.error.issues);
      const issues = validateDocument(result.data).issues.flatMap((s) => s.errors);
      if (issues.length) return invalid(issues);
      column = 'station';
      value = JSON.stringify(result.data.station);
    }
    return ok({
      draftRevision: await store.edit(
        state,
        user,
        [store.sql(`UPDATE draft_meta SET ${column}=? WHERE id=1`, value)],
        'DRAFT_META_UPDATE',
        { field: column },
      ),
    });
  }
  return notFound();
}
async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/.well-known/assetlinks.json' && request.method === 'GET') {
    return new Response(JSON.stringify(ASSET_LINKS), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  if (path === '/health' && request.method === 'GET') return ok({ time: new Date().toISOString() });
  if (path === '/schedule.json' && request.method === 'GET') {
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Server-Time': new Date().toISOString(),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'ETag, X-Server-Time, Date',
      'X-Content-Type-Options': 'nosniff',
    });
    const live = await new Store(env.DB).live();
    if (!live) {
      headers.set('Retry-After', '60');
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'NOT_PUBLISHED', message: 'No timetable has been published yet.' },
        }),
        { status: 503, headers },
      );
    }
    headers.set('ETag', live.etag);
    return new Response(
      matchesEtag(request.headers.get('If-None-Match'), live.etag) ? null : live.body,
      { status: matchesEtag(request.headers.get('If-None-Match'), live.etag) ? 304 : 200, headers },
    );
  }
  if (path === '/api' || path.startsWith('/api/')) return staff(request, env, path);
  return env.ASSETS.fetch(request);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname,
      api = path === '/api' || path.startsWith('/api/');
    try {
      const response = await route(request, env);
      // Assets receive their own CSP through public/_headers, including asset-first delivery.
      return api || path === '/schedule.json' || path === '/health'
        ? security(response, api)
        : response;
    } catch (error) {
      return security(
        fail(
          error instanceof ApiError
            ? error
            : new ApiError(
                500,
                'INTERNAL_ERROR',
                'The request could not be completed. Please try again.',
              ),
        ),
        api,
      );
    }
  },
} satisfies ExportedHandler<Env>;
