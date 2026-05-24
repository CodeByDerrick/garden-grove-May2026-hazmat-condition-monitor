export const OPS_THRESHOLDS = {
  workerRequestsDailyLimit: 100_000,
  scheduledPollRunsExpectedMax: 288,
  sourceFetchesExpectedMax: 2_000,
  publicApiRequestsExpectedMax: 50_000,
  d1ReadsDailyLimit: 5_000_000,
  d1WritesDailyLimit: 100_000,
  d1StorageLimitBytes: 5_000_000_000,
  sourceFailuresDailyThreshold: 25,
  watchPercent: 0.5,
  warningPercent: 0.8,
  criticalPercent: 0.95,
} as const;

export type OpsThresholdKey = keyof typeof OPS_THRESHOLDS;
