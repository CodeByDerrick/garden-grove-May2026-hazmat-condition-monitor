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
var MANUAL_OVERRIDE_SHEET_NAME = 'ManualOverrides';

var SOURCES = [
  { id: 'garden-grove-emergency', name: 'Garden Grove Emergency Page', url: 'https://ggcity.org/emergency', tier: 'official', enabled: true, priority: 10 },
  { id: 'oc-sheriff-disaster', name: 'OC Sheriff Disaster Resources', url: 'https://www.ocsheriff.gov/resources-during-disaster', tier: 'official', enabled: true, priority: 10 },
  { id: 'cal-oes-resource', name: 'Cal OES Garden Grove Hazmat Resources', url: 'https://news.caloes.ca.gov/community-resources-for-garden-grove-hazmat-incident/', tier: 'official', enabled: true, priority: 10 },
  { id: 'abc7-live', name: 'ABC7 Live Updates', url: 'https://abc7.com/live-updates/garden-grove-chemical-tank-emergency-leaking-toxic-chemicals-orange-county-will-spill-explode-officials-say/19152918/', tier: 'media_live', enabled: true, priority: 7 },
  { id: 'nbc4-live', name: 'NBC4 Live Updates', url: 'https://www.nbclosangeles.com/news/local/live-updates-garden-grove-chemical-tank-crisis/3894268/', tier: 'media_live', enabled: true, priority: 7 },
  { id: 'ap-summary', name: 'Associated Press Summary', url: 'https://apnews.com/article/c1f922cae0ddb142857d12aee08d2d6b', tier: 'wire', enabled: true, priority: 4 }
];

var CONDITION_RULES = [
  {
    category: 'tank_temperature', severity: 'watch', priority: 10,
    pattern: new RegExp('\\b(?:tank|chemical|liquid|methyl methacrylate|mma|temperature)\\b.{0,160}\\b(\\d{1,3})\\s?(?:°?\\s?(F|C)|degrees?(?:\\s+(Fahrenheit|Celsius))?)\\b', 'i'),
    summary: 'Captured tank-temperature-related value from nearby tank/chemical context.'
  },
  {
    category: 'temperature_trend', severity: 'watch', priority: 9,
    pattern: new RegExp('\\b(?:temperature|tank|chemical|liquid)\\b.{0,140}\\b(stabilized|stable|rising|increasing|cooling|cool(?:ed)?|dropped|maintained)\\b', 'i'),
    summary: 'Captured temperature-trend language from nearby tank/chemical context.'
  },
  {
    category: 'temperature_trend', severity: 'watch', priority: 9,
    pattern: new RegExp('\\b(\\d+)\\s?degree[s]?\\s?per\\s?hour\\b', 'i'),
    summary: 'Captured reported temperature-change rate.'
  },
  {
    category: 'thermal_runaway', severity: 'critical', priority: 10,
    pattern: new RegExp('\\bthermal runaway\\b|\\bcatastrophic failure\\b|\\bexplosion risk\\b|\\bexplode\\b', 'i'),
    summary: 'Captured high-risk tank failure or thermal-runaway language.'
  },
  {
    category: 'pressure', severity: 'warning', priority: 8,
    pattern: new RegExp('\\bpressure\\b.{0,80}\\b(tank|valve|relief|rising|increasing|unstable)\\b|\\b(tank|valve|relief|unstable)\\b.{0,80}\\bpressure\\b', 'i'),
    summary: 'Captured pressure-related language near tank/valve context.'
  },
  {
    category: 'leak', severity: 'warning', priority: 8,
    pattern: new RegExp('\\b(active leak|leaking|spill(?:ed|ing)?|released?|chemical release)\\b', 'i'),
    summary: 'Captured release/leak/spill language.'
  },
  {
    category: 'plume', severity: 'warning', priority: 8,
    pattern: new RegExp('\\b(plume|vapors?|off[- ]?gassing|gas leak|chemical cloud)\\b', 'i'),
    summary: 'Captured plume/vapor/off-gassing language.'
  },
  {
    category: 'air_monitoring', severity: 'watch', priority: 7,
    pattern: new RegExp('\\bair monitoring\\b.{0,160}\\b(no|not|detected|reading|levels?|safe|unsafe|ongoing)\\b|\\b(no|not|detected|reading|levels?|safe|unsafe|ongoing)\\b.{0,160}\\bair monitoring\\b|\\bchemical vapors?\\b.{0,120}\\b(detected|not detected|no)\\b', 'i'),
    summary: 'Captured air-monitoring or vapor-detection language.'
  },
  {
    category: 'containment', severity: 'watch', priority: 6,
    pattern: new RegExp('\\b(containment|berm|storm drain|runoff|dike|divert|contained)\\b.{0,120}\\b(chemical|spill|tank|water|runoff|drain|site)\\b|\\b(chemical|spill|tank|water|runoff|drain|site)\\b.{0,120}\\b(containment|berm|storm drain|runoff|dike|divert|contained)\\b', 'i'),
    summary: 'Captured containment/runoff/storm-drain language.'
  },
  {
    category: 'cooling', severity: 'watch', priority: 7,
    pattern: new RegExp('\\b(cooling|cool(?:ed)?|water stream|water cannon|spray|hose)\\b.{0,140}\\b(tank|chemical|temperature|liquid|operation|effort)\\b|\\b(tank|chemical|temperature|liquid|operation|effort)\\b.{0,140}\\b(cooling|cool(?:ed)?|water stream|water cannon|spray|hose)\\b', 'i'),
    summary: 'Captured cooling-operation language.'
  },
  {
    category: 'neutralization', severity: 'watch', priority: 7,
    pattern: new RegExp('\\bneutraliz(?:e|ing|ation)\\b', 'i'),
    summary: 'Captured neutralization language.'
  },
  {
    category: 'evacuation', severity: 'info', priority: 3,
    pattern: new RegExp('\\bevacuat(?:e|ion|ed)\\b|\\bshelter[- ]?in[- ]?place\\b', 'i'),
    summary: 'Captured public-instruction language.'
  }
];

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet(ss, EVENT_SHEET_NAME, [
    'id', 'observedAt', 'sourcePublishedAt', 'sourceName', 'sourceUrl', 'sourceTier',
    'category', 'value', 'units', 'summary', 'excerpt', 'confidence', 'severity', 'contentHash', 'sourcePriority', 'rulePriority'
  ]);
  ensureSheet(ss, SOURCE_HEALTH_SHEET_NAME, [
    'sourceName', 'sourceUrl', 'lastCheckedAt', 'ok', 'lastChangedAt', 'error', 'lastHash'
  ]);
  ensureSheet(ss, MANUAL_OVERRIDE_SHEET_NAME, [
    'enabled', 'category', 'value', 'units', 'trend', 'summary', 'sourceName', 'sourceUrl', 'sourcePublishedAt', 'confidence', 'severity', 'expiresAt'
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
        headers: { 'User-Agent': 'GardenGroveHazmatConditionMonitor/0.2 public-source monitor' }
      });
      var code = response.getResponseCode();
      var html = response.getContentText();
      if (code < 200 || code >= 300) throw new Error('HTTP ' + code);

      var text = stripHtml(html);
      var sourcePublishedAt = extractSourcePublishedAt(html, text);
      var pageHash = digest(text.slice(0, 20000));
      var events = parseSource(source, text, checkedAt, sourcePublishedAt);
      for (var j = 0; j < events.length; j++) appendEventIfNew(events[j]);
      updateSourceHealth(source, checkedAt, true, events.length > 0 ? checkedAt : '', '', pageHash);
    } catch (err) {
      updateSourceHealth(source, checkedAt, false, '', String(err), '');
    }
  }
}

