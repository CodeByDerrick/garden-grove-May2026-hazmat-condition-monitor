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

var EVENT_SHEET_NAME = 'Events';
var SOURCE_HEALTH_SHEET_NAME = 'SourceHealth';

var SOURCES = [
  { id: 'garden-grove-emergency', name: 'Garden Grove Emergency Page', url: 'https://ggcity.org/emergency', tier: 'official', enabled: true },
  { id: 'oc-sheriff-disaster', name: 'OC Sheriff Disaster Resources', url: 'https://www.ocsheriff.gov/resources-during-disaster', tier: 'official', enabled: true },
  { id: 'cal-oes-resource', name: 'Cal OES Garden Grove Hazmat Resources', url: 'https://news.caloes.ca.gov/community-resources-for-garden-grove-hazmat-incident/', tier: 'official', enabled: true },
  { id: 'abc7-live', name: 'ABC7 Live Updates', url: 'https://abc7.com/live-updates/garden-grove-chemical-tank-emergency-leaking-toxic-chemicals-orange-county-will-spill-explode-officials-say/19152918/', tier: 'media_live', enabled: true },
  { id: 'nbc4-live', name: 'NBC4 Live Updates', url: 'https://www.nbclosangeles.com/news/local/live-updates-garden-grove-chemical-tank-crisis/3894268/', tier: 'media_live', enabled: true },
  { id: 'ap-summary', name: 'Associated Press Summary', url: 'https://apnews.com/article/c1f922cae0ddb142857d12aee08d2d6b', tier: 'wire', enabled: true }
];

var CONDITION_RULES = [
  { category: 'tank_temperature', severity: 'watch', pattern: new RegExp('\\b(?:temperature|tank|chemical|liquid|it)\\b.{0,120}\\b(\\d{2,3})\\s?(?:°?\\s?F|degrees?)\\b', 'i') },
  { category: 'tank_temperature', severity: 'watch', pattern: new RegExp('\\b(\\d{2,3})\\s?°?\\s?F\\b', 'i') },
  { category: 'temperature_trend', severity: 'watch', pattern: new RegExp('\\btemperature\\b.{0,100}\\b(stabilized|stable|rising|increasing|cooling|dropped|maintained)\\b', 'i') },
  { category: 'temperature_trend', severity: 'watch', pattern: new RegExp('\\b(\\d+)\\s?degree[s]?\\s?per\\s?hour\\b', 'i') },
  { category: 'thermal_runaway', severity: 'critical', pattern: new RegExp('\\bthermal runaway\\b', 'i') },
  { category: 'pressure', severity: 'warning', pattern: new RegExp('\\bpressure\\b', 'i') },
  { category: 'leak', severity: 'warning', pattern: new RegExp('\\bleak(?:ing)?\\b|\\bspill\\b', 'i') },
  { category: 'plume', severity: 'warning', pattern: new RegExp('\\bplume\\b|\\bvapor[s]?\\b|\\boff[- ]?gassing\\b', 'i') },
  { category: 'air_monitoring', severity: 'watch', pattern: new RegExp('\\bair monitoring\\b|\\bair quality\\b|\\bdetected\\b', 'i') },
  { category: 'containment', severity: 'watch', pattern: new RegExp('\\bcontainment\\b|\\bberm\\b|\\bstorm drain\\b|\\brunoff\\b', 'i') },
  { category: 'cooling', severity: 'watch', pattern: new RegExp('\\bcooling\\b|\\bwater\\b|\\bcool(?:ed)?\\b', 'i') },
  { category: 'neutralization', severity: 'watch', pattern: new RegExp('\\bneutraliz(?:e|ing|ation)\\b', 'i') },
  { category: 'evacuation', severity: 'info', pattern: new RegExp('\\bevacuat(?:e|ion|ed)\\b|\\bshelter[- ]?in[- ]?place\\b', 'i') }
];

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet(ss, EVENT_SHEET_NAME, [
    'id', 'observedAt', 'sourcePublishedAt', 'sourceName', 'sourceUrl', 'sourceTier',
    'category', 'value', 'units', 'summary', 'excerpt', 'confidence', 'severity', 'contentHash'
  ]);
  ensureSheet(ss, SOURCE_HEALTH_SHEET_NAME, [
    'sourceName', 'sourceUrl', 'lastCheckedAt', 'ok', 'lastChangedAt', 'error', 'lastHash'
  ]);
}

function ensureSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function pollSources() {
  setupSheets();
  for (var i = 0; i < SOURCES.length; i++) {
    var source = SOURCES[i];
    if (!source.enabled) continue;
    var checkedAt = new Date().toISOString();
    try {
      var response = UrlFetchApp.fetch(source.url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'User-Agent': 'GardenGroveHazmatConditionMonitor/0.1 public-source monitor' }
      });
      var code = response.getResponseCode();
      var html = response.getContentText();
      if (code < 200 || code >= 300) throw new Error('HTTP ' + code);

      var text = stripHtml(html);
      var pageHash = digest(text.slice(0, 20000));
      var events = parseSource(source, text, checkedAt);
      for (var j = 0; j < events.length; j++) appendEventIfNew(events[j]);
      updateSourceHealth(source, checkedAt, true, events.length > 0 ? checkedAt : '', '', pageHash);
    } catch (err) {
      updateSourceHealth(source, checkedAt, false, '', String(err), '');
    }
  }
}

function parseSource(source, text, observedAt) {
  var normalized = String(text).replace(new RegExp('\\s+', 'g'), ' ').trim();
  var events = [];

  for (var i = 0; i < CONDITION_RULES.length; i++) {
    var rule = CONDITION_RULES[i];
    var match = normalized.match(rule.pattern);
    if (!match) continue;
    var excerpt = makeExcerpt(normalized, match.index || 0, 280);
    var value = rule.category === 'tank_temperature' && match[1] ? Number(match[1]) : '';
    var units = rule.category === 'tank_temperature' ? 'F' : '';
    var summary = summarizeMatch(rule.category, match[0], source.name);
    var hash = digest(source.id + '|' + rule.category + '|' + summary + '|' + excerpt);

    events.push({
      id: hash,
      observedAt: observedAt,
      sourcePublishedAt: '',
      sourceName: source.name,
      sourceUrl: source.url,
      sourceTier: source.tier,
      category: rule.category,
      value: value,
      units: units,
      summary: summary,
      excerpt: excerpt,
      confidence: source.tier === 'official' ? 'official' : 'media_reported',
      severity: rule.severity,
      contentHash: hash
    });
  }

  return events;
}

function summarizeMatch(category, matchedText, sourceName) {
  var cleaned = String(matchedText).replace(new RegExp('\\s+', 'g'), ' ').trim();
  if (category === 'tank_temperature') return sourceName + ' includes a tank-temperature-related value: ' + cleaned + '.';
  if (category === 'temperature_trend') return sourceName + ' includes a temperature trend update: ' + cleaned + '.';
  return sourceName + ' includes a ' + category.replace(new RegExp('_', 'g'), ' ') + ' signal: ' + cleaned + '.';
}

function appendEventIfNew(event) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENT_SHEET_NAME);
  var hashes = getExistingHashes(sheet);
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
    event.contentHash
  ]);
}

function getExistingHashes(sheet) {
  var lastRow = sheet.getLastRow();
  var hashes = {};
  if (lastRow < 2) return hashes;
  var values = sheet.getRange(2, 14, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0]) hashes[values[i][0]] = true;
  }
  return hashes;
}

function updateSourceHealth(source, checkedAt, ok, changedAt, error, hash) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SOURCE_HEALTH_SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === source.name) {
      rowIndex = i;
      break;
    }
  }
  var row = [source.name, source.url, checkedAt, ok, changedAt, error, hash];
  if (rowIndex === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
  }
}

function buildCurrentStatus() {
  setupSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var events = rowsToEvents(ss.getSheetByName(EVENT_SHEET_NAME));
  var sourceHealth = rowsToSourceHealth(ss.getSheetByName(SOURCE_HEALTH_SHEET_NAME));
  events.sort(function(a, b) { return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(); });
  var newestEvents = events.slice(0, 50);
  var lastPhysical = firstEventWhereNotCategory(newestEvents, 'evacuation');
  var latestTemperature = firstEventWhereCategory(newestEvents, 'tank_temperature');
  var latestTrend = firstEventWhereCategory(newestEvents, 'temperature_trend');

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
      confidence: latestTemperature.confidence
    } : undefined,
    leakPlumeStatus: latestSummary(newestEvents, ['leak', 'plume']),
    airMonitoringStatus: latestSummary(newestEvents, ['air_monitoring']),
    containmentStatus: latestSummary(newestEvents, ['containment']),
    coolingNeutralizationStatus: latestSummary(newestEvents, ['cooling', 'neutralization']),
    overallStatus: latestOverallStatus(newestEvents),
    confidence: newestEvents[0] ? newestEvents[0].confidence : 'unconfirmed',
    physicalSituationSummary: latestOverallStatus(newestEvents),
    newestEvents: newestEvents,
    sourceHealth: sourceHealth
  };
}

