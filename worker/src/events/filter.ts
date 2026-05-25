import { hasMediaIncidentSignal, isPageFurniture } from '../parser/noiseFilters';

export type DisplayQuality = 'high' | 'medium' | 'low';

export type FilterableEvent = {
  sourceTier: string;
  summary: string;
  excerpt?: string;
  category: string;
};

export type DisplayEventEvaluation = {
  displayQuality: DisplayQuality;
  displayRejectReason?: string;
};

const PHYSICAL_CATEGORIES = new Set([
  'tank_temperature',
  'temperature_trend',
  'pressure',
  'thermal_runaway',
  'leak',
  'plume',
  'air_monitoring',
  'containment',
  'cooling',
  'neutralization',
]);

const HEAVY_FURNITURE_PATTERNS: Array<[RegExp, string]> = [
  [/\bshare\s+share\b/i, 'share block'],
  [/\bcopy\s+link\b/i, 'copy link block'],
  [/\bprint\s+email\b/i, 'print/email block'],
  [/\bread\s+more\b/i, 'read more block'],
  [/\bkey\s+headlines\b/i, 'key headlines block'],
  [/\btop\s+stories\b/i, 'top stories block'],
  [/\bnewsletters?\b/i, 'newsletter block'],
  [/\brelated\s+stories\b/i, 'related stories block'],
  [/\ball\s+rights\s+reserved\b/i, 'rights/footer block'],
];

const SOCIAL_CLUSTER_TERMS = ['bluesky', 'flipboard', 'pinterest', 'reddit', 'facebook', 'twitter'];
const LIVE_VIDEO_CLUSTER_TERMS = [
  'watch live',
  '24/7 live',
  'california live',
  'inland empire',
  'ventura county',
  'youtube',
  'video',
  'latest headlines',
  'live updates',
  'page navigation',
  'navigation',
];

const PHYSICAL_EVIDENCE_PATTERNS = [
  /\btank temperature\b/i,
  /\btemperature (?:gauge|inside the tank|in the tank)\b/i,
  /\bgauge covered by water\b/i,
  /\btemperature increased to \d+/i,
  /\b\d{2,3}\s*degrees\b/i,
  /\bcrack(?:ed)? in (?:the )?tank\b/i,
  /\breliev(?:e|ing|ed) pressure\b/i,
  /\bpressure relief\b/i,
  /\bvent(?:ing|ed)? vapou?rs?\b/i,
  /\bcool off (?:the )?chemical\b/i,
  /\bcooling operation\b/i,
  /\bcooling (?:continues|water|effort|system|operations?)\b/i,
  /\bcontainment\b/i,
  /\bair monitoring\b/i,
  /\bmethyl methacrylate\b/i,
  /\bchemical tank\b/i,
  /\bGKN Aerospace\b/i,
];

const OPERATIONAL_EVACUATION_PATTERNS = [
  /\bofficial (?:evacuation )?order\b/i,
  /\border (?:active|remains|issued|lifted|expanded)\b/i,
  /\b(?:mandatory )?evacuation order\b/i,
  /\bresidents? (?:were )?ordered\b/i,
  /\bzone boundaries?\b/i,
  /\b(?:north|south|east|west) of\b/i,
  /\bshelter\b/i,
  /\bcare center\b/i,
  /\baffected cit(?:y|ies)\b/i,
  /\baddress checker\b/i,
  /\broad closure\b/i,
  /\bofficial instruction\b/i,
  /\b12122 Western\b/i,
  /\bWestern Ave\b/i,
];

const OFFICIAL_INCIDENT_START_PATTERNS = [
  /\bGARDEN GROVE HAZMAT INCIDENT\b/i,
  /\bEmergency crews are responding\b/i,
  /\bEvacuation Order\b/i,
  /\bchemical spill\b/i,
  /\bcooling operation\b/i,
  /\bproduct removal\b/i,
  /\bpressure\b/i,
  /\bvapor release\b/i,
  /\bmethyl methacrylate\b/i,
  /\bhazardous chemical\b/i,
];

const OFFICIAL_CMS_FURNITURE_PATTERNS = [
  /\bSkip to main content\b/gi,
  /\bAccessibility Help\b/gi,
  /\bMenu Open\b/gi,
  /\bMenu Close\b/gi,
  /\bContent block block-[a-z0-9-]+\b/gi,
  /\bCustom Google Search Submit\b/gi,
  /\bGovernment Residents Businesses Public Safety News Media Kit\b/gi,
  /\bResidents Businesses Public Safety News Media Kit\b/gi,
  /\bSearch Submit\b/gi,
  /\bSelect Language\b/gi,
  /\bPowered by Google Translate\b/gi,
  /\bTranslate\b/gi,
  /\bEnglish\s+Espa(?:ñ|&#\d+;)ol\s+Ti(?:ếng|&#\d+;ng)\s+Vi(?:ệt|&#\d+;t)\s+(?:(?:&#\d+;)+\s*)+/gi,
  /\bEnglish Español Tiếng Việt 한국어 中文\b/gi,
  /\bEspañol Tiếng Việt 한국어 中文\b/gi,
  /\bFacebook Twitter Instagram YouTube LinkedIn\b/gi,
];

function normalizedText(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function clusterHitCount(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term)).length;
}