function parseSource(source, text, observedAt, sourcePublishedAt) {
  var normalized = String(text).replace(new RegExp('\\s+', 'g'), ' ').trim();
  var events = [];
  var seenCategories = {};

  for (var i = 0; i < CONDITION_RULES.length; i++) {
    var rule = CONDITION_RULES[i];
    if (seenCategories[rule.category]) continue;
    var match = normalized.match(rule.pattern);
    if (!match) continue;

    var excerpt = makeExcerpt(normalized, match.index || 0, 360);
    if (isWeakMatch(rule.category, excerpt)) continue;

    var value = rule.category === 'tank_temperature' && match[1] ? Number(match[1]) : '';
    var units = rule.category === 'tank_temperature' ? inferTemperatureUnit(match, excerpt, source) : '';
    var summary = summarizeMatch(rule, match[0], source.name, value, units, excerpt);
    var hash = digest(source.id + '|' + rule.category + '|' + summary + '|' + excerpt);

    events.push({
      id: hash,
      observedAt: observedAt,
      sourcePublishedAt: sourcePublishedAt || '',
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
      contentHash: hash,
      sourcePriority: source.priority || sourcePriority(source.tier),
      rulePriority: rule.priority || 0
    });
    seenCategories[rule.category] = true;
  }

  return events;
}

