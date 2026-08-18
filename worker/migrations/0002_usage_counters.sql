-- Usage counters must be persisted before scheduled polling is enabled or scaled.
-- This table is intentionally generic so Worker requests, D1 operations, source fetches,
-- public API requests, and failure counts can share the same daily bucket shape.
CREATE TABLE IF NOT EXISTS usage_counters (
  metric TEXT NOT NULL,
  bucket_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (metric, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_bucket_start ON usage_counters(bucket_start);
