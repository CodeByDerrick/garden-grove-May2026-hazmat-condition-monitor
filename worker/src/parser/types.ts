export type SourceTier = 'official' | 'media_live' | 'wire' | 'social' | 'manual';

export type ConditionCategory =
  | 'tank_temperature'
  | 'temperature_trend'
  | 'pressure'
  | 'thermal_runaway'
  | 'leak'
  | 'plume'
  | 'air_monitoring'
  | 'containment'
  | 'cooling'
  | 'neutralization'
  | 'evacuation'
  | 'resource'
  | 'other';

export type Confidence = 'official' | 'attributed_to_official' | 'media_reported' | 'unconfirmed';

export type Severity = 'info' | 'watch' | 'warning' | 'critical';

export type ParserSource = {
  id: string;
  name: string;
  url: string;
  tier: SourceTier;
  priority?: number;
};

export type ParsedHazmatEvent = {
  id: string;
  observedAt: string;
  sourcePublishedAt?: string;
  sourceName: string;
  sourceUrl: string;
  sourceTier: SourceTier;
  category: ConditionCategory;
  value?: string | number;
  units?: 'F' | 'C' | 'ppm' | 'unknown';
  summary: string;
  excerpt?: string;
  confidence: Confidence;
  severity: Severity;
  contentHash: string;
  sourcePriority: number;
  rulePriority: number;
  parserQuality: 'high' | 'medium' | 'low';
  parserReasons: string[];
};

export type ConditionRule = {
  category: ConditionCategory;
  severity: Severity;
  priority: number;
  pattern: RegExp;
  summary: string;
};

export type ParserMetadata = {
  observedAt: string;
  sourcePublishedAt?: string;
  incidentWindowCount: number;
  rejectedAsNoise: boolean;
  normalizedTextLength: number;
  parserMode: 'local_smoke_only';
};

export type ParserResult = {
  events: ParsedHazmatEvent[];
  metadata: ParserMetadata;
};

export type ParserSmokeRequest = {
  source: ParserSource;
  html?: string;
  text?: string;
};
