# Garden Grove May 2026 Hazmat Condition Monitor

Mobile-first public-source monitor for the Garden Grove May 2026 hazmat incident.

This project is an emergency MVP designed to run from browser/mobile-accessible tools:

- **Dashboard:** Vite + React + TypeScript static site hosted by GitHub Pages.
- **Poller:** Google Apps Script fetches public sources, writes deduplicated events to Google Sheets, and exposes JSON through a web app endpoint.
- **Data contract:** `CurrentStatus`, `HazmatEvent`, `SourceHealth`, and `SourceConfig` models shared by the dashboard and poller documentation.

> This monitor tracks public-source updates. It is not direct tank telemetry and does not replace official emergency instructions.

## MVP workflow

1. Deploy the dashboard through GitHub Pages.
2. Create a Google Sheet for the incident event log.
3. Paste `apps-script/Code.gs` into Apps Script bound to that sheet or standalone.
4. Deploy the Apps Script as a web app.
5. Put the deployed Apps Script URL into the dashboard environment as `VITE_STATUS_ENDPOINT`.
6. Create a time-driven Apps Script trigger for `pollSources`.
7. Open the GitHub Pages dashboard from mobile.

## Dashboard features

- Current conditions panel.
- Newest-first timestamped update list.
- Source links on every update.
- Source health panel.
- Manual refresh button.
- Auto-refresh every 15 seconds.
- Confidence labels: official, attributed to official, media reported, unconfirmed.

## Important limitations

- This does **not** access live tank telemetry.
- Public reporting may lag actual physical conditions.
- Source pages may change HTML structure and require parser updates.
- Mobile browsers may throttle background tabs; the poller should run in Apps Script, not the phone browser.

## Local development

```bash
npm install
npm run dev
```

### Local Worker dashboard test

The production dashboard still uses the Apps Script endpoint. To test the Vite dashboard against the local Cloudflare Worker without changing production behavior, create a local-only file:

```text
VITE_STATUS_ENDPOINT=http://localhost:8787/api/status
```

Save it as `.env.local`. This file is ignored by git.

Then run two terminals:

```bash
npm run worker:dev
```

```bash
npm run dev
```

Open the Vite localhost URL and check the browser console for the `[dashboard] status endpoint:` line. It should show `http://localhost:8787/api/status` when `.env.local` is present. Remove `.env.local` to return local development to the default Apps Script endpoint.

## Build

```bash
npm run build
```

## GitHub Pages

The included workflow builds the static dashboard and publishes `dist/` to GitHub Pages.

In GitHub repo settings, set Pages source to **GitHub Actions**.

## Environment variable

The dashboard reads from:

```text
VITE_STATUS_ENDPOINT=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

If `VITE_STATUS_ENDPOINT` is not set, the dashboard uses the current Apps Script endpoint by default. `.env.example` shows the Worker endpoint shape for future deployment configuration.
