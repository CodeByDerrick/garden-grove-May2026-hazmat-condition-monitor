# Hazmat Condition Monitor Worker

Cloudflare Worker scaffold for the Garden Grove hazmat condition monitor backend migration.

This slice intentionally serves mock JSON only. It does not configure D1, replace the Apps Script endpoint, or change the existing dashboard data flow.

## Endpoints

- `GET /api/health` returns Worker health metadata.
- `GET /api/status` returns a mock `CurrentStatus`-shaped object.
- `GET /api/events` returns mock `HazmatEvent`-like objects.

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

D1 bindings and live data ingestion should be added in a later migration slice.
