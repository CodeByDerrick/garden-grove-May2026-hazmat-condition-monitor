# Hazmat Condition Monitor Worker

Cloudflare Worker scaffold for the Garden Grove hazmat condition monitor backend migration.

This slice serves mock JSON and includes the first D1 storage scaffold. It does not poll live sources, replace the Apps Script endpoint, or change the existing dashboard data flow.

## Endpoints

- `GET /api/health` returns Worker health metadata.
- `GET /api/status` returns a mock `CurrentStatus`-shaped object.
- `GET /api/events` reads recent D1 events when the `DB` binding is available and falls back to mock `HazmatEvent`-like objects otherwise.
- `GET /api/events?includeLowQuality=true` returns raw stored events for operator debugging.
- `GET /api/ops/status` returns mock operator status and quota guardrail data.
- `GET /api/db/health` checks that the D1 binding can run a lightweight query.
- `POST /api/ops/smoke-counter` increments a safe D1 usage counter for operator smoke testing.
- `POST /api/parser/smoke` parses caller-provided local text or HTML and returns extracted events without fetching or storing anything.
- `POST /api/poll/manual` runs one operator-initiated source poll. No scheduled polling is configured.
- `GET /api/source-health` returns recent D1 source check status, or an empty array when unavailable.

## Local Development

From the repository root:

```sh
npm run worker:dev
```

Or run Wrangler directly:

```sh
npx wrangler dev --config worker/wrangler.toml
```

Then open:

- `http://localhost:8787/api/health`
- `http://localhost:8787/api/status`
- `http://localhost:8787/api/events`
- `http://localhost:8787/api/db/health`
- `http://localhost:8787/api/ops/status`
- `http://localhost:8787/api/source-health`

## D1 Smoke Test

After local migrations are applied and `npm run worker:dev` is running, verify the D1 binding:

```powershell
Invoke-RestMethod http://localhost:8787/api/db/health
```

Increment the safe smoke-test usage counter:

```powershell
Invoke-RestMethod -Method Post http://localhost:8787/api/ops/smoke-counter
```

Confirm `/api/ops/status` is reading D1-backed counters:

```powershell
Invoke-RestMethod http://localhost:8787/api/ops/status
```

Look for `counterSource` set to `d1` and a `smoke_test_counter` row in `usageCounters`.

Verify the dashboard-compatible D1 status response:

```powershell
$status = Invoke-RestMethod http://localhost:8787/api/status
$status.tankTemperature
$status.sourceFreshness
$status.newestEvents.Count
```

## Manual Poll

Manual polling is operator-triggered only. There is no cron trigger or scheduled handler in this Worker slice.

Run one poll across the enabled source registry:

```powershell
Invoke-RestMethod -Method Post http://localhost:8787/api/poll/manual
```

Dry-run a single source without writing events, raw snapshots, or source checks:

```powershell
$body = @{
  dryRun = $true
  limitSources = @("ap-summary")
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post http://localhost:8787/api/poll/manual -ContentType "application/json" -Body $body
```

Check source health after a non-dry-run poll:

```powershell
Invoke-RestMethod http://localhost:8787/api/source-health
```

Inspect source failures:

```powershell
Invoke-RestMethod http://localhost:8787/api/source-health |
  Select-Object sourceId,sourceName,ok,statusCode,failureClass,stage,errorMessage,excerpt
```

Failed manual poll results and `source_checks.error` include safe diagnostics only: `failureClass`, `stage`, `sourceId`, `sourceName`, `checkedAt`, `statusCode`, `errorMessage`, and a short body/text excerpt when available. Headers, cookies, tokens, request metadata, and full HTML are not stored.

Read ops counters after polling:

```powershell
$ops = Invoke-RestMethod http://localhost:8787/api/ops/status
$ops.counters.manualPollRuns
$ops.counters.sourceFetches
$ops.counters.sourceFailures
$ops.counters.eventsExtracted
$ops.counters.eventsInserted
$ops.counters.rawSnapshotsWritten
```

Manual poll usage counters are approximate operator counters. The poller increments counters for `manual_poll_runs`, `manual_poll_dry_runs`, `source_fetches`, `source_failures`, `events_extracted`, `events_inserted`, `raw_snapshots_written`, `d1_reads`, and `d1_writes`. The `d1_reads` and `d1_writes` values are scoped to the manual poll flow and do not recursively count the usage-counter writes themselves.

TODO before scaling public traffic: add request-wide `public_api_requests` counters and non-poll endpoint `d1_reads` counters. This slice wires the manual poll fetch/read/write path only.

Scheduled polling remains intentionally disabled until source failures, parser quality, and ops counters are reviewed from manual poll runs.

## Event Filtering

`GET /api/events` filters stored D1 rows by default so older low-value media page furniture does not leak into operator or dashboard-facing JSON. The filter prefers official events and keeps media physical-condition events only when their excerpt has strong incident content. Media evacuation events must include operational detail such as an order, zone, shelter, affected area, residents ordered, address checker, or other official instruction.

Use the raw debug view only while inspecting parser quality:

```powershell
Invoke-RestMethod "http://localhost:8787/api/events?includeLowQuality=true"
```

The endpoint remains a plain event array for compatibility. Compare counts locally with:

```powershell
$filtered = Invoke-RestMethod http://localhost:8787/api/events
$raw = Invoke-RestMethod "http://localhost:8787/api/events?includeLowQuality=true"
$filtered.Count
$raw.Count
```

## Parser Smoke Test

The parser smoke endpoint is local/operator testing only. It does not fetch external URLs and does not write parser output to D1.

From PowerShell, post the AP-style fixture:

```powershell
$text = Get-Content worker/fixtures/ap-incident-snippet.txt -Raw | Out-String
$body = @{
  source = @{
    id = "test-source"
    name = "Test Source"
    url = "https://example.com"
    tier = "wire"
    priority = 4
  }
  html = $text
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post http://localhost:8787/api/parser/smoke -ContentType "application/json" -Body $body
```

To verify noise rejection:

```powershell
$text = Get-Content worker/fixtures/noise-snippet.txt -Raw | Out-String
$body = @{
  source = @{
    id = "noise-source"
    name = "Noise Source"
    url = "https://example.com/noise"
    tier = "wire"
    priority = 4
  }
  text = $text
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post http://localhost:8787/api/parser/smoke -ContentType "application/json" -Body $body
```

## Deploy

```sh
npm run worker:deploy
```

## D1 Setup

Create the database:

```sh
npx wrangler d1 create hazmat-condition-monitor
```

Copy the returned `database_name` and `database_id` into `worker/wrangler.toml`, replacing the placeholder values under `[[d1_databases]]`. The placeholder `database_id` is the all-zero UUID.

Apply migrations locally:

```sh
npx wrangler d1 migrations apply hazmat-condition-monitor --local --config worker/wrangler.toml
```

Apply migrations remotely:

```sh
npx wrangler d1 migrations apply hazmat-condition-monitor --remote --config worker/wrangler.toml
```

The initial schema lives in `worker/migrations/0001_initial_schema.sql` and creates:

- `sources`
- `source_checks`
- `events`
- `manual_overrides`
- `raw_snapshots`

Live source polling, parser logic, and D1-backed status aggregation should be added in later migration slices.
