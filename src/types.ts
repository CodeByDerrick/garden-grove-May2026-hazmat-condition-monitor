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

export type HazmatEvent = {
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
};

export type SourceHealth = {
  sourceName: string;
  sourceUrl?: string;
  lastCheckedAt: string;
  ok: boolean;
  lastChangedAt?: string;
  error?: string;
};

export type TankTemperatureStatus = {
  value?: number;
  units?: 'F' | 'C' | 'unknown';
  trend?: 'rising' | 'falling' | 'stable' | 'unknown';
  sourceName: string;
  sourcePublishedAt?: string;
  confidence: Confidence | string;
};

export type ResourceLink = {
  label: string;
  url: string;
  note?: string;
};

export type Hotline = {
  label: string;
  value: string;
  note?: string;
};

export type EvacuationResources = {
  status: string;
  incidentSite: string;
  evacuationZone: string[];
  affectedCities: string[];
  timeline: string[];
  hotlines: Hotline[];
  officialLinks: ResourceLink[];
  shelterLinks: ResourceLink[];
  hotelLinks: ResourceLink[];
  languages: string[];
  notes: string[];
};

export type SourceFreshness = {
  latestOfficialTextUpdate?: string;
  latestOfficialVideoUpdate?: string;
  latestMediaPhysicalUpdate?: string;
  latestMonitorCapture?: string;
  telemetryStatus: string;
  freshnessWarning?: string;
};

export type CurrentStatus = {
  generatedAt: string;
  lastSuccessfulPollAt: string;
  lastPhysicalUpdateAt?: string;
  tankTemperature?: TankTemperatureStatus;
  leakPlumeStatus?: string;
  airMonitoringStatus?: string;
  containmentStatus?: string;
  coolingNeutralizationStatus?: string;
  overallStatus?: string;
  confidence?: Confidence | string;
  physicalSituationSummary: string;
  resources?: EvacuationResources;
  sourceFreshness?: SourceFreshness;
  newestEvents: HazmatEvent[];
  sourceHealth: SourceHealth[];
};

export type SourceConfig = {
  id: string;
  name: string;
  url: string;
  tier: SourceTier;
  pollIntervalSeconds: number;
  enabled: boolean;
  selectors?: string[];
  keywords: string[];
};
