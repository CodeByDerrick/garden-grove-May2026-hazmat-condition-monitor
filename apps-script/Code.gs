/**
 * Garden Grove Hazmat Condition Monitor - Google Apps Script MVP
 *
 * Setup:
 * 1. Create a Google Sheet.
 * 2. Open Extensions > Apps Script.
 * 3. Paste this file into Code.gs.
 * 4. Run setupSheets once.
 * 5. Deploy as Web App: Execute as Me, access Anyone with link.
 * 6. Create a time-driven trigger for pollSources every 1 or 5 minutes.
 */

const EVENT_SHEET_NAME = 'Events';
const SOURCE_HEALTH_SHEET_NAME = 'SourceHealth';

const SOURCES = [
  {
    id: 'garden-grove-emergency',
    name: 'Garden Grove Emergency Page',
    url: 'https://ggcity.org/emergency',
    tier: 'official',
    enabled: true,
  },
  {
    id: 'oc-sheriff-disaster',
    name: 'OC Sheriff Disaster Resources',
    url: 'https://www.ocsheriff.gov/resources-during-disaster',
    tier: 'official',
    enabled: true,
  },
  {
    id: 'cal-oes-resource',
    name: 'Cal OES Garden Grove Hazmat Resources',
    url: 'https://news.caloes.ca.gov/community-resources-for-garden-grove-hazmat-incident/',
    tier: 'official',
    enabled: true,
  },
  {
    id: 'abc7-live',
    name: 'ABC7 Live Updates',
    url: 'https://abc7.com/live-updates/garden-grove-chemical-tank-emergency-leaking-toxic-chemicals-orange-county-will-spill-explode-officials-say/19152918/',
    tier: 'media_live',
    enabled: true,
  },
  {
    id: 'nbc4-live',
    name: 'NBC4 Live Updates',
    url: 'https://www.nbclosangeles.com/news/local/live-updates-garden-grove-chemical-tank-crisis/3894268/',
    tier: 'media_live',
    enabled: true,
  },
  {
    id: 'ap-summary',
    name: 'Associated Press Summary',
    url: 'https://apnews.com/article/c1f922cae0ddb142857d12aee08d2d6b',
    tier: 'wire',
    enabled: true,
  },
];

const CONDITION_RULES = [
  { category: 'tank_temperature', severity: 'watch', pattern: /\b(\d{2,3})\s?°?\s?F\b/i },
  { category: 'temperature_trend', severity: 'watch', pattern: /\btemperature\b.{0,100}\b(stabilized|stable|rising|increasing|cooling|dropped|maintained)\b/i },
  { category: 'temperature_trend', severity: 'watch', pattern: /\b(\d+)\s?degree[s]?\s?per\s?hour\b/i },
  { category: 'thermal_runaway', severity: 'critical', pattern: /\bthermal runaway\b/i },
  { category: 'pressure', severity: 'warning', pattern: /\bpressure\b/i },
  { category: 'leak', severity: 'warning', pattern: /\bleak(?:ing)?\b|\bspill\b/i },
  { category: 'plume', severity: 'warning', pattern: /\bplume\b|\bvapor[s]?\b|\boff[- ]?gassing\b/i },
  { category: 'air_monitoring', severity: 'watch', pattern: /\bair monitoring\b|\bair quality\b|\bdetected\b/i },
  { category: 'containment', severity: 'watch', pattern: /\bcontainment\b|\bberm\b|\bstorm drain\b|\brunoff\b/i },
  { category: 'cooling', severity: 'watch', pattern: /\bcooling\b|\bwater\b|\bcool(?:ed)?\b/i },
  { category: 'neutralization', severity: 'watch', pattern: /\bneutraliz(?:e|ing|ation)\b/i },
  { category: 'evacuation', severity: 'info', pattern: /\bevacuat(?:e|ion|ed)\b|\bshelter[- ]?in[- ]?place\b/i },
];

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet(ss, EVENT_SHEET_NAME, [
    'id', 'observedAt', 'sourcePublishedAt', 'sourceName', 'sourceUrl', 'sourceTier',
    'category', 'value', 'units', 'summary', 'excerpt', 'confidence', 'severity', 'contentHash'
  ]);
  ensureSheet(ss, SOURCE_HEALTH_SHEET_NAME, [
    'sourceName', 'sourceUrl', 'lastCheckedAt', 'ok', 'lastChangedAt', 'error', 'lastHash'
  ]);
}

