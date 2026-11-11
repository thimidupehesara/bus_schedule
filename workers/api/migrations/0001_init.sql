CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','EDITOR')),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE draft_services (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
CREATE TABLE draft_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1), station TEXT NOT NULL, alert TEXT, display TEXT NOT NULL,
  last_verified TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE TABLE snapshots (
  version INTEGER PRIMARY KEY, published_at TEXT NOT NULL, published_by TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PUBLISH','ROLLBACK','SEED')),
  rolled_back_from INTEGER, note TEXT, body TEXT NOT NULL, etag TEXT NOT NULL
);
CREATE TABLE live_pointer (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL REFERENCES snapshots(version));
CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, login_id TEXT, action TEXT NOT NULL, detail TEXT);
CREATE INDEX idx_audit_at ON audit_log(at);
-- A failed optimistic guard aborts the entire D1 batch. This row never persists.
CREATE TABLE mutation_guard (id INTEGER PRIMARY KEY CHECK (id = 1));

-- Defense in depth for API and bootstrap CLI, evaluated inside each write.
CREATE TRIGGER users_limit BEFORE INSERT ON users WHEN (SELECT COUNT(*) FROM users) >= 20
BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: user limit'); END;
CREATE TRIGGER users_last_admin_update BEFORE UPDATE OF role,disabled ON users
WHEN OLD.role='ADMIN' AND OLD.disabled=0 AND (NEW.role!='ADMIN' OR NEW.disabled!=0)
AND (SELECT COUNT(*) FROM users WHERE role='ADMIN' AND disabled=0)<=1
BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: last active admin'); END;
CREATE TRIGGER users_last_admin_delete BEFORE DELETE ON users
WHEN OLD.role='ADMIN' AND OLD.disabled=0 AND (SELECT COUNT(*) FROM users WHERE role='ADMIN' AND disabled=0)<=1
BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: last active admin'); END;
