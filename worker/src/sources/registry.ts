import type { ParserSource } from '../parser/types';

export type RegisteredSource = ParserSource & {
  enabled: boolean;
  priority: number;
};

export const SOURCE_REGISTRY: RegisteredSource[] = [
  {
    id: 'garden-grove-emergency',
    name: 'Garden Grove Emergency Page',
    url: 'https://ggcity.org/emergency',
    tier: 'official',
    enabled: true,
    priority: 10,
  },
  {
    id: 'oc-sheriff-disaster',
    name: 'OC Sheriff Disaster Resources',
    url: 'https://www.ocsheriff.gov/resources-during-disaster',
    tier: 'official',
    enabled: true,
    priority: 10,
  },
  {
    id: 'cal-oes-resource',
    name: 'Cal OES Garden Grove Resource Page',
    url: 'https://news.caloes.ca.gov/community-resources-for-garden-grove-hazmat-incident/',
    tier: 'official',
    enabled: true,
    priority: 10,
  },
  {
    id: 'abc7-live',
    name: 'ABC7 Live Updates',
    url: 'https://abc7.com/live-updates/garden-grove-chemical-tank-emergency-leaking-toxic-chemicals-orange-county-will-spill-explode-officials-say/19152918/',
    tier: 'media_live',
    enabled: true,
    priority: 7,
  },
  {
    id: 'nbc4-live',
    name: 'NBC4 Live Updates',
    url: 'https://www.nbclosangeles.com/news/local/live-updates-garden-grove-chemical-tank-crisis/3894268/',
    tier: 'media_live',
    enabled: true,
    priority: 7,
  },
  {
    id: 'ap-summary',
    name: 'Associated Press Summary',
    url: 'https://apnews.com/article/c1f922cae0ddb142857d12aee08d2d6b',
    tier: 'wire',
    enabled: true,
    priority: 4,
  },
];

export function listEnabledSources(limitSourceIds?: string[]): RegisteredSource[] {
  const allowed = new Set(limitSourceIds ?? []);

  return SOURCE_REGISTRY.filter((source) => source.enabled && (allowed.size === 0 || allowed.has(source.id)));
}
