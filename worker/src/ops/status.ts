import { OPS_THRESHOLDS } from './thresholds';
import type { OpsCounterStatus, OpsEnvironment, OpsRiskLevel, OpsStatus } from './types';
import { listUsageCounters, type UsageCounter, type WorkerEnv } from '../storage/d1';

export type OpsEnv = {
  ENVIRONMENT?: OpsEnvironment;
};

const METRICS = {
  workerRequests: 'worker_requests',
  scheduledPollRuns: 'scheduled_poll_runs',
  sourceFetches: 'source_fetches',
  publicApiRequests: 'public_api_requests',
  d1Reads: 'd1_reads',
  d1Writes: 'd1_writes',
  d1StorageEstimate: 'd1_storage_bytes',
  sourceFailures: 'source_failures',
} as const;

function detectEnvironment(env: OpsEnv, request: Request): OpsEnvironment {
  if (env.ENVIRONMENT) {
    return env.ENVIRONMENT;
  }

  const hostname = new URL(request.url).hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'local';
  }

  if (hostname.endsWith('.workers.dev')) {
    return 'preview';
  }

  return 'unknown';
}

function riskForUsage(used: number, limit: number): OpsRiskLevel {
  if (limit <= 0) {
    return 'unknown';
  }

  const ratio = used / limit;

  if (ratio >= OPS_THRESHOLDS.criticalPercent) {
    return 'critical';
  }

  if (ratio >= OPS_THRESHOLDS.warningPercent) {
    return 'warning';
  }

  if (ratio >= OPS_THRESHOLDS.watchPercent) {
    return 'watch';
  }

  return 'normal';
}

function usageCounter(today: number, limit: number): OpsCounterStatus & { today: number; limit: number } {
  return {
    today,
    limit,
    riskLevel: riskForUsage(today, limit),
  };
}

function expectedCounter(today: number, expectedMax: number): OpsCounterStatus & { today: number; expectedMax: number } {
  return {
    today,
    expectedMax,
    riskLevel: riskForUsage(today, expectedMax),
  };
}

function storageCounter(bytes: number, limitBytes: number): OpsCounterStatus & { bytes: number; limitBytes: number } {
  return {
    bytes,
    limitBytes,
    riskLevel: riskForUsage(bytes, limitBytes),
  };
}

function thresholdCounter(today: number, threshold: number): OpsCounterStatus & { today: number; threshold: number } {
  return {
    today,
    threshold,
    riskLevel: riskForUsage(today, threshold),
  };
}

function countFor(counters: UsageCounter[], metric: string): number {
  return counters.find((counter) => counter.metric === metric)?.count ?? 0;
}

export async function buildOpsStatus(env: OpsEnv & WorkerEnv, request: Request): Promise<OpsStatus> {
  const generatedAt = new Date().toISOString();
  let usageCounters: UsageCounter[] = [];
  let counterSource: OpsStatus['counterSource'] = 'mock';
  const notes = [
    'This endpoint is an operator-facing scaffold, not a billing source of truth.',
    'Do not expose secrets, account identifiers, billing tokens, or raw provider API payloads through this endpoint.',
    'No polling scale-up should happen until these counters are backed by durable data.',
  ];
  const riskReasons = ['No Cloudflare billing, quota, or account API integration is present in this scaffold.'];

  try {
    usageCounters = await listUsageCounters(env);
    counterSource = 'd1';
    notes.unshift('Usage counters are read from D1 for the current UTC day.');
  } catch {
    notes.unshift('Usage counters are mock/scaffold values because D1 counters are unavailable.');
    riskReasons.unshift('Mock ops data: real usage counters are not available from D1 for this response.');
  }

  return {
    generatedAt,
    environment: detectEnvironment(env, request),
    currentRiskLevel: 'unknown',
    riskReasons,
    counterSource,
    counters: {
      workerRequests: usageCounter(
        countFor(usageCounters, METRICS.workerRequests),
        OPS_THRESHOLDS.workerRequestsDailyLimit,
      ),
      scheduledPollRuns: expectedCounter(
        countFor(usageCounters, METRICS.scheduledPollRuns),
        OPS_THRESHOLDS.scheduledPollRunsExpectedMax,
      ),
      sourceFetches: expectedCounter(
        countFor(usageCounters, METRICS.sourceFetches),
        OPS_THRESHOLDS.sourceFetchesExpectedMax,
      ),
      publicApiRequests: expectedCounter(
        countFor(usageCounters, METRICS.publicApiRequests),
        OPS_THRESHOLDS.publicApiRequestsExpectedMax,
      ),
      d1Reads: usageCounter(countFor(usageCounters, METRICS.d1Reads), OPS_THRESHOLDS.d1ReadsDailyLimit),
      d1Writes: usageCounter(countFor(usageCounters, METRICS.d1Writes), OPS_THRESHOLDS.d1WritesDailyLimit),
      d1StorageEstimate: storageCounter(
        countFor(usageCounters, METRICS.d1StorageEstimate),
        OPS_THRESHOLDS.d1StorageLimitBytes,
      ),
      sourceFailures: thresholdCounter(
        countFor(usageCounters, METRICS.sourceFailures),
        OPS_THRESHOLDS.sourceFailuresDailyThreshold,
      ),
    },
    timestamps: {
      lastPollAt: undefined,
      lastSuccessfulPollAt: undefined,
      lastSourceFailureAt: undefined,
    },
    notes,
    thresholds: { ...OPS_THRESHOLDS },
    usageCounters,
  };
}
