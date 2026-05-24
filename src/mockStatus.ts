import type { CurrentStatus } from './types';

export const mockStatus: CurrentStatus = {
  generatedAt: new Date().toISOString(),
  lastSuccessfulPollAt: new Date().toISOString(),
  lastPhysicalUpdateAt: new Date().toISOString(),
  tankTemperature: {
    value: 90,
    units: 'F',
    trend: 'unknown',
    sourceName: 'Mock fallback data',
    confidence: 'unconfirmed',
  },
  leakPlumeStatus: 'No live endpoint configured. Replace this with public-source updates from Apps Script.',
  airMonitoringStatus: 'Unknown from fallback data.',
  containmentStatus: 'Unknown from fallback data.',
  coolingNeutralizationStatus: 'Unknown from fallback data.',
  overallStatus: 'Dashboard ready; live data endpoint not configured.',
  confidence: 'unconfirmed',
  physicalSituationSummary:
    'This is local fallback data used so the dashboard remains testable before the Apps Script endpoint is deployed.',
  newestEvents: [
    {
      id: 'mock-001',
      observedAt: new Date().toISOString(),
      sourceName: 'Mock fallback data',
      sourceUrl: 'https://github.com/CodeByDerrick/garden-grove-May2026-hazmat-condition-monitor',
      sourceTier: 'manual',
      category: 'other',
      summary: 'Dashboard loaded successfully. Configure VITE_STATUS_ENDPOINT to read live public-source monitoring JSON.',
      confidence: 'unconfirmed',
      severity: 'info',
      contentHash: 'mock-001',
    },
  ],
  sourceHealth: [
    {
      sourceName: 'Apps Script JSON endpoint',
      lastCheckedAt: new Date().toISOString(),
      ok: false,
      error: 'VITE_STATUS_ENDPOINT is not configured.',
    },
  ],
};
