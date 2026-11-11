import { DEFAULT_DISPLAY_SETTINGS, colomboDate, type ScheduleDocument } from '@bus-schedule/shared';
import { type User } from './auth.js';
import { ApiError } from './http.js';
import { makeEtag, nextVersion, sortServices, validateDocument } from './schedule.js';
export type Snapshot = {
  version: number;
  published_at: string;
  published_by: string;
  kind: string;
  rolled_back_from: number | null;
  note: string | null;
  body: string;
  etag: string;
};
type Meta = {
  station: string;
  alert: string | null;
  display: string;
  last_verified: string;
  revision: number;
};
export type DraftState = {
  document: ScheduleDocument;
  revision: number;
  maximum: number;
  live: Snapshot | null;
};
export const defaultStation: ScheduleDocument['station'] = {
  name: { si: 'මහියංගනය බස් නැවතුම්පොළ', en: 'Mahiyanganaya Bus Stand' },
  mobileUrl: 'https://example.invalid',
};
export class Store {
  constructor(public db: D1Database) {}
  sql(query: string, ...args: (string | number | null)[]) {
    return this.db.prepare(query).bind(...args);
  }
  audit(user: User, action: string, detail: unknown = null) {
    return this.sql(
      'INSERT INTO audit_log(at,login_id,action,detail) VALUES(?,?,?,?)',
      new Date().toISOString(),
      user.loginId,
      action,
      JSON.stringify(detail),
    );
  }
  live(): Promise<Snapshot | null> {
    return this.sql(
      'SELECT s.* FROM snapshots s JOIN live_pointer p ON s.version=p.version WHERE p.id=1',
    ).first<Snapshot>();
  }
  async initialize(): Promise<void> {
    const now = new Date().toISOString();
    // Both inserts see the same transaction; a concurrent initializer cannot overwrite an existing draft.
    await this.db.batch([
      this.sql(
        `INSERT OR IGNORE INTO draft_services(id,data,updated_at,updated_by)
        SELECT json_extract(j.value,'$.id'), j.value, ?, 'system' FROM snapshots s JOIN live_pointer p ON s.version=p.version, json_each(s.body,'$.services') j
        WHERE p.id=1 AND NOT EXISTS(SELECT 1 FROM draft_meta WHERE id=1)`,
        now,
      ),
      this.sql(
        `INSERT OR IGNORE INTO draft_meta(id,station,alert,display,last_verified,revision,updated_at,updated_by)
        VALUES(1,COALESCE((SELECT json_extract(s.body,'$.station') FROM snapshots s JOIN live_pointer p ON s.version=p.version WHERE p.id=1),?),
        (SELECT json_extract(s.body,'$.alert') FROM snapshots s JOIN live_pointer p ON s.version=p.version WHERE p.id=1),
        COALESCE((SELECT json_extract(s.body,'$.display') FROM snapshots s JOIN live_pointer p ON s.version=p.version WHERE p.id=1),?),
        COALESCE((SELECT json_extract(s.body,'$.lastVerified') FROM snapshots s JOIN live_pointer p ON s.version=p.version WHERE p.id=1),?),1,?,'system')`,
        JSON.stringify(defaultStation),
        JSON.stringify(DEFAULT_DISPLAY_SETTINGS),
        colomboDate(),
        now,
      ),
    ]);
  }
  async draft(): Promise<DraftState> {
    await this.initialize();
    const result = await this.db.batch([
      this.sql('SELECT * FROM draft_meta WHERE id=1'),
      this.sql('SELECT data FROM draft_services'),
      this.sql(
        'SELECT s.* FROM snapshots s JOIN live_pointer p ON s.version=p.version WHERE p.id=1',
      ),
      this.sql('SELECT COALESCE(MAX(version),0) AS maximum FROM snapshots'),
    ]);
    const meta = result[0]!.results[0] as unknown as Meta;
    const live = (result[2]!.results[0] as unknown as Snapshot) ?? null;
    const maximum = Number((result[3]!.results[0] as { maximum: number }).maximum);
    return {
      revision: meta.revision,
      maximum,
      live,
      document: {
        schemaVersion: 1,
        version: live?.version ?? 1,
        publishedAt: live?.published_at ?? new Date().toISOString(),
        timezone: 'Asia/Colombo',
        station: JSON.parse(meta.station),
        alert: meta.alert ? JSON.parse(meta.alert) : null,
        display: JSON.parse(meta.display),
        lastVerified: meta.last_verified,
        services: sortServices(
          result[1]!.results.map((row) => JSON.parse((row as { data: string }).data)),
        ),
      },
    };
  }
  guard(condition: string, ...args: (string | number | null)[]) {
    return this.sql(
      `INSERT INTO mutation_guard(id) VALUES(CASE WHEN ${condition} THEN 1 ELSE 0 END)`,
      ...args,
    );
  }
  async transaction(
    user: User,
    statements: D1PreparedStatement[],
    condition = '1=1',
    args: (string | number | null)[] = [],
  ): Promise<void> {
    try {
      await this.db.batch([
        this.guard(
          `EXISTS(SELECT 1 FROM users WHERE login_id=? COLLATE NOCASE AND disabled=0 AND role=?) AND (${condition})`,
          user.loginId,
          user.role,
          ...args,
        ),
        ...statements,
        this.sql('DELETE FROM mutation_guard'),
      ]);
    } catch (error) {
      // Never return raw database messages (which may contain submitted values).
      if (error instanceof Error && /CHECK constraint|UNIQUE constraint/i.test(error.message))
        throw new ApiError(409, 'CONFLICT', 'The data changed. Reload and preview again.');
      throw error;
    }
  }
  revision(user: User) {
    return this.sql(
      'UPDATE draft_meta SET revision=revision+1,updated_at=?,updated_by=? WHERE id=1',
      new Date().toISOString(),
      user.loginId,
    );
  }
  replace(document: ScheduleDocument, user: User): D1PreparedStatement[] {
    const now = new Date().toISOString();
    return [
      this.sql('DELETE FROM draft_services'),
      // json_each keeps large imports well below D1's statement/binding limits.
      this.sql(
        "INSERT INTO draft_services(id,data,updated_at,updated_by) SELECT json_extract(value,'$.id'),value,?,? FROM json_each(?)",
        now,
        user.loginId,
        JSON.stringify(document.services),
      ),
      this.sql(
        'UPDATE draft_meta SET station=?,alert=?,display=?,last_verified=? WHERE id=1',
        JSON.stringify(document.station),
        document.alert ? JSON.stringify(document.alert) : null,
        JSON.stringify(document.display),
        document.lastVerified,
      ),
    ];
  }
  async edit(
    state: DraftState,
    user: User,
    statements: D1PreparedStatement[],
    action: string,
    detail: unknown = null,
  ) {
    await this.transaction(
      user,
      [...statements, this.revision(user), this.audit(user, action, detail)],
      '(SELECT revision FROM draft_meta WHERE id=1)=? AND (SELECT COALESCE(MAX(version),0) FROM snapshots)=?',
      [state.revision, state.maximum],
    );
    return state.revision + 1;
  }
  async publish(
    state: DraftState,
    user: User,
    source: ScheduleDocument,
    kind: 'PUBLISH' | 'ROLLBACK',
    note: string | null,
    rolledBackFrom: number | null = null,
  ) {
    const version = nextVersion(state.maximum),
      now = new Date().toISOString();
    const document: ScheduleDocument = {
      ...source,
      schemaVersion: 1,
      version,
      publishedAt: now,
      services: sortServices(source.services),
    };
    const { validation } = validateDocument(document);
    if (!validation.ok)
      throw new ApiError(
        422,
        'VALIDATION',
        'Correct all errors before publishing.',
        validation.errors,
      );
    const body = JSON.stringify(document); // The exact persisted bytes are served unchanged.
    const etag = await makeEtag(version, body);
    await this.transaction(
      user,
      [
        this.sql(
          'INSERT INTO snapshots(version,published_at,published_by,kind,rolled_back_from,note,body,etag) VALUES(?,?,?,?,?,?,?,?)',
          version,
          now,
          user.loginId,
          kind,
          rolledBackFrom,
          note,
          body,
          etag,
        ),
        this.sql(
          'INSERT INTO live_pointer(id,version) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version',
          version,
        ),
        ...(kind === 'ROLLBACK' ? [...this.replace(document, user), this.revision(user)] : []),
        this.audit(user, kind, { version, rolledBackFrom, note }),
        this.sql(
          'DELETE FROM snapshots WHERE version NOT IN (SELECT version FROM snapshots ORDER BY version DESC LIMIT 50) AND version NOT IN (SELECT version FROM live_pointer) AND version != (SELECT MAX(version) FROM snapshots)',
        ),
      ],
      '(SELECT revision FROM draft_meta WHERE id=1)=? AND (SELECT COALESCE(MAX(version),0) FROM snapshots)=?',
      [state.revision, state.maximum],
    );
    return { version, etag, draftRevision: state.revision + (kind === 'ROLLBACK' ? 1 : 0) };
  }
}
