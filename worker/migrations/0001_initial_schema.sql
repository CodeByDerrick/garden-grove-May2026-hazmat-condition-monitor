CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  tier TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_checks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status_code INTEGER,
  error TEXT,
  content_hash TEXT,
  changed INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  observed_at TEXT NOT NULL,
  source_published_at TEXT,
  source_id TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_tier TEXT NOT NULL,
  category TEXT NOT NULL,
  value TEXT,
  units TEXT,
  summary TEXT NOT NULL,
  excerpt TEXT,
  confidence TEXT NOT NULL,
  severity TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 1,
  rule_priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS manual_overrides (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL,
  value TEXT,
  units TEXT,
  trend TEXT,
  summary TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  source_published_at TEXT,
  confidence TEXT NOT NULL,
  severity TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  text_excerpt TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE INDEX IF NOT EXISTS idx_events_observed_at ON events(observed_at);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_content_hash ON events(content_hash);
CREATE INDEX IF NOT EXISTS idx_source_checks_source_checked_at ON source_checks(source_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_raw_snapshots_source_checked_at ON raw_snapshots(source_id, checked_at);
