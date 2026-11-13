CREATE TABLE IF NOT EXISTS qr_daily_stats (
  scan_date TEXT PRIMARY KEY,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  total_scans INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS qr_daily_uniques (
  scan_date TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (scan_date, ip_hash)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('WRONG_TIME', 'MISSING_BUS', 'APP_ISSUE', 'OTHER')),
  route_hint TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_suggestions_created ON suggestions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_uniques_date ON qr_daily_uniques(scan_date);

