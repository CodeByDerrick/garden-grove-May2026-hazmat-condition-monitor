import { hasMediaIncidentSignal, isPageFurniture } from '../parser/noiseFilters';

export type FilterableEvent = {
  sourceTier: string;
  summary: string;
  excerpt?: string;
  category: string;
};

export function hasOperationalEvacuationDetail(eventText: string): boolean {
  const lower = eventText.toLowerCase();

  return (
    lower.includes('mandatory') ||
    lower.includes('order') ||
    lower.includes('zone') ||
    lower.includes('area') ||
    lower.includes('expanded') ||
    lower.includes('lifted') ||
    lower.includes('shelter') ||
    lower.includes('residents') ||
    lower.includes('north of') ||
    lower.includes('south of') ||
    lower.includes('east of') ||
    lower.includes('west of') ||
    lower.includes('western') ||
    lower.includes('address')
  );
}

export function shouldExposeEvent(event: FilterableEvent): boolean {
  if (event.sourceTier !== 'media_live' && event.sourceTier !== 'wire') {
    return true;
  }

  const eventText = `${event.summary} ${event.excerpt ?? ''}`;

  if (isPageFurniture(event.excerpt ?? '') || isPageFurniture(eventText) || !hasMediaIncidentSignal(eventText)) {
    return false;
  }

  return event.category !== 'evacuation' || hasOperationalEvacuationDetail(eventText);
}
