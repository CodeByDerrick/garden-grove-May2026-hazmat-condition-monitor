import { isMostlyNoise } from './noiseFilters';

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

export function buildIncidentWindows(text: string): string[] {
  const chunks: string[] = [];
  const normalized = String(text || '');
  const sentences = normalized.split(/(?<=[.!?])\s+/);

  for (let index = 0; index < sentences.length; index += 1) {
    const group = [sentences[index - 1] || '', sentences[index], sentences[index + 1] || ''].join(' ');

    if (hasIncidentAnchor(group) && !isMostlyNoise(group)) {
      chunks.push(group);
    }
  }

  if (chunks.length === 0 && hasIncidentAnchor(normalized) && !isMostlyNoise(normalized)) {
    chunks.push(normalized.slice(0, 5000));
  }

  return chunks;
}
