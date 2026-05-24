# Hazmat Condition Monitor Worker

Cloudflare Worker scaffold for the Garden Grove hazmat condition monitor backend migration.

This slice serves mock JSON and includes the first D1 storage scaffold. It does not poll live sources, replace the Apps Script endpoint, or change the existing dashboard data flow.

## Endpoints

- `GET /api/health` returns Worker health metadata.
- `GET /api/status` returns a mock `CurrentStatus`-shaped object.
- `GET /api/events` reads recent D1 events when the `DB` binding is available and falls back to mock `HazmatEvent`-like objects otherwise.
- `GET /api/ops/status` returns mock operator status and quota guardrail data.

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