function firstEventWhereCategory(events, category) {
  for (var i = 0; i < events.length; i++) {
    if (events[i].category === category) return events[i];
  }
  return null;
}

function firstEventWhereNotCategory(events, category) {
  for (var i = 0; i < events.length; i++) {
    if (events[i].category !== category) return events[i];
  }
  return null;
}

function rowsToEvents(sheet) {
  var values = sheet.getDataRange().getValues();
  var events = [];
  if (values.length < 2) return events;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue;
    events.push({
      id: row[0], observedAt: row[1], sourcePublishedAt: row[2], sourceName: row[3], sourceUrl: row[4], sourceTier: row[5],
      category: row[6], value: row[7], units: row[8], summary: row[9], excerpt: row[10], confidence: row[11], severity: row[12], contentHash: row[13]
    });
  }
  return events;
}

function rowsToSourceHealth(sheet) {
  var values = sheet.getDataRange().getValues();
  var sources = [];
  if (values.length < 2) return sources;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue;
    sources.push({
      sourceName: row[0], sourceUrl: row[1], lastCheckedAt: row[2], ok: row[3] === true || row[3] === 'TRUE', lastChangedAt: row[4], error: row[5]
    });
  }
  return sources;
}

function latestSummary(events, categories) {
  for (var i = 0; i < events.length; i++) {
    if (categories.indexOf(events[i].category) !== -1) return events[i].summary;
  }
  return 'No current public update captured.';
}

function latestOverallStatus(events) {
  if (!events.length) return 'No public-source events captured yet. Run pollSources or check source access.';
  return events[0].summary;
}

function newestSourceCheck(sourceHealth) {
  if (!sourceHealth.length) return new Date().toISOString();
  var latest = sourceHealth[0].lastCheckedAt;
  for (var i = 1; i < sourceHealth.length; i++) {
    if (String(sourceHealth[i].lastCheckedAt) > String(latest)) latest = sourceHealth[i].lastCheckedAt;
  }
  return latest;
}

function inferTrend(text) {
  var lower = String(text || '').toLowerCase();
  if (lower.indexOf('stable') !== -1 || lower.indexOf('stabilized') !== -1 || lower.indexOf('maintained') !== -1) return 'stable';
  if (lower.indexOf('rising') !== -1 || lower.indexOf('increasing') !== -1) return 'rising';
  if (lower.indexOf('cooling') !== -1 || lower.indexOf('dropped') !== -1) return 'falling';
  return 'unknown';
}

function doGet() {
  var output = ContentService.createTextOutput(JSON.stringify(buildCurrentStatus()));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function stripHtml(html) {
  var text = String(html || '');
  text = text.replace(new RegExp('<script[\\s\\S]*?<\\/script>', 'gi'), ' ');
  text = text.replace(new RegExp('<style[\\s\\S]*?<\\/style>', 'gi'), ' ');
  text = text.replace(new RegExp('<[^>]+>', 'g'), ' ');
  text = text.replace(new RegExp('&nbsp;', 'g'), ' ');
  text = text.replace(new RegExp('&amp;', 'g'), '&');
  text = text.replace(new RegExp('&quot;', 'g'), '"');
  text = text.replace(new RegExp('&#39;', 'g'), "'");
  text = text.replace(new RegExp('\\s+', 'g'), ' ');
  return text.trim();
}

function makeExcerpt(text, index, radius) {
  var start = Math.max(0, index - radius);
  var end = Math.min(text.length, index + radius);
  return text.slice(start, end).trim();
}

function digest(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);
  var parts = [];
  for (var i = 0; i < bytes.length; i++) {
    var byte = bytes[i];
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    parts.push(v.length === 1 ? '0' + v : v);
  }
  return parts.join('');
}
