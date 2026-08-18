# Ops Cost Guardrails

No public crisis monitor should run blind. Before this Worker scales beyond mock endpoints, operators need a visible place to check request volume, polling activity, storage use, source failures, and risk levels.

## Why This Monitor Exists

The Worker will eventually fetch public sources on a schedule, write events and snapshots to D1, and serve public API responses. Each of those actions can consume quota or create cost risk. The `/api/ops/status` endpoint is the foundation for a small operator-facing dashboard that makes those risks visible before polling is enabled.

Current rule: no polling scale-up without visible ops status backed by durable counters.

## Services With Cost Or Quota Risk

- Worker requests from public API traffic.
- Scheduled Worker runs for source polling.
- Outbound source fetches.
- D1 reads for public API responses and operator views.
- D1 writes for source checks, events, snapshots, overrides, and usage counters.
- D1 storage from retained events, raw snapshots, and counter history.

## Mock Field Meanings

- `workerRequests`: public and internal Worker invocations counted for the current day.
- `scheduledPollRuns`: scheduled polling runs counted for the current day.
- `sourceFetches`: outbound source fetch attempts counted for the current day.
- `d1Reads`: D1 read operations counted for the current day.
- `d1Writes`: D1 write operations counted for the current day.
- `d1StorageEstimate`: estimated D1 storage used by this backend.
- `sourceFailures`: source fetch, parsing, or validation failures counted for the current day.
- `publicApiRequests`: requests to public API paths such as `/api/health`, `/api/status`, `/api/events`, and `/api/ops/status`.
- `lastPollAt`: most recent scheduled poll attempt.
- `lastSuccessfulPollAt`: most recent successful scheduled poll.
- `currentRiskLevel`: rolled-up risk level using `normal`, `watch`, `warning`, `critical`, or `unknown`.
- `riskReasons`: operator-readable reasons for the current risk level.
- `thresholds`: static scaffold thresholds used to classify risk.

All current values are mock/scaffold data. They are not billing data and are not Cloudflare quota data.

## What Becomes Real Later

Later slices should persist usage counters in D1, increment counters at each fetch/write/API path, estimate storage from retained rows, and expose real timestamps for poll activity and source failures. Cloudflare billing or account quota APIs are intentionally out of scope for this slice.

## Safety Rules

- Do not expose secrets through `/api/ops/status`.
- Do not expose billing tokens through `/api/ops/status`.
- Do not expose raw Cloudflare billing or account API payloads through `/api/ops/status`.
- Do not enable or scale recurring polling until the ops status endpoint is visible and backed by durable usage counters.
