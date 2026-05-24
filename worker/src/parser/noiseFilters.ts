export const NOISE_ANCHORS = [
  'newsletter',
  'sign up',
  'sports',
  'entertainment',
  'fashion',
  'quizzes',
  'top stories',
  'key headlines',
  'latest headlines',
  'related stories',
  'poll release',
  'share this',
  'read more',
  'watch live',
  'watch now',
  '24/7 live',
  'live updates',
  'last updated',
  'youtube',
  'video',
  'tips',
  'page navigation',
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
    lower.includes('orange county fire authority') ||
    lower.includes('craig covey') ||
    lower.includes('12122 western') ||
    lower.includes('western ave')
  );
}

export function hasMediaIncidentSignal(text: string): boolean {
  const lower = String(text || '').toLowerCase();
  const hasGardenGrove = lower.includes('garden grove');
  const hasIncidentDetail =
    lower.includes('chemical') ||
    lower.includes('tank') ||
    lower.includes('mma') ||
    lower.includes('gkn') ||
    lower.includes('ocfa') ||
    lower.includes('orange county fire authority') ||
    lower.includes('craig covey') ||
    lower.includes('western ave') ||
    lower.includes('12122 western');

  return (hasGardenGrove && hasIncidentDetail) || hasStrongIncidentSignal(lower);
}

export function isPageFurniture(text: string): boolean {
  const lower = String(text || '').toLowerCase();
  const trimmed = lower.trim();
  const startsWithListBlock =
    trimmed.startsWith('related stories') ||
    trimmed.startsWith('top stories') ||
    trimmed.startsWith('key headlines') ||
    trimmed.startsWith('latest headlines') ||
    trimmed.startsWith('newsletter');
  const noiseHits = NOISE_ANCHORS.filter((anchor) => lower.includes(anchor)).length;
  const linkListSignals = [
    'top stories',
    'related stories',
    'key headlines',
    'latest headlines',
    'watch live',
    '24/7 live',
    'youtube',
    'share this',
    'read more',
  ].filter((anchor) => lower.includes(anchor)).length;

  return startsWithListBlock || linkListSignals >= 2 || noiseHits >= 4 || (noiseHits >= 2 && !hasStrongIncidentSignal(lower));
}

export function isMostlyNoise(text: string): boolean {
  const lower = String(text || '').toLowerCase();
  const hits = NOISE_ANCHORS.filter((anchor) => lower.includes(anchor)).length;

  return (hits >= 2 && !hasStrongIncidentSignal(lower)) || isPageFurniture(lower);
}
