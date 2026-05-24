import { CONDITION_RULES } from './conditionRules';
import { buildIncidentWindows, hasIncidentAnchor } from './incidentWindows';
import { hasMediaIncidentSignal, isPageFurniture } from './noiseFilters';
import { extractSourcePublishedAt } from './sourceTime';
import type { ConditionCategory, ConditionRule, ParsedHazmatEvent, ParserResult, ParserSource } from './types';

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function stripHtml(html: string): string {
  return String(html || '')
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

function sourcePriority(tier: ParserSource['tier']): number {
  if (tier === 'manual') return 99;
  if (tier === 'official') return 10;
  if (tier === 'media_live') return 7;
  if (tier === 'wire') return 4;
  return 1;
}

function digest(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function makeExcerpt(text: string, index: number, radius: number): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);

  return text.slice(start, end).trim();
}

function contextSupportsFahrenheit(excerpt: string): boolean {
  const lower = excerpt.toLowerCase();

  return (
    lower.includes('fahrenheit') ||
    lower.includes('deg f') ||
    lower.includes('degrees f') ||
    lower.includes('flashpoint is 50 fahrenheit') ||
    lower.includes('flash point is 50 fahrenheit')
  );
}

function inferTemperatureUnit(match: RegExpMatchArray, excerpt: string): 'F' | 'C' | 'unknown' {
  const matchedText = String(match[0] || '').toLowerCase();

  if (matchedText.includes('celsius') || /(?:\u00b0\s*c|\bc\b)/i.test(matchedText)) {
    return 'C';
  }

  if (matchedText.includes('fahrenheit') || /(?:\u00b0\s*f|\bf\b)/i.test(matchedText)) {
    return 'F';
  }

  return contextSupportsFahrenheit(excerpt) ? 'F' : 'unknown';
}

function hasOperationalEvacuationDetail(excerpt: string): boolean {
  const lower = excerpt.toLowerCase();

  return (
    lower.includes('mandatory') ||
    lower.includes('order') ||
    lower.includes('ordered') ||
    lower.includes('zone') ||
    lower.includes('area') ||
    lower.includes('expanded') ||
    lower.includes('lifted') ||
    lower.includes('shelter-in-place') ||
    lower.includes('shelter in place') ||
    lower.includes('residents') ||
    lower.includes('north of') ||
    lower.includes('south of') ||
    lower.includes('east of') ||
    lower.includes('west of') ||
    lower.includes('western') ||
    lower.includes('address')
  );
}

function isMediaTier(source: ParserSource): boolean {
  return source.tier === 'media_live' || source.tier === 'wire';
}

function isWeakMatch(source: ParserSource, category: ConditionCategory, excerpt: string): boolean {
  const lower = String(excerpt || '').toLowerCase();

  if (!hasIncidentAnchor(lower)) return true;
  if (isPageFurniture(lower)) return true;
  if (isMediaTier(source) && !hasMediaIncidentSignal(lower)) return true;
  if (category === 'cooling' && lower.includes('water') && !lower.includes('cool') && !lower.includes('tank')) return true;
  if (
    category === 'leak' &&
    lower.includes('leak') &&
    !lower.includes('leaking') &&
    !lower.includes('spill') &&
    !lower.includes('release') &&
    !lower.includes('breach') &&
    !lower.includes('rupture')
  ) {
    return true;
  }
  if (category === 'air_monitoring' && lower === 'air monitoring') return true;
  if (category === 'evacuation' && isMediaTier(source) && !hasOperationalEvacuationDetail(lower)) return true;

  return false;
}

function qualityForEvent(
  source: ParserSource,
  category: ConditionCategory,
  excerpt: string,
): Pick<ParsedHazmatEvent, 'parserQuality' | 'parserReasons'> {
  const reasons: string[] = [];

  if (source.tier === 'official') {
    reasons.push('official_source');
  }
  if (hasMediaIncidentSignal(excerpt)) {
    reasons.push('strong_incident_signal');
  }
  if (category === 'evacuation' && hasOperationalEvacuationDetail(excerpt)) {
    reasons.push('evacuation_operational_detail');
  }
  if (isPageFurniture(excerpt)) {
    reasons.push('page_furniture_signal');
  }

  if (reasons.includes('page_furniture_signal')) {
    return { parserQuality: 'low', parserReasons: reasons };
  }
  if (source.tier === 'official' || reasons.includes('strong_incident_signal')) {
    return { parserQuality: 'high', parserReasons: reasons };
  }

  return { parserQuality: 'medium', parserReasons: reasons.length ? reasons : ['basic_incident_anchor'] };
}

