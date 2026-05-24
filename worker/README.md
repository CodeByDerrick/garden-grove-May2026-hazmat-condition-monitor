# Hazmat Condition Monitor Worker

Cloudflare Worker scaffold for the Garden Grove hazmat condition monitor backend migration.

This slice serves mock JSON and includes the first D1 storage scaffold. It does not poll live sources, replace the Apps Script endpoint, or change the existing dashboard data flow.

## Endpoints

- `GET /api/health` returns Worker health metadata.
- `GET /api/status` returns a mock `CurrentStatus`-shaped object.
- `GET /api/events` reads recent D1 events when the `DB` binding is available and falls back to mock `HazmatEvent`-like objects otherwise.
- `GET /api/ops/status` returns mock operator status and quota guardrail data.
- `GET /api/db/health` checks that the D1 binding can run a lightweight query.
- `POST /api/ops/smoke-counter` increments a safe D1 usage counter for operator smoke testing.
- `POST /api/parser/smoke` parses caller-provided local text or HTML and returns extracted events without fetching or storing anything.

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
