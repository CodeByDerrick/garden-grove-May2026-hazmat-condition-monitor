export const NOISE_ANCHORS = [
  'newsletter',
  'sports',
  'entertainment',
  'fashion',
  'quizzes',
  'top stories',
  'related stories',
  'poll release',
  'share this',
  'read more',
  'celebrity',
  'basketball',
  'football',
  'movies',
  'music',
  'pinterest',
  'reddit',
  'flipboard',
];

export function hasStrongIncidentSignal(text: string): boolean {
  const lower = text.toLowerCase();

  return (
    lower.includes('methyl methacrylate') ||
    lower.includes('gkn aerospace') ||
    lower.includes('chemical tank') ||
    lower.includes('orange county fire authority')
  );
}

export function isMostlyNoise(text: string): boolean {
  const lower = String(text || '').toLowerCase();
  const hits = NOISE_ANCHORS.filter((anchor) => lower.includes(anchor)).length;

  return hits >= 2 && !hasStrongIncidentSignal(lower);
}
