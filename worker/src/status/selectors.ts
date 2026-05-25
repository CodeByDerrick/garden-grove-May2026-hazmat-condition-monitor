import { evaluateDisplayEvent, shouldExposeEvent } from '../events/filter';
import { hasMediaIncidentSignal, isPageFurniture } from '../parser/noiseFilters';
import type { StoredHazmatEvent } from '../storage/d1';

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

const FURNITURE_TERMS = [
  'share share',
  'read more',
  'share',
  'copy link',
  'print email',
  'print',
  'email',
  'top stories',
  'related stories',
  'newsletter',
  'newsletters',
  'key headlines',
  'this live blog has ended',
  'all rights reserved',
  'watch live',
  '24/7 live',
  'california live',
  'inland empire',
  'ventura county',
  'youtube',
  'video',
  'bluesky',
  'flipboard',
  'pinterest',
  'reddit',
];

export function isPhysicalCategory(category: string): boolean {
  return PHYSICAL_CATEGORIES.has(category);
}

export function eventText(event: StoredHazmatEvent): string {
  return `${event.summary} ${event.excerpt ?? ''}`;
}

export function timeValue(value?: string): number {
  if (!value) return 0;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function eventTimeValue(event: StoredHazmatEvent): number {
  return timeValue(event.sourcePublishedAt) || timeValue(event.observedAt);
}

export function sourceRank(event: StoredHazmatEvent): number {
  if (event.sourceTier === 'manual') return 100;
  if (event.sourceTier === 'official') return 85;
  if (event.sourceTier === 'media_live') return 60;
  if (event.sourceTier === 'wire') return 55;
  return 10;
}

function furniturePenalty(event: StoredHazmatEvent): number {
  const lower = eventText(event).toLowerCase();
  const hits = FURNITURE_TERMS.filter((term) => lower.includes(term)).length;
  const displayEvaluation = evaluateDisplayEvent(event);

  return (
    hits * 35 +
    (isPageFurniture(event.excerpt ?? '') ? 120 : 0) +
    (displayEvaluation.displayQuality === 'low' ? 180 : 0)
  );
}

function incidentBonus(event: StoredHazmatEvent): number {
  return hasMediaIncidentSignal(eventText(event)) ? 60 : 0;
}

export function statusScore(event: StoredHazmatEvent): number {
  return sourceRank(event) + (event.sourcePriority ?? 0) * 3 + (event.rulePriority ?? 0) * 5 + incidentBonus(event) - furniturePenalty(event);
}

export function sanitizeStatusText(text: string): string {
  const first = text
    .replace(/\s+/g, ' ')
    .split(/(?:This live blog has ended\.?|Read More|Share|Copy Link|Print|Email|Top Stories|Related Stories|Key Headlines)/i)[0]
    .trim();

  return first || text.replace(/\s+/g, ' ').trim();
}

export function statusSummary(event?: StoredHazmatEvent): string | undefined {
  if (!event) return undefined;

  return sanitizeStatusText(event.summary);
}

export function filterStatusEvents(events: StoredHazmatEvent[]): StoredHazmatEvent[] {
  return events.filter(shouldExposeEvent).filter((event) => statusScore(event) > 0);
}

export function sortByStatusQuality(events: StoredHazmatEvent[]): StoredHazmatEvent[] {
  return [...events].sort((a, b) => {
    const scoreDiff = statusScore(b) - statusScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    return eventTimeValue(b) - eventTimeValue(a);
  });
}

export function sortByStatusTime(events: StoredHazmatEvent[]): StoredHazmatEvent[] {
  return [...events].sort((a, b) => {
    const timeDiff = eventTimeValue(b) - eventTimeValue(a);
    if (timeDiff !== 0) return timeDiff;

    return statusScore(b) - statusScore(a);
  });
}

export function bestStatusEvent(
  events: StoredHazmatEvent[],
  category: string,
  options: { preferOfficial?: boolean; physicalFallbackToMedia?: boolean } = {},
): StoredHazmatEvent | undefined {
  const matching = events.filter((event) => event.category === category);
  const official = matching.filter((event) => event.sourceTier === 'official' || event.sourceTier === 'manual');

  if (options.preferOfficial && official.length > 0) {
    return sortByStatusQuality(official)[0];
  }

  if (options.physicalFallbackToMedia && official.length > 0) {
    return sortByStatusQuality(official)[0];
  }

  return sortByStatusQuality(matching)[0];
}

export function latestHighQualityMediaPhysical(events: StoredHazmatEvent[]): StoredHazmatEvent | undefined {
  return sortByStatusTime(
    events.filter(
      (event) =>
        (event.sourceTier === 'media_live' || event.sourceTier === 'wire') &&
        isPhysicalCategory(event.category) &&
        statusScore(event) >= 80,
    ),
  )[0];
}
