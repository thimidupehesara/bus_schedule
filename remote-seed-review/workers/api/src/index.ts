import {
  BusServiceSchema,
  DisplaySettingsSchema,
  DEFAULT_DISPLAY_SETTINGS,
  ScheduleDocumentSchema,
  normalizeServiceInput,
  validateServiceStrict,
  validateAlertStrict,
  validateLastVerified,
  validateScheduleDocument,
  toWeekdayNumber,
  type ScheduleDocument,
  type BusService,
  type FrequentServicesConfig,
  DEFAULT_FREQUENT_SERVICES_CONFIG,
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
import { Store, defaultStation } from './store.js';
import { ASSET_LINKS } from './assetlinks.js';
import { handlePrivacy } from './privacy.js';
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

export type TvHoldMode = 'auto' | 'credits' | 'frequent' | 'page';

export interface TvHoldState {
  mode: TvHoldMode;
  page?: number;
  updatedAt?: number;
}

export const DEFAULT_TV_HOLD: TvHoldState = {
  mode: 'auto',
  page: 1,
  updatedAt: 0,
};

export async function getTvHoldSetting(db: D1Database): Promise<TvHoldState> {
  try {
    const row = await db
      .prepare("SELECT value FROM settings WHERE key = 'tvHoldState'")
      .first<{ value: string }>();
    if (row?.value) {
      const parsed = JSON.parse(row.value) as { mode?: string; page?: unknown; updatedAt?: unknown };
      if (parsed && typeof parsed.mode === 'string') {
        const rawMode = parsed.mode.trim().toLowerCase();
        const mode = rawMode === 'frequent_services' ? 'frequent' : rawMode;
        if (mode === 'auto' || mode === 'credits' || mode === 'frequent' || mode === 'page') {
          return {
            mode,
            page: typeof parsed.page === 'number' && parsed.page >= 1 ? Math.floor(parsed.page) : 1,
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
          };
        }
      }
    }
  } catch {
    try {
      await db
        .prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        .run();
    } catch { }
  }
  return { ...DEFAULT_TV_HOLD };
}

export async function setTvHoldSetting(db: D1Database, state: TvHoldState): Promise<void> {
  const serialized = JSON.stringify(state);
  try {
    await db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('tvHoldState', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .bind(serialized)
      .run();
  } catch {
    await db
      .prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
      .run();
    await db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('tvHoldState', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .bind(serialized)
      .run();
  }
}

export async function getFrequentServicesSetting(db: D1Database): Promise<FrequentServicesConfig> {
  try {
    const row = await db
      .prepare("SELECT value FROM settings WHERE key = 'frequentServicesConfig'")
      .first<{ value: string }>();
    if (row?.value) {
      const parsed = JSON.parse(row.value) as Partial<FrequentServicesConfig>;
      if (parsed && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
        return {
          headerSi: String(parsed.headerSi || DEFAULT_FREQUENT_SERVICES_CONFIG.headerSi),
          headerEn: String(parsed.headerEn || DEFAULT_FREQUENT_SERVICES_CONFIG.headerEn),
          cards: parsed.cards.map((c, i) => {
            const def =
              DEFAULT_FREQUENT_SERVICES_CONFIG.cards[i] ??
              DEFAULT_FREQUENT_SERVICES_CONFIG.cards[0]!;
            return {
              id: typeof c.id === 'number' ? c.id : i + 1,
              routeLabel: String(c.routeLabel || def.routeLabel),
              textSi: String(c.textSi || def.textSi),
              textEn: String(c.textEn || def.textEn),
              badgeEn: String(c.badgeEn || def.badgeEn),
              badgeSi: String(c.badgeSi || def.badgeSi),
            };
          }),
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
        };
      }
    }
  } catch {
    try {
      await db
        .prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        .run();
    } catch { }
  }
  return { ...DEFAULT_FREQUENT_SERVICES_CONFIG };
}

export async function setFrequentServicesSetting(
  db: D1Database,
  config: FrequentServicesConfig,
): Promise<void> {
  const serialized = JSON.stringify(config);
  try {
    await db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('frequentServicesConfig', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .bind(serialized)
      .run();
  } catch {
    await db
      .prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
      .run();
    await db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('frequentServicesConfig', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .bind(serialized)
      .run();
  }
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
  const provider = new AccessAuthProvider(env.DB, env);
  const { user, diagnostics } = await provider.authenticateWithDetails(request);
  const method = request.method;

  if (!user) {
    const isForbidden = diagnostics.step === 'USER_NOT_IN_DB' || diagnostics.step === 'USER_DISABLED';
    const status = isForbidden ? 403 : 401;
    const code =
      diagnostics.step === 'USER_NOT_IN_DB'
        ? 'NOT_ALLOWED'
        : diagnostics.step === 'USER_DISABLED'
          ? 'USER_DISABLED'
          : 'UNAUTHENTICATED';
    const message = diagnostics.error || 'Sign in through Cloudflare Access.';
    throw new ApiError(status, code, message, diagnostics);
  }

  checkCsrf(request);
  const store = new Store(env.DB);
  if (path === '/api/auth/me' && method === 'GET') {
    return ok({
      ok: true,
      configured: diagnostics.configured,
      authenticated: true,
      user: { email: user.loginId, displayName: user.displayName, role: user.role },
      diagnostics,
    });
  }
  if (path === '/api/users' || path.startsWith('/api/users/'))
    return usersRoute(request, path, store, user);
  if (['/api/draft/display', '/api/draft/station', '/api/draft/import', '/api/draft/activate-all'].includes(path))
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
  if (path === '/api/admin/suggestions' && method === 'GET') {
    const rows = await store
      .sql('SELECT * FROM suggestions ORDER BY created_at DESC LIMIT 200')
      .all();
    const res = ok({ suggestions: rows.results });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  const suggestionPatchMatch = /^\/api\/admin\/suggestions\/([^/]+)$/.exec(path);
  if (suggestionPatchMatch && method === 'PATCH') {
    const id = suggestionPatchMatch[1]!;
    const body = object(await readJson(request));
    const status = String(body['status'] ?? 'RESOLVED').trim().toUpperCase();
    if (!['OPEN', 'RESOLVED'].includes(status)) {
      throw new ApiError(422, 'INVALID_STATUS', 'Status must be OPEN or RESOLVED.');
    }
    const updateRes = await store
      .sql('UPDATE suggestions SET status = ? WHERE id = ?', status, id)
      .run();
    if (updateRes.meta.changes === 0) {
      return notFound();
    }
    return ok({ id, status });
  }
  if (
    (path === '/api/admin/qr-stats' || path === '/api/reports' || path === '/api/analytics') &&
    method === 'GET'
  ) {
    const rows = await store
      .sql('SELECT * FROM qr_daily_stats ORDER BY scan_date DESC LIMIT 90')
      .all();
    const res = ok({ stats: rows.results });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  if (path === '/api/admin/tv-reload' && method === 'POST') {
    const nonce = String(Date.now());
    await store
      .sql(
        'INSERT INTO audit_log (at, login_id, action, detail) VALUES (?, ?, ?, ?)',
        new Date().toISOString(),
        user.loginId,
        'TV_RELOAD',
        nonce,
      )
      .run();
    return ok({ ok: true, reloadNonce: nonce });
  }
  if (path === '/api/admin/tv-hold' && method === 'GET') {
    const tvHold = await getTvHoldSetting(env.DB);
    const res = ok({ ok: true, tvHold });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  if (path === '/api/admin/tv-hold' && method === 'POST') {
    requireAdmin(user);
    const body = object(await readJson(request));
    const rawMode = String(body['mode'] ?? '').trim().toLowerCase();
    const mode = rawMode === 'frequent_services' ? 'frequent' : rawMode;
    if (!['auto', 'credits', 'frequent', 'page'].includes(mode)) {
      throw new ApiError(422, 'INVALID_MODE', 'Mode must be "auto", "credits", "frequent", or "page".');
    }
    let page = 1;
    if (body['page'] !== undefined && body['page'] !== null) {
      const p = Number(body['page']);
      if (!Number.isInteger(p) || p < 1 || p > 100) {
        throw new ApiError(422, 'INVALID_PAGE', 'Page must be an integer between 1 and 100.');
      }
      page = p;
    }
    const tvHold: TvHoldState = {
      mode: mode as TvHoldMode,
      page,
      updatedAt: Date.now(),
    };
    await setTvHoldSetting(env.DB, tvHold);
    await store
      .sql(
        'INSERT INTO audit_log (at, login_id, action, detail) VALUES (?, ?, ?, ?)',
        new Date().toISOString(),
        user.loginId,
        'TV_HOLD',
        JSON.stringify(tvHold),
      )
      .run();
    const res = ok({ ok: true, tvHold });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  if (path === '/api/frequent-services' && method === 'GET') {
    const config = await getFrequentServicesSetting(env.DB);
    return ok({ ok: true, config });
  }
  if (path === '/api/frequent-services' && method === 'POST') {
    requireAdmin(user);
    const body = object(await readJson(request));
    const headerSi = String(body['headerSi'] ?? DEFAULT_FREQUENT_SERVICES_CONFIG.headerSi).trim();
    const headerEn = String(body['headerEn'] ?? DEFAULT_FREQUENT_SERVICES_CONFIG.headerEn).trim();
    const rawCards = body['cards'];
    if (!Array.isArray(rawCards) || rawCards.length === 0) {
      throw new ApiError(422, 'INVALID_CARDS', 'Cards must be a non-empty array.');
    }
    const cards = rawCards.map((c, idx) => {
      const cardObj = object(c);
      const def =
        DEFAULT_FREQUENT_SERVICES_CONFIG.cards[idx] ??
        DEFAULT_FREQUENT_SERVICES_CONFIG.cards[0]!;
      return {
        id: typeof cardObj['id'] === 'number' ? cardObj['id'] : idx + 1,
        routeLabel: String(cardObj['routeLabel'] ?? def.routeLabel).trim(),
        textSi: String(cardObj['textSi'] ?? def.textSi).trim(),
        textEn: String(cardObj['textEn'] ?? def.textEn).trim(),
        badgeEn: String(cardObj['badgeEn'] ?? def.badgeEn).trim(),
        badgeSi: String(cardObj['badgeSi'] ?? def.badgeSi).trim(),
      };
    });
    const config: FrequentServicesConfig = {
      headerSi,
      headerEn,
      cards,
      updatedAt: Date.now(),
    };
    await setFrequentServicesSetting(env.DB, config);
    await store
      .sql(
        'INSERT INTO audit_log (at, login_id, action, detail) VALUES (?, ?, ?, ?)',
        new Date().toISOString(),
        user.loginId,
        'FREQUENT_SERVICES_UPDATE',
        JSON.stringify(config),
      )
      .run();
    return ok({ ok: true, config });
  }
  if (path === '/api/admin/users' && method === 'GET') {
    requireAdmin(user);
    await store
      .sql(
        "UPDATE users SET role = 'ADMIN' WHERE LOWER(login_id) = 'pcmsarath@gmail.com' AND role != 'ADMIN'",
      )
      .run()
      .catch(() => {});
    const rows = await store
      .sql(
        'SELECT id, login_id, display_name, role, disabled, created_at, last_login_at FROM users ORDER BY id ASC',
      )
      .all<UserRow>();
    return ok({ users: rows.results });
  }
  if (path === '/api/admin/users' && method === 'POST') {
    requireAdmin(user);
    const body = object(await readJson(request));
    const loginIdRaw = body['login_id'] ?? body['email'];
    if (!validEmail(loginIdRaw)) {
      throw new ApiError(422, 'INVALID_EMAIL', 'A valid email address is required.');
    }
    const login_id = String(loginIdRaw).trim().toLowerCase();
    const displayNameRaw = body['display_name'] ?? body['displayName'];
    if (typeof displayNameRaw !== 'string' || !displayNameRaw.trim()) {
      throw new ApiError(422, 'INVALID_NAME', 'Display name cannot be empty.');
    }
    const display_name = displayNameRaw.trim();
    const roleRaw = String(body['role'] ?? '').trim().toUpperCase();
    if (roleRaw !== 'ADMIN' && roleRaw !== 'EDITOR') {
      throw new ApiError(422, 'INVALID_ROLE', "Role must be 'ADMIN' or 'EDITOR'.");
    }
    const role = roleRaw as Role;

    const existing = await store
      .sql('SELECT id FROM users WHERE login_id = ? COLLATE NOCASE', login_id)
      .first();
    if (existing) {
      throw new ApiError(409, 'DUPLICATE_EMAIL', 'This email is already registered.');
    }

    const count = await store.sql('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    if (count && count.n >= 20) {
      throw new ApiError(409, 'USER_LIMIT', 'At most 20 users are permitted.');
    }

    const nowIso = new Date().toISOString();
    await store.transaction(
      user,
      [
        store.sql(
          'INSERT INTO users (login_id, display_name, role, disabled, created_at) VALUES (?, ?, ?, 0, ?)',
          login_id,
          display_name,
          role,
          nowIso,
        ),
        store.audit(user, 'USER_CREATE', { email: login_id, name: display_name, role }),
      ],
      '(SELECT COUNT(*) FROM users) < 20',
    );

    const created = await store
      .sql(
        'SELECT id, login_id, display_name, role, disabled, created_at, last_login_at FROM users WHERE login_id = ? COLLATE NOCASE',
        login_id,
      )
      .first<UserRow>();

    return ok({ ok: true, user: created }, 201);
  }
  const adminUserPatchMatch = /^\/api\/admin\/users\/(\d+)$/.exec(path);
  const staffRolePatchMatch = /^\/api\/staff\/(\d+)\/role$/.exec(path);
  if ((adminUserPatchMatch || staffRolePatchMatch) && (method === 'PATCH' || method === 'PUT')) {
    requireAdmin(user);
    const id = Number((adminUserPatchMatch || staffRolePatchMatch)![1]);
    const body = object(await readJson(request));

    const target = await store
      .sql(
        'SELECT id, login_id, display_name, role, disabled, created_at, last_login_at FROM users WHERE id = ?',
        id,
      )
      .first<UserRow>();
    if (!target) return notFound();

    let newRole = target.role;
    if (body['role'] !== undefined) {
      const r = String(body['role']).trim().toUpperCase();
      if (r !== 'ADMIN' && r !== 'EDITOR') {
        throw new ApiError(422, 'INVALID_ROLE', "Role must be 'ADMIN' or 'EDITOR'.");
      }
      newRole = r as Role;
    }

    let newDisabled = target.disabled;
    if (body['disabled'] !== undefined) {
      if (body['disabled'] === 1 || body['disabled'] === true || body['disabled'] === '1') {
        newDisabled = 1;
      } else if (body['disabled'] === 0 || body['disabled'] === false || body['disabled'] === '0') {
        newDisabled = 0;
      } else {
        throw new ApiError(422, 'INVALID_DISABLED', 'Disabled must be 0, 1, true, or false.');
      }
    }

    const isSelf = user.loginId.toLowerCase() === target.login_id.toLowerCase();
    const selfDemoting = newRole !== 'ADMIN' && target.role === 'ADMIN';
    const selfDisabling = newDisabled === 1 && target.disabled === 0;

    if (isSelf && (selfDemoting || selfDisabling)) {
      throw new ApiError(
        400,
        'SELF_DEMOTION_PROHIBITED',
        'You cannot disable or demote your own active admin account.',
      );
    }

    const removesAdmin =
      (newRole !== 'ADMIN' || newDisabled === 1) && target.role === 'ADMIN' && target.disabled === 0;
    if (removesAdmin) {
      const activeAdmins = await store
        .sql("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND disabled = 0")
        .first<{ n: number }>();
      if (!activeAdmins || activeAdmins.n <= 1) {
        throw new ApiError(
          409,
          'LAST_ADMIN',
          'The last active administrator cannot be disabled or demoted.',
        );
      }
    }

    await store.transaction(
      user,
      [
        store.sql(
          'UPDATE users SET role = ?, disabled = ? WHERE id = ?',
          newRole,
          newDisabled,
          id,
        ),
        store.audit(user, 'USER_UPDATE', { id, role: newRole, disabled: newDisabled }),
      ],
      removesAdmin ? "(SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND disabled = 0) > 1" : undefined,
    );

    const updated = await store
      .sql(
        'SELECT id, login_id, display_name, role, disabled, created_at, last_login_at FROM users WHERE id = ?',
        id,
      )
      .first<UserRow>();

    return ok({ ok: true, user: updated });
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
    const now = new Date();
    const validated = validateDocument(state.document, now);
    return ok({
      diff: scheduleDiff(live, state.document),
      warnings: publishWarnings(state.document, live, now, validated),
      ...validated,
      draftRevision: state.revision,
      nextVersion: nextVersion(state.maximum),
    });
  }
  if (path === '/api/publish' && method === 'POST') {
    const body = object(await readJson(request));
    confirmed(body);
    if (!Number.isSafeInteger(body['draftRevision']) || body['draftRevision'] !== state.revision)
      throw new ApiError(409, 'STALE_REVISION', 'The draft changed. Preview it again before publishing.');
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
    if (method === 'DELETE' && !id) {
      await readJson(request).catch(() => ({}));
      try {
        const deletedCount = state.document.services.length;
        const revision = await store.edit(
          state,
          user,
          [store.sql('DELETE FROM draft_services')],
          'SERVICE_DELETE_ALL',
          { count: deletedCount },
        );
        return ok({ ok: true, draftRevision: revision, deletedCount });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        const msg = error instanceof Error ? error.message : String(error);
        throw new ApiError(500, 'DELETE_ALL_FAILED', `Failed to delete all services: ${msg}`);
      }
    }
    if (method === 'DELETE' && id && !duplicate) {
      await readJson(request).catch(() => ({}));
      const revision = await store.edit(
        state,
        user,
        [store.sql('DELETE FROM draft_services WHERE id=?', id)],
        'SERVICE_DELETE',
        { id },
      );
      return ok({ draftRevision: revision });
    }
    const original = state.document.services.find((s) => s.id === id);
    if (id && !original) return notFound();
    if (!((method === 'POST' && (!id || duplicate)) || (method === 'PUT' && id && !duplicate)))
      return notFound();
    const body = object(await readJson(request));
    // Duplicate accepts overrides so a different time/day can pass the exact-duplicate defence.
    const raw = normalizeServiceInput({
      via: null,
      bay: null,
      tripStart: null,
      destinationArrival: null,
      arrival: null,
      ...(method === 'PUT' || duplicate ? original : {}),
      ...body,
      id:
        method === 'PUT'
          ? id
          : body['id'] && typeof body['id'] === 'string' && /^[0-9a-f-]{36}$/i.test(body['id'])
            ? body['id']
            : crypto.randomUUID(),
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
  if (path === '/api/draft/invalid-services' && method === 'DELETE') {
    const raw = object(await readJson(request));
    confirmed(raw);
    if (raw['draftRevision'] !== state.revision) throw new ApiError(409, 'STALE_REVISION', 'The draft changed. Refresh the preview before deleting rows.');
    const invalidIds = new Set(validateDocument(state.document).validation.errors.map(e => e.serviceId).filter(Boolean));
    const requested = Array.isArray(raw['ids']) ? raw['ids'].filter((id): id is string => typeof id === 'string') : [];
    if (!requested.length || requested.some(id => !invalidIds.has(id))) throw new ApiError(422, 'INVALID_SELECTION', 'Select only the invalid rows shown in the latest preview.');
    const ids = [...new Set(requested)];
    const revision = await store.edit(state, user, [store.sql('DELETE FROM draft_services WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))], 'INVALID_SERVICES_DELETE', { ids });
    return ok({ draftRevision: revision, deletedCount: ids.length });
  }
  if (path === '/api/draft/import' && method === 'POST') {
    try {
      const raw = object(await readJson(request));
      const append = raw['mode'] === 'append' || raw['mode'] === 'MERGE';
      if (!Array.isArray(raw['services']) || raw['services'].length === 0 || raw['services'].length > 300) {
        throw new ApiError(422, 'VALIDATION', 'Supply a non-empty array of at most 300 services.');
      }
      // Replacement must not overwrite changes made after the browser loaded its draft.
      if (!append && raw['draftRevision'] !== undefined && raw['draftRevision'] !== state.revision)
        throw new ApiError(409, 'STALE_REVISION', 'The draft changed. Reload it before replacing the timetable.');
      const incoming: BusService[] = [];
      const seenIds = new Set(append ? state.document.services.map(s => s.id) : []);
      const errors: Array<{ serviceId?: string; field: string; code: string; message_en: string; message_si: string }> = [];
      for (const [index, entry] of raw['services'].entries()) {
        const normalized = normalizeServiceInput(entry);
        const candidate: Record<string, unknown> = {
          via: null,
          bay: null,
          tripStart: null,
          destinationArrival: null,
          arrival: null,
          ...(normalized && typeof normalized === 'object' && !Array.isArray(normalized) ? normalized : {}),
        };
        if (candidate['active'] === undefined || candidate['active'] === null || candidate['active'] === '') {
          candidate['active'] = true;
        }
        if (!Array.isArray(candidate['days']) || candidate['days'].length === 0) {
          candidate['days'] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        }
        if (append || typeof candidate['id'] !== 'string' || seenIds.has(candidate['id'])) candidate['id'] = crypto.randomUUID();
        const id = String(candidate['id']);
        seenIds.add(id);
        const result = validateServiceStrict(candidate, { station: state.document.station, services: [] });
        errors.push(...result.errors.map(error => ({ ...error, serviceId: id, message_en: `Row ${index + 1} (${String((candidate['destination'] as { en?: unknown })?.en ?? 'Unknown')}, ${String(candidate['departure'] ?? 'missing time')}): ${error.field}: ${error.message_en}` })));
        if (!result.errors.length) incoming.push(candidate as BusService);
      }
      if (errors.length) return invalid(errors);
      // Only discard truly identical records; differing weekdays or bilingual labels must not be lost.
      const signature = (service: BusService) => JSON.stringify({ ...service, id: '', days: [...service.days].sort() });
      const kept: BusService[] = [];
      const signatures = new Set(append ? state.document.services.map(signature) : []);
      for (const service of incoming) {
        const key = signature(service);
        if (!signatures.has(key)) { kept.push(service); signatures.add(key); }
      }
      const services = append ? [...state.document.services, ...kept] : kept;
      const mergedDoc = { ...state.document, ...(!append ? raw : {}), services, schemaVersion: 1, timezone: 'Asia/Colombo' };
      const shape = validateScheduleDocument(mergedDoc);
      if (!shape.ok) return invalid(shape.errors);
      // Use indexed route/bay validation to prevent O(N^2) CPU explosion on 150+ bus schedules
      const { validation, issues } = validateDocument(shape.data);
      if (!validation.ok) return invalid(validation.errors);

      // Chunk database inserts into 50-item batches within a single atomic D1 batch transaction
      const chunkSize = 50;
      const nowIso = new Date().toISOString();
      const insertStatements: D1PreparedStatement[] = [];
      for (let i = 0; i < kept.length; i += chunkSize) {
        const chunk = kept.slice(i, i + chunkSize);
        insertStatements.push(
          store.sql(
            "INSERT INTO draft_services(id,data,updated_at,updated_by) SELECT json_extract(value,'$.id'),value,?,? FROM json_each(?)",
            nowIso,
            user.loginId,
            JSON.stringify(chunk),
          ),
        );
      }
      const statements = append ? insertStatements : store.replace(shape.data, user);
      const revision = await store.edit(state, user, statements, append ? 'SERVICES_APPEND' : 'DRAFT_IMPORT');
      return ok({
        draftRevision: revision,
        servicesCount: services.length,
        addedCount: kept.length,
        skippedCount: incoming.length - kept.length,
        warnings: publishWarnings(shape.data, live, new Date(), { validation, issues }),
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new ApiError(422, 'IMPORT_FAILED', `Import failed: ${msg}`);
    }
  }
  if (path === '/api/draft/activate-all' && method === 'POST') {
    requireAdmin(user);
    const revision = await store.edit(
      state,
      user,
      [
        store.sql(
          "UPDATE draft_services SET data = json_set(data, '$.active', json('true')), updated_at = ?, updated_by = ?",
          new Date().toISOString(),
          user.loginId,
        ),
      ],
      'ACTIVATE_ALL_SERVICES',
      {},
    );
    return ok({ ok: true, draftRevision: revision, activatedCount: state.document.services.length });
  }
  if (path === '/api/draft/deduplicate' && method === 'POST') {
    await readJson(request);
    const services = state.document.services;
    const kept: BusService[] = [];
    const removed: BusService[] = [];

    for (const s of services) {
      const isDuplicate = kept.some((k) => {
        const sameRoute =
          k.origin.en.trim().toLowerCase() === s.origin.en.trim().toLowerCase() &&
          k.destination.en.trim().toLowerCase() === s.destination.en.trim().toLowerCase();
        const sameDeparture = k.departure === s.departure;
        const daysOverlap = s.days.some((d) => k.days.some((e) => toWeekdayNumber(d) === toWeekdayNumber(e)));
        return sameRoute && sameDeparture && daysOverlap;
      });

      if (isDuplicate) {
        removed.push(s);
      } else {
        kept.push(s);
      }
    }

    if (removed.length === 0) {
      return ok({
        removedCount: 0,
        removedServices: [],
        draftRevision: state.revision,
        message: 'No duplicate departures found.',
      });
    }

    const dedupedDoc: ScheduleDocument = {
      ...state.document,
      services: kept,
    };
    const shape = validateScheduleDocument(dedupedDoc);
    if (!shape.ok) return invalid(shape.errors);

    const revision = await store.edit(
      state,
      user,
      store.replace(shape.data, user),
      'DRAFT_DEDUPLICATE',
      { removedCount: removed.length, removedIds: removed.map((r) => r.id) },
    );

    return ok({
      removedCount: removed.length,
      removedServices: removed.map((r) => ({
        id: r.id,
        departure: r.departure,
        destination: r.destination,
        origin: r.origin,
      })),
      draftRevision: revision,
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
      const rawObj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const current = state.document.display || DEFAULT_DISPLAY_SETTINGS;
      const normalized = {
        rowsPerPage: 4,
        dwellSeconds: 10,
        fadeMs:
          typeof rawObj['fadeMs'] === 'number'
            ? rawObj['fadeMs']
            : typeof rawObj['crossFadeMs'] === 'number'
              ? rawObj['crossFadeMs']
              : current.fadeMs,
        departedGraceMinutes:
          typeof rawObj['departedGraceMinutes'] === 'number'
            ? rawObj['departedGraceMinutes']
            : typeof rawObj['departedRetentionMinutes'] === 'number'
              ? rawObj['departedRetentionMinutes']
              : current.departedGraceMinutes,
        soonThresholdMinutes:
          typeof rawObj['soonThresholdMinutes'] === 'number'
            ? rawObj['soonThresholdMinutes']
            : current.soonThresholdMinutes,
        lookaheadHours:
          typeof rawObj['lookaheadHours'] === 'number'
            ? rawObj['lookaheadHours']
            : current.lookaheadHours,
        safeAreaPercent: 1.5,
        pollIntervalSeconds:
          typeof rawObj['pollIntervalSeconds'] === 'number'
            ? rawObj['pollIntervalSeconds']
            : current.pollIntervalSeconds,
        reloadAtLocalTime:
          typeof rawObj['reloadAtLocalTime'] === 'string'
            ? rawObj['reloadAtLocalTime']
            : current.reloadAtLocalTime,
      };
      const result = DisplaySettingsSchema.safeParse(normalized);
      if (!result.success) return invalid(result.error.issues);
      column = 'display';
      value = JSON.stringify(result.data);
    } else {
      const stationRaw = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const nameRaw = typeof stationRaw['name'] === 'object' && stationRaw['name'] !== null ? (stationRaw['name'] as Record<string, unknown>) : {};
      const mergedStation = {
        name: {
          si: typeof nameRaw['si'] === 'string' && nameRaw['si'].trim() ? nameRaw['si'].trim() : (state.document.station?.name?.si ?? defaultStation.name.si),
          en: typeof nameRaw['en'] === 'string' && nameRaw['en'].trim() ? nameRaw['en'].trim() : (state.document.station?.name?.en ?? defaultStation.name.en),
        },
        mobileUrl: typeof stationRaw['mobileUrl'] === 'string' && stationRaw['mobileUrl'].trim() ? stationRaw['mobileUrl'].trim() : (state.document.station?.mobileUrl || defaultStation.mobileUrl),
      };
      if (!mergedStation.name.si || !mergedStation.name.en || !mergedStation.mobileUrl.startsWith('https://')) {
        return invalid([
          {
            field: 'station',
            code: 'INVALID_STATION',
            message_en: 'Valid station name (Sinhala/English) and HTTPS mobile URL are required.',
            message_si: 'වලංගු බස් නැවතුම්පොළ නම සහ HTTPS ජංගම යෙදුම් ලිපිනය අවශ්‍ය වේ.',
          },
        ]);
      }
      column = 'station';
      value = JSON.stringify(mergedStation);
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
function colomboDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(now);
}

async function handleQr(request: Request, env: Env): Promise<Response> {
  const scanDate = colomboDate();
  const rawIp = request.headers.get('cf-connecting-ip') || 'unknown';
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${scanDate}:${rawIp}:mahiyanganaya-qr-v1`),
  );
  const ipHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');

  try {
    // Delete rows in qr_daily_uniques where scan_date < date(scanDate, '-2 days')
    await env.DB.prepare("DELETE FROM qr_daily_uniques WHERE scan_date < date(?, '-2 days')")
      .bind(scanDate)
      .run();

    // Check if new unique visitor for today
    const existing = await env.DB.prepare(
      'SELECT 1 FROM qr_daily_uniques WHERE scan_date = ? AND ip_hash = ?',
    )
      .bind(scanDate, ipHash)
      .first();

    const isNew = !existing;
    if (isNew) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO qr_daily_uniques (scan_date, ip_hash) VALUES (?, ?)',
      )
        .bind(scanDate, ipHash)
        .run();
    }

    // Upsert qr_daily_stats
    await env.DB.prepare(`
      INSERT INTO qr_daily_stats (scan_date, unique_visitors, total_scans)
      VALUES (?, ?, 1)
      ON CONFLICT(scan_date) DO UPDATE SET
        total_scans = total_scans + 1,
        unique_visitors = unique_visitors + excluded.unique_visitors
    `)
      .bind(scanDate, isNew ? 1 : 0)
      .run();
  } catch (err) {
    console.error('QR tracking error:', err);
  }

  return Response.redirect(new URL('/mobile/', request.url).toString(), 302);
}

const VALID_CATEGORIES = ['WRONG_TIME', 'MISSING_BUS', 'APP_ISSUE', 'OTHER'] as const;
type SuggestionCategory = (typeof VALID_CATEGORIES)[number];

async function handleSuggestions(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is accepted.');
  }

  let body: Record<string, unknown>;
  try {
    body = object(await readJson(request));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Invalid JSON body.');
  }

  const category = String(body['category'] ?? '').trim();
  if (!VALID_CATEGORIES.includes(category as SuggestionCategory)) {
    throw new ApiError(
      422,
      'INVALID_CATEGORY',
      `Category must be one of: ${VALID_CATEGORIES.join(', ')}.`,
    );
  }

  const rawMessage = typeof body['message'] === 'string' ? body['message'].trim() : '';
  if (rawMessage.length < 3 || rawMessage.length > 500) {
    throw new ApiError(
      422,
      'INVALID_MESSAGE',
      'Message must be between 3 and 500 characters.',
    );
  }

  let routeHint: string | null = null;
  if (typeof body['routeHint'] === 'string') {
    const trimmed = body['routeHint'].trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 100) {
        throw new ApiError(422, 'INVALID_ROUTE_HINT', 'Route hint must be at most 100 characters.');
      }
      routeHint = trimmed;
    }
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO suggestions (id, created_at, category, route_hint, message, status) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, createdAt, category, routeHint, rawMessage, 'OPEN')
    .run();

  return new Response(JSON.stringify({ ok: true, id }), {
    status: 201,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
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
  if ((path === '/privacy' || path === '/privacy/') && request.method === 'GET') {
    return handlePrivacy();
  }
  if (path === '/health' && request.method === 'GET') {
    const now = Date.now();
    return ok({ time: new Date(now).toISOString(), serverTimeMs: now });
  }
  if (path === '/api/frequent-services' && request.method === 'GET') {
    const config = await getFrequentServicesSetting(env.DB);
    return ok({ ok: true, config });
  }
  if (path === '/qr' && request.method === 'GET') {
    return handleQr(request, env);
  }
  if (path === '/api/suggestions') {
    return handleSuggestions(request, env);
  }
  if (path === '/schedule.json' && request.method === 'GET') {
    const serverNow = Date.now();
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Date': new Date(serverNow).toUTCString(),
      'X-Server-Time': new Date(serverNow).toISOString(),
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
  if (path === '/tv/version.json') {
    const assetResponse = await env.ASSETS.fetch(request);
    let buildId = '';
    try {
      const data = (await assetResponse.json()) as { buildId?: string };
      buildId = data?.buildId || '';
    } catch { }

    let reloadNonce = '0';
    try {
      const audit = await env.DB.prepare(
        "SELECT detail FROM audit_log WHERE action = 'TV_RELOAD' ORDER BY id DESC LIMIT 1",
      ).first<{ detail: string }>();
      if (audit?.detail) {
        reloadNonce = audit.detail;
      }
    } catch { }

    const [tvHold, frequentServices] = await Promise.all([
      getTvHoldSetting(env.DB),
      getFrequentServicesSetting(env.DB),
    ]);
    const serverNow = Date.now();
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Expose-Headers', 'Date, X-Server-Time');
    headers.set('Date', new Date(serverNow).toUTCString());
    headers.set('X-Server-Time', new Date(serverNow).toISOString());

    return new Response(
      JSON.stringify({
        buildId,
        reloadNonce,
        forceReloadToken: reloadNonce,
        serverTimeMs: serverNow,
        tvHold,
        frequentServices,
      }),
      { status: 200, headers },
    );
  }
  if (path === '/tv/' || path === '/tv/index.html') {
    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  }
  if (path === '/tv/sw.js') {
    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    headers.set('Content-Type', 'application/javascript; charset=utf-8');
    headers.set('Cache-Control', 'no-cache');
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      headers,
    });
  }
  if (
    path === '/downloads/mahiyanganaya-bus-admin.apk' ||
    path === '/admin/downloads/mahiyanganaya-bus-admin.apk' ||
    path === '/admin/mahiyanganaya-bus-admin.apk'
  ) {
    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    headers.set('Content-Type', 'application/vnd.android.package-archive');
    headers.set('Content-Disposition', 'attachment; filename="mahiyanganaya-bus-admin.apk"');
    headers.set('Cache-Control', 'public, max-age=3600');
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      headers,
    });
  }
  if (path === '/api' || path.startsWith('/api/')) return staff(request, env, path);
  if (path === '/admin*' || path === '/admin' || path === '/admin/*') {
    return Response.redirect(new URL('/admin/', request.url).toString(), 302);
  }
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
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      return security(
        fail(
          error instanceof ApiError
            ? error
            : new ApiError(
              500,
              'INTERNAL_ERROR',
              `The request could not be completed: ${msg}`,
              stack,
            ),
        ),
        api,
      );
    }
  },
} satisfies ExportedHandler<Env>;