function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function pollSources() {
  setupSheets();
  SOURCES.filter(source => source.enabled).forEach(source => {
    const checkedAt = new Date().toISOString();
    try {
      const response = UrlFetchApp.fetch(source.url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'User-Agent': 'GardenGroveHazmatConditionMonitor/0.1 public-source monitor' },
      });
      const code = response.getResponseCode();
      const html = response.getContentText();
      if (code < 200 || code >= 300) throw new Error(`HTTP ${code}`);

      const text = stripHtml(html);
      const pageHash = digest(text.slice(0, 20000));
      const events = parseSource(source, text, checkedAt);
      events.forEach(appendEventIfNew);
      updateSourceHealth(source, checkedAt, true, events.length > 0 ? checkedAt : '', '', pageHash);
    } catch (err) {
      updateSourceHealth(source, checkedAt, false, '', String(err), '');
    }
  });
}

function parseSource(source, text, observedAt) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const events = [];

  CONDITION_RULES.forEach(rule => {
    const match = normalized.match(rule.pattern);
    if (!match) return;
    const excerpt = makeExcerpt(normalized, match.index || 0, 280);
    const value = rule.category === 'tank_temperature' && match[1] ? Number(match[1]) : undefined;
    const units = rule.category === 'tank_temperature' ? 'F' : undefined;
    const summary = summarizeMatch(rule.category, match[0], source.name);
    const hash = digest(`${source.id}|${rule.category}|${summary}|${excerpt}`);

    events.push({
      id: hash,
      observedAt,
      sourcePublishedAt: '',
      sourceName: source.name,
      sourceUrl: source.url,
      sourceTier: source.tier,
      category: rule.category,
      value: value || '',
      units: units || '',
      summary,
      excerpt,
      confidence: source.tier === 'official' ? 'official' : 'media_reported',
      severity: rule.severity,
      contentHash: hash,
    });
  });

  return events;
}

function summarizeMatch(category, matchedText, sourceName) {
  const cleaned = String(matchedText).replace(/\s+/g, ' ').trim();
  if (category === 'tank_temperature') return `${sourceName} includes a tank-temperature-related value: ${cleaned}.`;
  if (category === 'temperature_trend') return `${sourceName} includes a temperature trend update: ${cleaned}.`;
  return `${sourceName} includes a ${category.replace(/_/g, ' ')} signal: ${cleaned}.`;
}

function appendEventIfNew(event) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENT_SHEET_NAME);
  const hashes = getExistingHashes(sheet);
  if (hashes[event.contentHash]) return;
  sheet.appendRow([
    event.id,
    event.observedAt,
    event.sourcePublishedAt,
    event.sourceName,
    event.sourceUrl,
    event.sourceTier,
    event.category,
    event.value,
    event.units,
    event.summary,
    event.excerpt,
    event.confidence,
    event.severity,
    event.contentHash,
  ]);
}

function getExistingHashes(sheet) {
  const lastRow = sheet.getLastRow();
  const hashes = {};
  if (lastRow < 2) return hashes;
  const values = sheet.getRange(2, 14, lastRow - 1, 1).getValues();
  values.forEach(row => { if (row[0]) hashes[row[0]] = true; });
  return hashes;
}

function updateSourceHealth(source, checkedAt, ok, changedAt, error, hash) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SOURCE_HEALTH_SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const rowIndex = values.findIndex((row, index) => index > 0 && row[0] === source.name);
  const row = [source.name, source.url, checkedAt, ok, changedAt, error, hash];
  if (rowIndex === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
  }
}

