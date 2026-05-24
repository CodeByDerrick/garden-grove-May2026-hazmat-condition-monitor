import { OPS_THRESHOLDS } from './thresholds';
import type { OpsCounterStatus, OpsEnvironment, OpsRiskLevel, OpsStatus } from './types';

export type OpsEnv = {
  ENVIRONMENT?: OpsEnvironment;
};

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

export function buildOpsStatus(env: OpsEnv, request: Request): OpsStatus {
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    environment: detectEnvironment(env, request),
    currentRiskLevel: 'unknown',
    riskReasons: [
      'Mock ops data only: real Worker, D1, scheduled poll, and source fetch counters are not wired yet.',
      'No Cloudflare billing, quota, or account API integration is present in this scaffold.',
    ],
    counters: {
      workerRequests: usageCounter(0, OPS_THRESHOLDS.workerRequestsDailyLimit),
      scheduledPollRuns: expectedCounter(0, OPS_THRESHOLDS.scheduledPollRunsExpectedMax),
      sourceFetches: expectedCounter(0, OPS_THRESHOLDS.sourceFetchesExpectedMax),
      publicApiRequests: expectedCounter(0, OPS_THRESHOLDS.publicApiRequestsExpectedMax),
      d1Reads: usageCounter(0, OPS_THRESHOLDS.d1ReadsDailyLimit),
      d1Writes: usageCounter(0, OPS_THRESHOLDS.d1WritesDailyLimit),
      d1StorageEstimate: storageCounter(0, OPS_THRESHOLDS.d1StorageLimitBytes),
      sourceFailures: thresholdCounter(0, OPS_THRESHOLDS.sourceFailuresDailyThreshold),
    },
    timestamps: {
      lastPollAt: undefined,
      lastSuccessfulPollAt: undefined,
      lastSourceFailureAt: undefined,
    },
    notes: [
      'This endpoint is an operator-facing scaffold, not a billing source of truth.',
      'Values are intentionally zeroed until usage counters are persisted by Worker code.',
      'Do not expose secrets, account identifiers, billing tokens, or raw provider API payloads through this endpoint.',
      'No polling scale-up should happen until these counters are backed by durable data.',
    ],
    thresholds: { ...OPS_THRESHOLDS },
  };
}
