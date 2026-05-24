export type OpsEnvironment = 'local' | 'preview' | 'production' | 'unknown';

export type OpsRiskLevel = 'normal' | 'watch' | 'warning' | 'critical' | 'unknown';

export type OpsCounterStatus = {
  today?: number;
  limit?: number;
  expectedMax?: number;
  threshold?: number;
  bytes?: number;
  limitBytes?: number;
  riskLevel: OpsRiskLevel;
};

export type OpsStatus = {
  generatedAt: string;
  environment: OpsEnvironment;
  currentRiskLevel: OpsRiskLevel;
  riskReasons: string[];
  counterSource: 'd1' | 'mock';
  counters: {
    workerRequests: OpsCounterStatus & { today: number; limit: number };
    scheduledPollRuns: OpsCounterStatus & { today: number; expectedMax: number };
    sourceFetches: OpsCounterStatus & { today: number; expectedMax: number };
    publicApiRequests: OpsCounterStatus & { today: number; expectedMax: number };
    d1Reads: OpsCounterStatus & { today: number; limit: number };
    d1Writes: OpsCounterStatus & { today: number; limit: number };
    d1StorageEstimate: OpsCounterStatus & { bytes: number; limitBytes: number };
    sourceFailures: OpsCounterStatus & { today: number; threshold: number };
  };
  timestamps: {
    lastPollAt?: string;
    lastSuccessfulPollAt?: string;
    lastSourceFailureAt?: string;
  };
  notes: string[];
  thresholds: Record<string, number>;
  usageCounters: Array<{
    metric: string;
    bucketStart: string;
    count: number;
    updatedAt: string;
  }>;
};
