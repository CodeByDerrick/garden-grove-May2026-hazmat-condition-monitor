type D1Result = {
  success: boolean;
  meta?: {
    changes?: number;
  };
};

type D1QueryResult<T> = {
  results?: T[];
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<D1QueryResult<T>>;
  run(): Promise<D1Result>;
};

type D1DatabaseBinding = {
  prepare(query: string): D1PreparedStatement;
};

export type WorkerEnv = {
  DB?: D1DatabaseBinding;
};

export type StoredHazmatEvent = {
  id: string;
  observedAt: string;
  sourcePublishedAt?: string;
  sourceName: string;
  sourceUrl: string;
  sourceTier: string;
  category: string;
  value?: string | number;
  units?: string;
  summary: string;
  excerpt?: string;
  confidence: string;
  severity: string;
  contentHash: string;
  sourcePriority?: number;
  rulePriority?: number;
};

export type SourceCheckInput = {
  id: string;
  sourceId: string;
  checkedAt: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
  contentHash?: string;
  changed?: boolean;
};

export type SourceHealth = {
  sourceName: string;
  sourceUrl?: string;
  lastCheckedAt: string;
  ok: boolean;
  lastChangedAt?: string;
  error?: string;
};

export type ManualOverride = {
  id: string;
  enabled: boolean;
  category: string;
  value?: string;
  units?: string;
  trend?: string;
  summary: string;
  sourceName?: string;
  sourceUrl?: string;
  sourcePublishedAt?: string;
  confidence: string;
  severity: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

type EventRow = {
  id: string;
  observed_at: string;
  source_published_at?: string;
  source_name: string;
  source_url: string;
  source_tier: string;
  category: string;
  value?: string;
  units?: string;
  summary: string;
  excerpt?: string;
  confidence: string;
  severity: string;
  content_hash: string;
  source_priority: number;
  rule_priority: number;
};

type SourceHealthRow = {
  source_name: string;
  source_url?: string;
  last_checked_at?: string;
  ok?: number;
  last_changed_at?: string;
  error?: string;
};

type ManualOverrideRow = {
  id: string;
  enabled: number;
  category: string;
  value?: string;
  units?: string;
  trend?: string;
  summary: string;
  source_name?: string;
  source_url?: string;
  source_published_at?: string;
  confidence: string;
  severity: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
};

function requireDb(env: WorkerEnv): D1DatabaseBinding {
  if (!env.DB) {
    throw new Error('D1 binding DB is not configured.');
  }

  return env.DB;
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 50;
  }

  return Math.max(1, Math.min(Math.floor(limit), 100));
}

function optionalString(value: string | number | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  return String(value);
}

function mapEventRow(row: EventRow): StoredHazmatEvent {
  return {
    id: row.id,
    observedAt: row.observed_at,
    sourcePublishedAt: row.source_published_at || undefined,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourceTier: row.source_tier,
    category: row.category,
    value: row.value || undefined,
    units: row.units || undefined,
    summary: row.summary,
    excerpt: row.excerpt || undefined,
    confidence: row.confidence,
    severity: row.severity,
    contentHash: row.content_hash,
    sourcePriority: row.source_priority,
    rulePriority: row.rule_priority,
  };
}

export async function listRecentEvents(env: WorkerEnv, limit = 50): Promise<StoredHazmatEvent[]> {
  const db = requireDb(env);
  const result = await db
    .prepare(
      `SELECT id, observed_at, source_published_at, source_name, source_url, source_tier,
              category, value, units, summary, excerpt, confidence, severity, content_hash,
              source_priority, rule_priority
         FROM events
        ORDER BY observed_at DESC, created_at DESC
        LIMIT ?`,
    )
    .bind(clampLimit(limit))
    .all<EventRow>();

  return (result.results ?? []).map(mapEventRow);
}

export async function insertEventIfNew(env: WorkerEnv, event: StoredHazmatEvent): Promise<boolean> {
  const db = requireDb(env);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO events (
         id, observed_at, source_published_at, source_id, source_name, source_url, source_tier,
         category, value, units, summary, excerpt, confidence, severity, content_hash,
         source_priority, rule_priority, created_at
       ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.id,
      event.observedAt,
      event.sourcePublishedAt ?? null,
      event.sourceName,
      event.sourceUrl,
      event.sourceTier,
      event.category,
      optionalString(event.value),
      event.units ?? null,
      event.summary,
      event.excerpt ?? null,
      event.confidence,
      event.severity,
      event.contentHash,
      event.sourcePriority ?? 1,
      event.rulePriority ?? 0,
      now,
    )
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function recordSourceCheck(env: WorkerEnv, check: SourceCheckInput): Promise<void> {
  const db = requireDb(env);
  await db
    .prepare(
      `INSERT INTO source_checks (
         id, source_id, checked_at, ok, status_code, error, content_hash, changed
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      check.id,
      check.sourceId,
      check.checkedAt,
      check.ok ? 1 : 0,
      check.statusCode ?? null,
      check.error ?? null,
      check.contentHash ?? null,
      check.changed ? 1 : 0,
    )
    .run();
}

export async function listSourceHealth(env: WorkerEnv): Promise<SourceHealth[]> {
  const db = requireDb(env);
  const result = await db
    .prepare(
      `SELECT s.name AS source_name,
              s.url AS source_url,
              latest.checked_at AS last_checked_at,
              latest.ok AS ok,
              CASE WHEN latest.changed = 1 THEN latest.checked_at ELSE NULL END AS last_changed_at,
              latest.error AS error
         FROM sources s
         LEFT JOIN source_checks latest
           ON latest.id = (
             SELECT id
               FROM source_checks
              WHERE source_id = s.id
              ORDER BY checked_at DESC
              LIMIT 1
           )
        WHERE s.enabled = 1
        ORDER BY s.priority DESC, s.name ASC`,
    )
    .all<SourceHealthRow>();

  return (result.results ?? []).map((row) => ({
    sourceName: row.source_name,
    sourceUrl: row.source_url || undefined,
    lastCheckedAt: row.last_checked_at || new Date(0).toISOString(),
    ok: row.ok === 1,
    lastChangedAt: row.last_changed_at || undefined,
    error: row.error || undefined,
  }));
}

export async function listManualOverrides(env: WorkerEnv): Promise<ManualOverride[]> {
  const db = requireDb(env);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `SELECT id, enabled, category, value, units, trend, summary, source_name, source_url,
              source_published_at, confidence, severity, expires_at, created_at, updated_at
         FROM manual_overrides
        WHERE enabled = 1
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC`,
    )
    .bind(now)
    .all<ManualOverrideRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    enabled: row.enabled === 1,
    category: row.category,
    value: row.value || undefined,
    units: row.units || undefined,
    trend: row.trend || undefined,
    summary: row.summary,
    sourceName: row.source_name || undefined,
    sourceUrl: row.source_url || undefined,
    sourcePublishedAt: row.source_published_at || undefined,
    confidence: row.confidence,
    severity: row.severity,
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
