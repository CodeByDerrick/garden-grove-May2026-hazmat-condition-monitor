# Apps Script Poller Setup

This folder contains the Google Apps Script MVP poller.

## Mobile/browser setup

1. Create a new Google Sheet.
2. Open **Extensions > Apps Script**.
3. Paste `Code.gs` into the Apps Script editor.
4. Save.
5. Run `setupSheets` once and approve permissions.
6. Run `pollSources` once to verify data appears in the sheet.
7. Deploy as a web app:
   - Execute as: **Me**
   - Who has access: **Anyone with the link**
8. Copy the web app URL.
9. Add it to the dashboard as `VITE_STATUS_ENDPOINT`.
10. Create a time-driven trigger:
   - Function: `pollSources`
   - Event source: Time-driven
   - Frequency: every 1 minute or every 5 minutes, depending on available quota and urgency.

## Sheet tabs

The script creates:

- `Events`: append-only condition events.
- `SourceHealth`: latest source check status.

## Notes

- This is public-source monitoring, not direct tank telemetry.
- HTML parsing is intentionally simple for emergency MVP speed.
- If a source changes layout, parser rules may need adjustment.
- If a source blocks `UrlFetchApp`, source health will show an error.
