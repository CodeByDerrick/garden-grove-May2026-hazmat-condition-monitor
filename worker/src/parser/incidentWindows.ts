import { hasMediaIncidentSignal, isMostlyNoise, isPageFurniture } from './noiseFilters';
import type { SourceTier } from './types';

export const INCIDENT_ANCHORS = [
  'garden grove',
  'gkn aerospace',
  'methyl methacrylate',
  'mma',
  'chemical tank',
  'orange county fire authority',
  'craig covey',
  'western ave',
  '12122 western',
];

export function hasIncidentAnchor(text: string): boolean {
  const lower = String(text || '').toLowerCase();

  return INCIDENT_ANCHORS.some((anchor) => lower.includes(anchor));
}

function isMediaTier(sourceTier?: SourceTier): boolean {
  return sourceTier === 'media_live' || sourceTier === 'wire';
}

function shouldKeepWindow(text: string, sourceTier?: SourceTier): boolean {
  if (!hasIncidentAnchor(text) || isMostlyNoise(text) || isPageFurniture(text)) {
    return false;
  }

  return !isMediaTier(sourceTier) || hasMediaIncidentSignal(text);
}

export function buildIncidentWindows(text: string, sourceTier?: SourceTier): string[] {
  const chunks: string[] = [];
  const normalized = String(text || '');
  const sentences = normalized.split(/(?<=[.!?])\s+/);

  for (let index = 0; index < sentences.length; index += 1) {
    const group = [sentences[index - 1] || '', sentences[index], sentences[index + 1] || ''].join(' ');

    if (shouldKeepWindow(group, sourceTier)) {
      chunks.push(group);
    }
  }

  if (chunks.length === 0 && shouldKeepWindow(normalized, sourceTier)) {
    chunks.push(normalized.slice(0, 5000));
  }

  return chunks;
}
