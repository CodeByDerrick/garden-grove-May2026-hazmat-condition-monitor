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

export type ManualPollSourceResult = {
  sourceId: string;
  sourceName: string;
  url: string;
  ok: boolean;
  dryRun: boolean;
  statusCode?: number;
  eventsExtracted: number;
  eventsInserted: number;
  eventsSkipped: number;
  snapshotWritten: boolean;
  error?: string;
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
  checkedAt: string,
  statusCode: number | undefined,
  error: string,
): Promise<boolean> {
  await recordSourceCheck(env, {
    id: sourceCheckId(source, checkedAt),
    sourceId: source.id,
    checkedAt,
    ok: false,
    statusCode,
    error,
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

  for (const source of sources) {
    const checkedAt = new Date().toISOString();
    const result: ManualPollSourceResult = {
      sourceId: source.id,
      sourceName: source.name,
      url: source.url,
      ok: false,
      dryRun: options.dryRun === true,
      eventsExtracted: 0,
      eventsInserted: 0,
      eventsSkipped: 0,
      snapshotWritten: false,
    };

    try {
      if (!options.dryRun) {
        await upsertSource(env, source);
        d1Writes += 1;
      }

      await incrementCounter(env, countersIncremented, counterErrors, 'source_fetches');
      const response = await fetch(source.url, {
        headers: {
          'user-agent': 'GardenGroveHazmatConditionMonitorWorker/0.1 manual-operator-poll',
        },
      });
      result.statusCode = response.status;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const text = stripHtml(html);
      const contentHash = digest(text.slice(0, 20000));
      const parsed = extractEventsFromHtmlOrText(source, html, text);
      result.eventsExtracted = parsed.events.length;
      totalEventsExtracted += parsed.events.length;

      await incrementCounter(env, countersIncremented, counterErrors, 'events_extracted', parsed.events.length);

      if (!options.dryRun) {
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
      successCount += 1;
    } catch (error) {
      result.error = errorMessage(error);
      failureCount += 1;
      await incrementCounter(env, countersIncremented, counterErrors, 'source_failures');

      if (!options.dryRun) {
        try {
          await upsertSource(env, source);
          d1Writes += 1;
          await recordFailureCheck(env, source, checkedAt, result.statusCode, result.error);
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