function buildCurrentStatus() {
  setupSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const events = rowsToEvents(ss.getSheetByName(EVENT_SHEET_NAME));
  const sourceHealth = rowsToSourceHealth(ss.getSheetByName(SOURCE_HEALTH_SHEET_NAME));
  const newestEvents = events.sort((a, b) => new Date(b.observedAt) - new Date(a.observedAt)).slice(0, 50);
  const lastPhysical = newestEvents.find(event => event.category !== 'evacuation');
  const latestTemperature = newestEvents.find(event => event.category === 'tank_temperature');
  const latestTrend = newestEvents.find(event => event.category === 'temperature_trend');

  return {
    generatedAt: new Date().toISOString(),
    lastSuccessfulPollAt: newestSourceCheck(sourceHealth),
    lastPhysicalUpdateAt: lastPhysical ? lastPhysical.observedAt : '',
    tankTemperature: latestTemperature ? {
      value: Number(latestTemperature.value) || undefined,
      units: latestTemperature.units || 'F',
      trend: inferTrend(latestTrend ? latestTrend.summary + ' ' + latestTrend.excerpt : ''),
      sourceName: latestTemperature.sourceName,
      sourcePublishedAt: latestTemperature.sourcePublishedAt,
      confidence: latestTemperature.confidence,
    } : undefined,
    leakPlumeStatus: latestSummary(newestEvents, ['leak', 'plume']),
    airMonitoringStatus: latestSummary(newestEvents, ['air_monitoring']),
    containmentStatus: latestSummary(newestEvents, ['containment']),
    coolingNeutralizationStatus: latestSummary(newestEvents, ['cooling', 'neutralization']),
    overallStatus: latestOverallStatus(newestEvents),
    confidence: newestEvents[0] ? newestEvents[0].confidence : 'unconfirmed',
    physicalSituationSummary: latestOverallStatus(newestEvents),
    newestEvents,
    sourceHealth,
  };
}

function rowsToEvents(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).filter(row => row[0]).map(row => ({
    id: row[0], observedAt: row[1], sourcePublishedAt: row[2], sourceName: row[3], sourceUrl: row[4], sourceTier: row[5],
    category: row[6], value: row[7], units: row[8], summary: row[9], excerpt: row[10], confidence: row[11], severity: row[12], contentHash: row[13],
  }));
}

function rowsToSourceHealth(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).filter(row => row[0]).map(row => ({
    sourceName: row[0], sourceUrl: row[1], lastCheckedAt: row[2], ok: row[3] === true || row[3] === 'TRUE', lastChangedAt: row[4], error: row[5],
  }));
}

function latestSummary(events, categories) {
  const event = events.find(item => categories.indexOf(item.category) !== -1);
  return event ? event.summary : 'No current public update captured.';
}

function latestOverallStatus(events) {
  if (!events.length) return 'No public-source events captured yet. Run pollSources or check source access.';
  return events[0].summary;
}

function newestSourceCheck(sourceHealth) {
  if (!sourceHealth.length) return new Date().toISOString();
  return sourceHealth.map(source => source.lastCheckedAt).sort().reverse()[0];
}

function inferTrend(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.indexOf('stable') !== -1 || lower.indexOf('stabilized') !== -1 || lower.indexOf('maintained') !== -1) return 'stable';
  if (lower.indexOf('rising') !== -1 || lower.indexOf('increasing') !== -1) return 'rising';
  if (lower.indexOf('cooling') !== -1 || lower.indexOf('dropped') !== -1) return 'falling';
  return 'unknown';
}

function doGet() {
  const output = ContentService.createTextOutput(JSON.stringify(buildCurrentStatus()));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function makeExcerpt(text, index, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).trim();
}

function digest(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);
  return bytes.map(byte => {
    const v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}
