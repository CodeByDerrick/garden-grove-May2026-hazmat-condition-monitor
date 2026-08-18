import { extractEventsFromHtmlOrText, stripHtml } from '../parser/extractEvents';
import { listEnabledSources, type RegisteredSource } from '../sources/registry';
import {
  incrementUsageCounter,
  insertEventIfNew,
  insertRawSnapshot,
  recordSourceCheck,
  upsertSource,
  type StoredHazmatEvent,
  type WorkerEnv,
} from '../storage/d1';

const RAW_SNAPSHOT_EXCERPT_LIMIT = 3000;

export type ManualPollOptions = {
  limitSources?: string[];
  dryRun?: boolean;
};

export type FailureClass = 'fetch_error' | 'http_error' | 'parser_error' | 'storage_error' | 'unknown_error';

type PollStage =
  | 'source_upsert'
  | 'fetch'
  | 'http_status'
  | 'read_body'
  | 'parser'
  | 'source_check_write'
  | 'raw_snapshot_write'
  | 'event_insert'
  | 'complete';

export type FailureDiagnostic = {
  failureClass: FailureClass;
  stage: PollStage;
  sourceId: string;
  sourceName: string;
  checkedAt: string;
  statusCode?: number;
  errorMessage: string;
  excerpt?: string;
};

export type ManualPollSourceResult = {
  sourceId: string;
  sourceName: string;
  url: string;
  checkedAt: string;
  ok: boolean;
  dryRun: boolean;
  statusCode?: number;
  eventsExtracted: number;
  eventsInserted: number;
  eventsSkipped: number;
  parserQualityCounts: Record<'high' | 'medium' | 'low', number>;
  snapshotWritten: boolean;
  error?: string;
  failureClass?: FailureClass;
  errorMessage?: string;
  stage?: PollStage;
  excerpt?: string;
  diagnostic?: FailureDiagnostic;
};