function inferTemperatureUnit(match, excerpt, source) {
  var matchedText = String(match[0] || '').toLowerCase();
  var context = String(excerpt || '').toLowerCase();
  if (matchedText.indexOf('celsius') !== -1 || matchedText.indexOf('°c') !== -1 || matchedText.match(/\bc\b/)) return 'C';
  if (matchedText.indexOf('fahrenheit') !== -1 || matchedText.indexOf('°f') !== -1 || matchedText.match(/\bf\b/)) return 'F';
  if (context.indexOf('fahrenheit') !== -1 || context.indexOf('flashpoint is 50 fahrenheit') !== -1 || source.id === 'ap-summary') return 'F';
  return 'unknown';
}

function isWeakMatch(category, excerpt) {
  var lower = String(excerpt || '').toLowerCase();
  if (category === 'cooling' && lower.indexOf('water') !== -1 && lower.indexOf('cool') === -1 && lower.indexOf('tank') === -1) return true;
  if (category === 'leak' && lower.indexOf('leak') !== -1 && lower.indexOf('leaking') === -1 && lower.indexOf('spill') === -1 && lower.indexOf('release') === -1) return true;
  if (category === 'air_monitoring' && lower === 'air monitoring') return true;
  return false;
}

function summarizeMatch(rule, matchedText, sourceName, value, units, excerpt) {
  var cleaned = String(matchedText).replace(new RegExp('\\s+', 'g'), ' ').trim();
  if (rule.category === 'tank_temperature') {
    var unitLabel = units === 'unknown' || !units ? 'unknown unit' : '°' + units;
    return sourceName + ' reports a tank-temperature-related value of ' + value + unitLabel + '.';
  }
  if (rule.category === 'temperature_trend') {
    return sourceName + ' reports temperature-trend language: ' + cleaned + '.';
  }
  if (rule.category === 'thermal_runaway') return sourceName + ' includes high-risk tank failure language: ' + cleaned + '.';
  if (rule.category === 'leak') return sourceName + ' includes release/leak/spill language: ' + cleaned + '.';
  if (rule.category === 'plume') return sourceName + ' includes plume/vapor/off-gassing language: ' + cleaned + '.';
  if (rule.category === 'air_monitoring') return sourceName + ' includes air-monitoring or vapor-detection language.';
  if (rule.category === 'containment') return sourceName + ' includes containment/runoff/storm-drain language.';
  if (rule.category === 'cooling') return sourceName + ' includes cooling-operation language.';
  return sourceName + ' includes a ' + rule.category.replace(new RegExp('_', 'g'), ' ') + ' signal: ' + cleaned + '.';
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
    event.contentHash,
    event.sourcePriority || sourcePriority(event.sourceTier),
    event.rulePriority || 0
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
  if (rowIndex === -1) sheet.appendRow(row);
  else sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
}

function buildCurrentStatus() {
  setupSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var events = rowsToEvents(ss.getSheetByName(EVENT_SHEET_NAME));
  var overrides = rowsToManualOverrides(ss.getSheetByName(MANUAL_OVERRIDE_SHEET_NAME));
  events = overrides.concat(events);
  var sourceHealth = rowsToSourceHealth(ss.getSheetByName(SOURCE_HEALTH_SHEET_NAME));

  events.sort(function(a, b) {
    var timeDiff = new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return (Number(b.sourcePriority || 0) + Number(b.rulePriority || 0)) - (Number(a.sourcePriority || 0) + Number(a.rulePriority || 0));
  });

  var newestEvents = events.slice(0, 50);
  var bestEvents = events.slice(0).sort(function(a, b) {
    return (Number(b.sourcePriority || 0) + Number(b.rulePriority || 0)) - (Number(a.sourcePriority || 0) + Number(a.rulePriority || 0));
  });

  var lastPhysical = firstEventWhereNotCategory(newestEvents, 'evacuation');
  var latestTemperature = firstEventWhereCategory(bestEvents, 'tank_temperature');
  var latestTrend = firstEventWhereCategory(bestEvents, 'temperature_trend');

  return {
    generatedAt: new Date().toISOString(),
    lastSuccessfulPollAt: newestSourceCheck(sourceHealth),
    lastPhysicalUpdateAt: lastPhysical ? lastPhysical.observedAt : '',
    tankTemperature: latestTemperature ? {
      value: Number(latestTemperature.value) || undefined,
      units: latestTemperature.units || 'unknown',
      trend: inferTrend(latestTrend ? latestTrend.summary + ' ' + latestTrend.excerpt : ''),
      sourceName: latestTemperature.sourceName,
      sourcePublishedAt: latestTemperature.sourcePublishedAt,
      confidence: latestTemperature.confidence
    } : undefined,
    leakPlumeStatus: latestSummary(bestEvents, ['leak', 'plume']),
    airMonitoringStatus: latestSummary(bestEvents, ['air_monitoring']),
    containmentStatus: latestSummary(bestEvents, ['containment']),
    coolingNeutralizationStatus: latestSummary(bestEvents, ['cooling', 'neutralization']),
    overallStatus: latestOverallStatus(bestEvents),
    confidence: bestEvents[0] ? bestEvents[0].confidence : 'unconfirmed',
    physicalSituationSummary: latestOverallStatus(bestEvents),
    newestEvents: newestEvents,
    sourceHealth: sourceHealth
  };
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
      category: row[6], value: row[7], units: row[8], summary: row[9], excerpt: row[10], confidence: row[11], severity: row[12], contentHash: row[13],
      sourcePriority: Number(row[14] || sourcePriority(row[5])), rulePriority: Number(row[15] || 0)
    });
  }
  return events;
}