function qualityRank(event: ParsedHazmatEvent): number {
  if (event.parserQuality === 'high') return 3;
  if (event.parserQuality === 'medium') return 2;
  return 1;
}

function isBetterCandidate(candidate: ParsedHazmatEvent, current?: ParsedHazmatEvent): boolean {
  if (!current) return true;

  const rankDiff = qualityRank(candidate) - qualityRank(current);
  if (rankDiff !== 0) return rankDiff > 0;

  return (candidate.excerpt?.length ?? 0) > (current.excerpt?.length ?? 0);
}

function summarizeMatch(
  rule: ConditionRule,
  matchedText: string,
  sourceName: string,
  value: string | number | undefined,
  units: string | undefined,
): string {
  const cleaned = matchedText.replace(/\s+/g, ' ').trim();

  if (rule.category === 'tank_temperature') {
    const unitLabel = units === 'unknown' || !units ? 'unknown unit' : `deg ${units}`;
    return `${sourceName} reports a tank-temperature-related value of ${value} ${unitLabel}.`;
  }
  if (rule.category === 'temperature_trend') return `${sourceName} reports temperature-trend language: ${cleaned}.`;
  if (rule.category === 'thermal_runaway') return `${sourceName} includes high-risk tank failure language: ${cleaned}.`;
  if (rule.category === 'leak') return `${sourceName} includes release/leak/spill language: ${cleaned}.`;
  if (rule.category === 'plume') return `${sourceName} includes plume/vapor/off-gassing language: ${cleaned}.`;
  if (rule.category === 'air_monitoring') return `${sourceName} includes air-monitoring or vapor-detection language.`;
  if (rule.category === 'containment') return `${sourceName} includes containment/runoff/storm-drain language.`;
  if (rule.category === 'cooling') return `${sourceName} includes cooling-operation language.`;

  return `${sourceName} includes a ${rule.category.replace(/_/g, ' ')} signal: ${cleaned}.`;
}

export function extractEventsFromText(
  source: ParserSource,
  text: string,
  observedAt = new Date().toISOString(),
  sourcePublishedAt?: string,
): ParserResult {
  const normalized = normalizeText(text);
  const windows = buildIncidentWindows(normalized, source.tier);
  const eventsByCategory = new Map<ConditionCategory, ParsedHazmatEvent>();

  for (const windowText of windows) {
    for (const rule of CONDITION_RULES) {
      const match = windowText.match(rule.pattern);
      if (!match) continue;

      const excerpt = makeExcerpt(windowText, match.index || 0, 360);
      if (isWeakMatch(source, rule.category, excerpt)) continue;

      const value = rule.category === 'tank_temperature' && match[1] ? Number(match[1]) : undefined;
      const units = rule.category === 'tank_temperature' ? inferTemperatureUnit(match, excerpt) : undefined;
      const summary = summarizeMatch(rule, match[0], source.name, value, units);
      const hash = digest(`${source.id}|${rule.category}|${summary}|${excerpt}`);
      const quality = qualityForEvent(source, rule.category, excerpt);

      const candidate = {
        id: hash,
        observedAt,
        sourcePublishedAt,
        sourceName: source.name,
        sourceUrl: source.url,
        sourceTier: source.tier,
        category: rule.category,
        value,
        units,
        summary,
        excerpt,
        confidence: source.tier === 'official' ? 'official' : 'media_reported',
        severity: rule.severity,
        contentHash: hash,
        sourcePriority: source.priority || sourcePriority(source.tier),
        rulePriority: rule.priority,
        ...quality,
      };

      if (isBetterCandidate(candidate, eventsByCategory.get(rule.category))) {
        eventsByCategory.set(rule.category, candidate);
      }
    }
  }

  const events = [...eventsByCategory.values()];

  return {
    events,
    metadata: {
      observedAt,
      sourcePublishedAt,
      incidentWindowCount: windows.length,
      rejectedAsNoise: windows.length === 0 && normalized.length > 0,
      normalizedTextLength: normalized.length,
      parserMode: 'local_smoke_only',
    },
  };
}

export function extractEventsFromHtmlOrText(source: ParserSource, html = '', text = ''): ParserResult {
  const observedAt = new Date().toISOString();
  const sourcePublishedAt = extractSourcePublishedAt(html, text);
  const bodyText = normalizeText(text || stripHtml(html));

  return extractEventsFromText(source, bodyText, observedAt, sourcePublishedAt);
}