export type ManualPollSummary = {
  ok: boolean;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  sourceCount: number;
  successCount: number;
  failureCount: number;
  eventsExtracted: number;
  eventsInserted: number;
  eventsSkipped: number;
  snapshotsWritten: number;
  countersIncremented: Record<string, number>;
  counterErrors: string[];
  results: ManualPollSourceResult[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function safeExcerpt(text: string, limit = 600): string | undefined {
  const cleaned = text.replace(/\s+/g, ' ').trim();

  return cleaned ? cleaned.slice(0, limit) : undefined;
}

function failureClassForStage(stage: PollStage): FailureClass {
  if (stage === 'fetch' || stage === 'read_body') return 'fetch_error';
  if (stage === 'http_status') return 'http_error';
  if (stage === 'parser') return 'parser_error';
  if (stage === 'source_upsert' || stage === 'source_check_write' || stage === 'raw_snapshot_write' || stage === 'event_insert') {
    return 'storage_error';
  }

  return 'unknown_error';
}

function buildDiagnostic(
  source: RegisteredSource,
  checkedAt: string,
  stage: PollStage,
  error: unknown,
  statusCode?: number,
  excerpt?: string,
): FailureDiagnostic {
  return {
    failureClass: failureClassForStage(stage),
    stage,
    sourceId: source.id,
    sourceName: source.name,
    checkedAt,
    statusCode,
    errorMessage: errorMessage(error),
    excerpt,
  };
}

function serializeDiagnostic(diagnostic: FailureDiagnostic): string {
  return JSON.stringify(diagnostic);
}

function digest(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function sourceCheckId(source: RegisteredSource, checkedAt: string): string {
  return digest(`${source.id}|source-check|${checkedAt}`);
}

function snapshotId(source: RegisteredSource, checkedAt: string, contentHash: string): string {
  return digest(`${source.id}|snapshot|${checkedAt}|${contentHash}`);
}

function toStoredEvent(event: StoredHazmatEvent, source: RegisteredSource): StoredHazmatEvent {
  return {
    ...event,
    sourceId: source.id,
  };
}

async function incrementCounter(
  env: WorkerEnv,
  countersIncremented: Record<string, number>,
  counterErrors: string[],
  metric: string,
  amount = 1,
): Promise<void> {
  if (amount <= 0) return;

  try {
    await incrementUsageCounter(env, metric, amount);
    countersIncremented[metric] = (countersIncremented[metric] ?? 0) + amount;
  } catch (error) {
    counterErrors.push(`${metric}: ${errorMessage(error)}`);
  }
}

async function recordFailureCheck(
  env: WorkerEnv,
  source: RegisteredSource,
  diagnostic: FailureDiagnostic,
): Promise<boolean> {
  await recordSourceCheck(env, {
    id: sourceCheckId(source, diagnostic.checkedAt),
    sourceId: source.id,
    checkedAt: diagnostic.checkedAt,
    ok: false,
    statusCode: diagnostic.statusCode,
    error: serializeDiagnostic(diagnostic),
    changed: false,
  });

  return true;
}

export async function runManualPoll(env: WorkerEnv, options: ManualPollOptions = {}): Promise<ManualPollSummary> {
  const startedAt = new Date().toISOString();
  const sources = listEnabledSources(options.limitSources);
  const countersIncremented: Record<string, number> = {};
  const counterErrors: string[] = [];
  const results: ManualPollSourceResult[] = [];
  let successCount = 0;
  let failureCount = 0;
  let totalEventsExtracted = 0;
  let totalEventsInserted = 0;
  let totalEventsSkipped = 0;
  let snapshotsWritten = 0;
  let d1Reads = 0;
  let d1Writes = 0;

  await incrementCounter(env, countersIncremented, counterErrors, 'manual_poll_runs');
  if (options.dryRun) {
    await incrementCounter(env, countersIncremented, counterErrors, 'manual_poll_dry_runs');
  }

  for (const source of sources) {
    const checkedAt = new Date().toISOString();
    let stage: PollStage = 'source_upsert';
    let failureExcerpt: string | undefined;
    const result: ManualPollSourceResult = {
      sourceId: source.id,
      sourceName: source.name,
      url: source.url,
      checkedAt,
      ok: false,
      dryRun: options.dryRun === true,
      eventsExtracted: 0,
      eventsInserted: 0,
      eventsSkipped: 0,
      parserQualityCounts: {
        high: 0,
        medium: 0,
        low: 0,
      },
      snapshotWritten: false,
    };

    try {
      if (!options.dryRun) {
        await upsertSource(env, source);
        d1Writes += 1;
      }

      stage = 'fetch';
      await incrementCounter(env, countersIncremented, counterErrors, 'source_fetches');
      const response = await fetch(source.url, {
        headers: {
          'user-agent': 'GardenGroveHazmatConditionMonitorWorker/0.1 manual-operator-poll',
        },
      });
      result.statusCode = response.status;

      if (!response.ok) {
        stage = 'http_status';
        failureExcerpt = safeExcerpt(await response.text());
        throw new Error(`HTTP ${response.status}`);
      }

      stage = 'read_body';
      const html = await response.text();
      const text = stripHtml(html);
      const contentHash = digest(text.slice(0, 20000));
      stage = 'parser';
      const parsed = extractEventsFromHtmlOrText(source, html, text);
      result.eventsExtracted = parsed.events.length;
      for (const event of parsed.events) {
        result.parserQualityCounts[event.parserQuality] += 1;
      }
      totalEventsExtracted += parsed.events.length;

      await incrementCounter(env, countersIncremented, counterErrors, 'events_extracted', parsed.events.length);

      if (!options.dryRun) {
        stage = 'source_check_write';
        await recordSourceCheck(env, {
          id: sourceCheckId(source, checkedAt),
          sourceId: source.id,
          checkedAt,
          ok: true,
          statusCode: response.status,
          contentHash,
          changed: parsed.events.length > 0,
        });
        d1Writes += 1;

        stage = 'raw_snapshot_write';
        await insertRawSnapshot(env, {
          id: snapshotId(source, checkedAt, contentHash),
          sourceId: source.id,
          checkedAt,
          contentHash,
          textExcerpt: text.slice(0, RAW_SNAPSHOT_EXCERPT_LIMIT),
        });
        d1Writes += 1;
        result.snapshotWritten = true;
        snapshotsWritten += 1;

        for (const event of parsed.events) {
          stage = 'event_insert';
          d1Reads += 1;
          const inserted = await insertEventIfNew(env, toStoredEvent(event, source));

          if (inserted) {
            result.eventsInserted += 1;
            totalEventsInserted += 1;
            d1Writes += 1;
          } else {
            result.eventsSkipped += 1;
            totalEventsSkipped += 1;
          }
        }
      } else {
        result.eventsSkipped = parsed.events.length;
        totalEventsSkipped += parsed.events.length;
      }

      result.ok = true;
      stage = 'complete';
      successCount += 1;
    } catch (error) {
      const diagnostic = buildDiagnostic(source, checkedAt, stage, error, result.statusCode, failureExcerpt);
      result.error = diagnostic.errorMessage;
      result.failureClass = diagnostic.failureClass;
      result.errorMessage = diagnostic.errorMessage;
      result.stage = diagnostic.stage;
      result.excerpt = diagnostic.excerpt;
      result.diagnostic = diagnostic;
      failureCount += 1;
      await incrementCounter(env, countersIncremented, counterErrors, 'source_failures');

      if (!options.dryRun) {
        try {
          await upsertSource(env, source);
          d1Writes += 1;
          await recordFailureCheck(env, source, diagnostic);
          d1Writes += 1;
        } catch (checkError) {
          result.error = `${result.error}; source check write failed: ${errorMessage(checkError)}`;
        }
      }
    }

    results.push(result);
  }

  await incrementCounter(env, countersIncremented, counterErrors, 'events_inserted', totalEventsInserted);
  await incrementCounter(env, countersIncremented, counterErrors, 'raw_snapshots_written', snapshotsWritten);
  await incrementCounter(env, countersIncremented, counterErrors, 'd1_reads', d1Reads);
  await incrementCounter(env, countersIncremented, counterErrors, 'd1_writes', d1Writes);

  const completedAt = new Date().toISOString();

  return {
    ok: failureCount === 0,
    dryRun: options.dryRun === true,
    startedAt,
    completedAt,
    sourceCount: sources.length,
    successCount,
    failureCount,
    eventsExtracted: totalEventsExtracted,
    eventsInserted: totalEventsInserted,
    eventsSkipped: totalEventsSkipped,
    snapshotsWritten,
    countersIncremented,
    counterErrors,
    results,
  };
}