function rowsToManualOverrides(sheet) {
  var values = sheet.getDataRange().getValues();
  var events = [];
  if (values.length < 2) return events;
  var now = new Date().getTime();
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var enabled = String(row[0]).toLowerCase() === 'true' || row[0] === true || String(row[0]).toLowerCase() === 'yes';
    if (!enabled) continue;
    if (row[11] && new Date(row[11]).getTime() < now) continue;
    var category = row[1] || 'other';
    var summary = row[5] || 'Manual override entered in the monitoring sheet.';
    var observedAt = new Date().toISOString();
    events.push({
      id: 'manual-' + i + '-' + digest(String(summary)),
      observedAt: observedAt,
      sourcePublishedAt: row[8] || '',
      sourceName: row[6] || 'Manual override',
      sourceUrl: row[7] || '',
      sourceTier: 'manual',
      category: category,
      value: row[2] || '',
      units: row[3] || '',
      summary: summary,
      excerpt: summary,
      confidence: row[9] || 'attributed_to_official',
      severity: row[10] || 'watch',
      contentHash: 'manual-' + i,
      sourcePriority: 99,
      rulePriority: 99
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
    sources.push({ sourceName: row[0], sourceUrl: row[1], lastCheckedAt: row[2], ok: row[3] === true || row[3] === 'TRUE', lastChangedAt: row[4], error: row[5] });
  }
  return sources;
}

function firstEventWhereCategory(events, category) {
  for (var i = 0; i < events.length; i++) if (events[i].category === category) return events[i];
  return null;
}

function firstEventWhereNotCategory(events, category) {
  for (var i = 0; i < events.length; i++) if (events[i].category !== category) return events[i];
  return null;
}

function latestSummary(events, categories) {
  for (var i = 0; i < events.length; i++) if (categories.indexOf(events[i].category) !== -1) return events[i].summary;
  return 'No current public update captured.';
}

function latestOverallStatus(events) {
  if (!events.length) return 'No public-source events captured yet. Run pollSources or check source access.';
  var temp = firstEventWhereCategory(events, 'tank_temperature');
  var trend = firstEventWhereCategory(events, 'temperature_trend');
  if (temp && trend) return temp.summary + ' ' + trend.summary;
  return events[0].summary;
}

function newestSourceCheck(sourceHealth) {
  if (!sourceHealth.length) return new Date().toISOString();
  var latest = sourceHealth[0].lastCheckedAt;
  for (var i = 1; i < sourceHealth.length; i++) if (String(sourceHealth[i].lastCheckedAt) > String(latest)) latest = sourceHealth[i].lastCheckedAt;
  return latest;
}

function inferTrend(text) {
  var lower = String(text || '').toLowerCase();
  if (lower.indexOf('stable') !== -1 || lower.indexOf('stabilized') !== -1 || lower.indexOf('maintained') !== -1) return 'stable';
  if (lower.indexOf('rising') !== -1 || lower.indexOf('increasing') !== -1) return 'rising';
  if (lower.indexOf('cooling') !== -1 || lower.indexOf('dropped') !== -1 || lower.indexOf('cooled') !== -1) return 'falling';
  return 'unknown';
}

function sourcePriority(tier) {
  if (tier === 'manual') return 99;
  if (tier === 'official') return 10;
  if (tier === 'media_live') return 7;
  if (tier === 'wire') return 4;
  return 1;
}

function doGet() {
  var output = ContentService.createTextOutput(JSON.stringify(buildCurrentStatus()));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function extractSourcePublishedAt(html, text) {
  var candidates = [
    /property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    /property=["']article:modified_time["'][^>]*content=["']([^"']+)["']/i,
    /name=["']date["'][^>]*content=["']([^"']+)["']/i,
    /datetime=["']([^"']+)["']/i,
    /updated\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i
  ];
  var source = String(html || '') + ' ' + String(text || '').slice(0, 2000);
  for (var i = 0; i < candidates.length; i++) {
    var match = source.match(candidates[i]);
    if (match && match[1]) {
      var parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
      return match[1];
    }
  }
  return '';
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
