import { shouldExposeEvent } from '../events/filter';
import {
  listRecentEvents,
  listSourceHealth,
  type SourceHealth,
  type StoredHazmatEvent,
  type WorkerEnv,
} from '../storage/d1';

type CurrentStatus = {
  generatedAt: string;
  lastSuccessfulPollAt: string;
  lastPhysicalUpdateAt?: string;
  tankTemperature?: {
    value?: number;
    units?: 'F' | 'C' | 'unknown';
    trend?: 'rising' | 'falling' | 'stable' | 'unknown';
    sourceName: string;
    sourcePublishedAt?: string;
    confidence: string;
  };
  leakPlumeStatus?: string;
  airMonitoringStatus?: string;
  containmentStatus?: string;
  coolingNeutralizationStatus?: string;
  overallStatus?: string;
  confidence?: string;
  physicalSituationSummary: string;
  resources: ReturnType<typeof buildEvacuationResources>;
  sourceFreshness: ReturnType<typeof buildSourceFreshness>;
  newestEvents: StoredHazmatEvent[];
  sourceHealth: SourceHealth[];
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

function timeValue(value?: string): number {
  if (!value) return 0;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sourceRank(event: StoredHazmatEvent): number {
  if (event.sourceTier === 'manual') return 100;
  if (event.sourceTier === 'official') return 80;
  if (event.sourceTier === 'media_live') return 60;
  if (event.sourceTier === 'wire') return 50;
  return 10;
}

function relevanceScore(event: StoredHazmatEvent): number {
  return sourceRank(event) + (event.sourcePriority ?? 0) + (event.rulePriority ?? 0);
}

function sortNewest(events: StoredHazmatEvent[]): StoredHazmatEvent[] {
  return [...events].sort((a, b) => {
    const timeDiff = timeValue(b.observedAt) - timeValue(a.observedAt);
    if (timeDiff !== 0) return timeDiff;

    return relevanceScore(b) - relevanceScore(a);
  });
}

function sortBest(events: StoredHazmatEvent[]): StoredHazmatEvent[] {
  return [...events].sort((a, b) => {
    const scoreDiff = relevanceScore(b) - relevanceScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    return timeValue(b.observedAt) - timeValue(a.observedAt);
  });
}

function bestByCategory(events: StoredHazmatEvent[], category: string): StoredHazmatEvent | undefined {
  const matching = events.filter((event) => event.category === category);
  const official = matching.filter((event) => event.sourceTier === 'official' || event.sourceTier === 'manual');

  return sortBest(official.length > 0 ? official : matching)[0];
}

function latestSummary(events: StoredHazmatEvent[], categories: string[]): string {
  const matching = categories.map((category) => bestByCategory(events, category)).find(Boolean);

  return matching?.summary ?? 'No current public update captured.';
}

function inferTrend(event?: StoredHazmatEvent): 'rising' | 'falling' | 'stable' | 'unknown' {
  const lower = `${event?.summary ?? ''} ${event?.excerpt ?? ''}`.toLowerCase();

  if (lower.includes('stable') || lower.includes('stabilized') || lower.includes('maintained')) return 'stable';
  if (lower.includes('rising') || lower.includes('increasing')) return 'rising';
  if (lower.includes('cooling') || lower.includes('dropped') || lower.includes('cooled')) return 'falling';
  return 'unknown';
}

function newestSuccessfulPoll(sourceHealth: SourceHealth[]): string {
  const latest = sourceHealth.filter((source) => source.ok).sort((a, b) => timeValue(b.lastCheckedAt) - timeValue(a.lastCheckedAt))[0];

  return latest?.lastCheckedAt ?? new Date().toISOString();
}

function firstPhysicalEvent(events: StoredHazmatEvent[]): StoredHazmatEvent | undefined {
  return sortNewest(events).find((event) => PHYSICAL_CATEGORIES.has(event.category));
}

function latestMediaPhysicalEvent(events: StoredHazmatEvent[]): StoredHazmatEvent | undefined {
  return sortNewest(events).find(
    (event) => (event.sourceTier === 'media_live' || event.sourceTier === 'wire') && PHYSICAL_CATEGORIES.has(event.category),
  );
}

function latestOfficialCheck(sourceHealth: SourceHealth[]): string | undefined {
  return sourceHealth
    .filter((source) => source.ok && source.sourceName.toLowerCase().match(/garden grove|sheriff|cal oes/))
    .sort((a, b) => timeValue(b.lastCheckedAt) - timeValue(a.lastCheckedAt))[0]?.lastCheckedAt;
}

function buildTankTemperature(events: StoredHazmatEvent[]): CurrentStatus['tankTemperature'] {
  const latestTemperature = bestByCategory(events, 'tank_temperature');
  if (!latestTemperature) return undefined;

  const latestTrend = bestByCategory(events, 'temperature_trend');
  const numericValue =
    typeof latestTemperature.value === 'number' ? latestTemperature.value : Number(latestTemperature.value);

  return {
    value: Number.isFinite(numericValue) ? numericValue : undefined,
    units: latestTemperature.units === 'F' || latestTemperature.units === 'C' ? latestTemperature.units : 'unknown',
    trend: inferTrend(latestTrend),
    sourceName: latestTemperature.sourceName,
    sourcePublishedAt: latestTemperature.sourcePublishedAt,
    confidence: latestTemperature.confidence,
  };
}

function latestOverallEvent(events: StoredHazmatEvent[]): StoredHazmatEvent | undefined {
  const temp = bestByCategory(events, 'tank_temperature');

  return temp ?? sortBest(events)[0];
}

function latestOverallStatus(events: StoredHazmatEvent[]): string {
  if (events.length === 0) {
    return 'No filtered public-source events captured yet. Run a manual poll or inspect source health.';
  }

  const temp = bestByCategory(events, 'tank_temperature');
  const trend = bestByCategory(events, 'temperature_trend');

  if (temp && trend) {
    return `${temp.summary} ${trend.summary}`;
  }

  return sortBest(events)[0]?.summary ?? 'No current public update captured.';
}

function buildEvacuationResources() {
  return {
    status: 'Evacuation Orders Active',
    incidentSite: 'GKN Aerospace / MMA Leak - 12122 Western Ave, Garden Grove',
    evacuationZone: ['South of Ball Road', 'East of Valley View Street', 'West of Dale Street', 'North of Trask Avenue'],
    affectedCities: ['Garden Grove', 'Stanton', 'Anaheim', 'Cypress', 'Westminster', 'Buena Park'],
    timeline: [
      '5/21 18:41 - OCSD mandatory evacuation order issued',
      '5/22 06:07 - additional evacuation orders launched',
      '5/22 11:16 - evacuation area expanded',
      '5/22 13:00 - Garden Grove text update: mandatory area expanded',
      '5/23 10:00 / 14:00 / 15:00 - official video updates listed',
    ],
    hotlines: [
      { label: 'Garden Grove Emergency Hotline', value: '714-741-5444' },
      {
        label: 'Orange County Public Information Hotline',
        value: '714-628-7085',
        note: 'Call before driving to a shelter; vacancy can fluctuate.',
      },
      { label: 'OCFA Medical Information Hotline', value: '714-538-2501' },
      { label: 'Emergency', value: '911' },
    ],
    officialLinks: [
      {
        label: 'Garden Grove emergency page / address checker',
        url: 'https://ggcity.org/emergency',
        note: 'Official evacuation map, address checker, hotel resources, multilingual notices.',
      },
      {
        label: 'OC Sheriff disaster resources',
        url: 'https://www.ocsheriff.gov/resources-during-disaster',
        note: 'Shelters, closures, affected cities, public information hotline.',
      },
      { label: 'OCFA homepage', url: 'https://www.ocfa.org/', note: 'Official fire authority site and community hotline pointer.' },
      {
        label: 'Cal OES community resources',
        url: 'https://news.caloes.ca.gov/community-resources-for-garden-grove-hazmat-incident/',
        note: 'State emergency resource page.',
      },
    ],
    shelterLinks: [
      {
        label: 'Shelter and care center list',
        url: 'https://www.ocsheriff.gov/resources-during-disaster',
        note: 'Call 714-628-7085 for current shelter availability.',
      },
    ],
    hotelLinks: [
      {
        label: 'Hotel resources and emergency rates',
        url: 'https://ggcity.org/emergency',
        note: 'Listed on official Garden Grove emergency page.',
      },
    ],
    languages: ['English', 'Spanish', 'Vietnamese', 'Korean'],
    notes: [
      'Evacuation instructions are official public-safety orders, not dashboard-generated advice.',
      'This monitor does not have public live tank telemetry.',
      'Call the public information hotline before traveling to a shelter because capacity may change.',
    ],
  };
}

function buildSourceFreshness(
  sourceHealth: SourceHealth[],
  latestMediaPhysical: StoredHazmatEvent | undefined,
  newestEvents: StoredHazmatEvent[],
) {
  const latestOfficial = latestOfficialCheck(sourceHealth);

  return {
    latestOfficialTextUpdate: latestOfficial,
    latestOfficialVideoUpdate: '5/23/26 10:00 AM, 2:00 PM, and 3:00 PM - official video updates listed on Garden Grove emergency page.',
    latestMediaPhysicalUpdate: latestMediaPhysical?.sourcePublishedAt || latestMediaPhysical?.observedAt,
    latestMonitorCapture: newestEvents[0]?.observedAt ?? new Date().toISOString(),
    telemetryStatus:
      'No public live tank temperature, pressure, plume sensor, or direct telemetry feed found. Numeric tank values are public-source reports, not direct telemetry.',
    freshnessWarning:
      'Status is assembled from filtered D1 events created by manual polling. Low-quality stored media rows are excluded from status cards by default.',
  };
}

export async function buildCurrentStatusFromD1(env: WorkerEnv): Promise<CurrentStatus> {
  const generatedAt = new Date().toISOString();
  const [rawEvents, sourceHealth] = await Promise.all([listRecentEvents(env, 150), listSourceHealth(env)]);
  const filteredEvents = rawEvents.filter(shouldExposeEvent);
  const newestEvents = sortNewest(filteredEvents).slice(0, 50);
  const bestEvents = sortBest(filteredEvents);
  const latestPhysical = firstPhysicalEvent(filteredEvents);
  const latestMediaPhysical = latestMediaPhysicalEvent(filteredEvents);
  const overallEvent = latestOverallEvent(bestEvents);
  const overallStatus = latestOverallStatus(bestEvents);

  return {
    generatedAt,
    lastSuccessfulPollAt: newestSuccessfulPoll(sourceHealth),
    lastPhysicalUpdateAt: latestPhysical?.observedAt,
    tankTemperature: buildTankTemperature(bestEvents),
    leakPlumeStatus: latestSummary(bestEvents, ['leak', 'plume']),
    airMonitoringStatus: latestSummary(bestEvents, ['air_monitoring']),
    containmentStatus: latestSummary(bestEvents, ['containment']),
    coolingNeutralizationStatus: latestSummary(bestEvents, ['cooling', 'neutralization']),
    overallStatus,
    confidence: overallEvent?.confidence ?? 'unconfirmed',
    physicalSituationSummary: overallStatus,
    resources: buildEvacuationResources(),
    sourceFreshness: buildSourceFreshness(sourceHealth, latestMediaPhysical, newestEvents),
    newestEvents,
    sourceHealth,
  };
}