function heavyFurnitureReason(text: string): string | undefined {
  const normalized = normalizedText(text);
  if (!normalized) return undefined;

  for (const [pattern, reason] of HEAVY_FURNITURE_PATTERNS) {
    if (pattern.test(normalized)) return reason;
  }

  if (clusterHitCount(normalized, SOCIAL_CLUSTER_TERMS) >= 2) {
    return 'social link cluster';
  }

  if (clusterHitCount(normalized, LIVE_VIDEO_CLUSTER_TERMS) >= 2) {
    return 'live navigation/video cluster';
  }

  return undefined;
}

function hasPhysicalBodyEvidence(event: FilterableEvent, eventText: string): boolean {
  return PHYSICAL_CATEGORIES.has(event.category) && PHYSICAL_EVIDENCE_PATTERNS.some((pattern) => pattern.test(eventText));
}

function meaningfulIncidentStartIndex(text: string): number | undefined {
  const indexes = OFFICIAL_INCIDENT_START_PATTERNS.flatMap((pattern) => {
    const match = pattern.exec(text);
    return match?.index === undefined ? [] : [match.index];
  });

  if (indexes.length === 0) return undefined;

  return Math.min(...indexes);
}

export function cleanDisplayText(text: string): string {
  return normalizedText(text)
    .replace(/\s*this live blog has ended\.?\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanOfficialDisplayExcerpt(text: string): string {
  let cleaned = cleanDisplayText(text);

  for (const pattern of OFFICIAL_CMS_FURNITURE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  cleaned = cleaned
    .replace(/\b(?:Language|Languages)\s+(?:English\s*)?/gi, ' ')
    .replace(/\s*[|/\\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const startIndex = meaningfulIncidentStartIndex(cleaned);
  if (startIndex !== undefined && startIndex > 0) {
    cleaned = cleaned.slice(startIndex).trim();
  }

  return cleaned.replace(/^[\s:;,.|-]+/, '').replace(/\s+/g, ' ').trim();
}

export function toDisplayEvent<T extends FilterableEvent>(event: T): T {
  return {
    ...event,
    summary: cleanDisplayText(event.summary),
    excerpt:
      event.excerpt && event.sourceTier === 'official'
        ? cleanOfficialDisplayExcerpt(event.excerpt)
        : event.excerpt
          ? cleanDisplayText(event.excerpt)
          : event.excerpt,
  };
}

export function hasOperationalEvacuationDetail(eventText: string): boolean {
  return OPERATIONAL_EVACUATION_PATTERNS.some((pattern) => pattern.test(eventText));
}

export function evaluateDisplayEvent(event: FilterableEvent): DisplayEventEvaluation {
  const excerpt = normalizedText(event.excerpt ?? '');
  const eventText = normalizedText(`${event.summary} ${event.excerpt ?? ''}`);
  const excerptFurniture = heavyFurnitureReason(excerpt);
  const combinedFurniture = heavyFurnitureReason(eventText);

  if (excerptFurniture || combinedFurniture || isPageFurniture(excerpt)) {
    return {
      displayQuality: 'low',
      displayRejectReason: excerptFurniture ?? combinedFurniture ?? 'page furniture',
    };
  }

  const isMediaReported = event.sourceTier === 'media_live' || event.sourceTier === 'wire' || event.sourceTier === 'social';

  if (!isMediaReported) {
    return { displayQuality: PHYSICAL_CATEGORIES.has(event.category) ? 'high' : 'medium' };
  }

  if (!hasMediaIncidentSignal(eventText)) {
    return { displayQuality: 'low', displayRejectReason: 'weak media incident signal' };
  }

  if (event.category === 'evacuation') {
    return hasOperationalEvacuationDetail(eventText)
      ? { displayQuality: 'medium' }
      : { displayQuality: 'low', displayRejectReason: 'media evacuation lacks operational detail' };
  }

  if (hasPhysicalBodyEvidence(event, eventText)) {
    return { displayQuality: 'high' };
  }

  return PHYSICAL_CATEGORIES.has(event.category)
    ? { displayQuality: 'low', displayRejectReason: 'media physical event lacks body evidence' }
    : { displayQuality: 'medium' };
}

export function shouldExposeEvent(event: FilterableEvent): boolean {
  return evaluateDisplayEvent(event).displayQuality !== 'low';
}
