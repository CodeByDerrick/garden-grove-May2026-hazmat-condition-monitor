import { buildOpsStatus, type OpsEnv } from './ops/status';
import { checkDbHealth, incrementUsageCounter, listRecentEvents, type WorkerEnv } from './storage/d1';

type SourceTier = 'official' | 'media_live' | 'wire' | 'social' | 'manual';
type Confidence = 'official' | 'attributed_to_official' | 'media_reported' | 'unconfirmed';
type Severity = 'info' | 'watch' | 'warning' | 'critical';
type ConditionCategory =
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

type HazmatEvent = {
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
    confidence: Confidence | string;
  };
  leakPlumeStatus?: string;
  airMonitoringStatus?: string;
  containmentStatus?: string;
  coolingNeutralizationStatus?: string;
  overallStatus?: string;
  confidence?: Confidence | string;
  physicalSituationSummary: string;
  resources?: {
    status: string;
    incidentSite: string;
    evacuationZone: string[];
    affectedCities: string[];
    timeline: string[];
    hotlines: Array<{ label: string; value: string; note?: string }>;
    officialLinks: Array<{ label: string; url: string; note?: string }>;
    shelterLinks: Array<{ label: string; url: string; note?: string }>;
    hotelLinks: Array<{ label: string; url: string; note?: string }>;
    languages: string[];
    notes: string[];
  };
  sourceFreshness?: {
    latestOfficialTextUpdate?: string;
    latestOfficialVideoUpdate?: string;
    latestMediaPhysicalUpdate?: string;
    latestMonitorCapture?: string;
    telemetryStatus: string;
    freshnessWarning?: string;
  };
  newestEvents: HazmatEvent[];
  sourceHealth: Array<{
    sourceName: string;
    sourceUrl?: string;
    lastCheckedAt: string;
    ok: boolean;
    lastChangedAt?: string;
    error?: string;
  }>;
};

const SERVICE_NAME = 'hazmat-condition-monitor-worker';
const REPO_URL = 'https://github.com/CodeByDerrick/garden-grove-May2026-hazmat-condition-monitor';

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init.headers,
    },
  });
}

function buildMockEvents(now: string): HazmatEvent[] {
  return [
    {
      id: 'worker-mock-001',
      observedAt: now,
      sourceName: 'Cloudflare Worker mock',
      sourceUrl: REPO_URL,
      sourceTier: 'manual',
      category: 'other',
      summary: 'Worker scaffold is responding with mock hazmat condition data.',
      confidence: 'unconfirmed',
      severity: 'info',
      contentHash: 'worker-mock-001',
    },
    {
      id: 'worker-mock-002',
      observedAt: now,
      sourceName: 'Cloudflare Worker mock',
      sourceUrl: REPO_URL,
      sourceTier: 'manual',
      category: 'air_monitoring',
      summary: 'Air monitoring status is placeholder data until the D1-backed poller is introduced.',
      confidence: 'unconfirmed',
      severity: 'watch',
      contentHash: 'worker-mock-002',
    },
  ];
}

function buildMockStatus(): CurrentStatus {
  const now = new Date().toISOString();
  const newestEvents = buildMockEvents(now);

  return {
    generatedAt: now,
    lastSuccessfulPollAt: now,
    lastPhysicalUpdateAt: now,
    tankTemperature: {
      value: 90,
      units: 'F',
      trend: 'unknown',
      sourceName: 'Cloudflare Worker mock',
      sourcePublishedAt: now,
      confidence: 'unconfirmed',
    },
    leakPlumeStatus: 'Mock worker data: no confirmed leak or plume status is available from this scaffold.',
    airMonitoringStatus: 'Mock worker data: live air monitoring integration has not been added yet.',
    containmentStatus: 'Mock worker data: containment status is pending a future backend data source.',
    coolingNeutralizationStatus: 'Mock worker data: cooling and neutralization status is pending a future backend data source.',
    overallStatus: 'Cloudflare Worker scaffold is online with mock data. The dashboard still reads from Apps Script.',
    confidence: 'unconfirmed',
    physicalSituationSummary:
      'This Worker is a migration scaffold only. It returns contract-shaped mock data and does not replace the production Apps Script endpoint.',
    resources: {
      status: 'Mock resources only',
      incidentSite: 'Garden Grove hazmat incident area',
      evacuationZone: ['Mock evacuation zone placeholder'],
      affectedCities: ['Garden Grove'],
      timeline: ['Worker scaffold created with mock endpoints.'],
      hotlines: [
        {
          label: 'Emergency',
          value: '911',
          note: 'Use for immediate life-safety emergencies.',
        },
      ],
      officialLinks: [
        {
          label: 'Project repository',
          url: REPO_URL,
          note: 'Placeholder source link for scaffold data.',
        },
      ],
      shelterLinks: [],
      hotelLinks: [],
      languages: ['English'],
      notes: ['Mock data only. Do not use for emergency decisions.'],
    },
    sourceFreshness: {
      latestMonitorCapture: now,
      telemetryStatus: 'mock_worker_scaffold',
      freshnessWarning: 'This endpoint is not connected to D1 or live public-source polling yet.',
    },
    newestEvents,
    sourceHealth: [
      {
        sourceName: 'Cloudflare Worker mock',
        sourceUrl: REPO_URL,
        lastCheckedAt: now,
        ok: true,
        lastChangedAt: now,
      },
    ],
  };
}

async function getEvents(env: WorkerEnv): Promise<HazmatEvent[]> {
  try {
    const events = await listRecentEvents(env, 50);

    if (events.length > 0) {
      return events as HazmatEvent[];
    }
  } catch {
    // D1 is optional in this migration slice; mock data keeps the endpoint usable.
  }

  return buildMockEvents(new Date().toISOString());
}

export default {
  async fetch(request: Request, env: WorkerEnv & OpsEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse({ ok: true, service: SERVICE_NAME });
    }

    if (request.method === 'GET' && url.pathname === '/api/db/health') {
      const health = await checkDbHealth(env);
      return jsonResponse(health, { status: health.ok ? 200 : 503 });
    }

    if (request.method === 'POST' && url.pathname === '/api/ops/smoke-counter') {
      try {
        const counter = await incrementUsageCounter(env, 'smoke_test_counter');
        return jsonResponse({
          ok: true,
          metric: counter.metric,
          bucketStart: counter.bucketStart,
          count: counter.count,
          updatedAt: counter.updatedAt,
        });
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            error: errorMessage(error),
          },
          { status: 503 },
        );
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/ops/status') {
      return jsonResponse(await buildOpsStatus(env, request));
    }

    if (request.method === 'GET' && url.pathname === '/api/status') {
      const status = buildMockStatus();

      try {
        const events = await listRecentEvents(env, 10);

        if (events.length > 0) {
          status.newestEvents = events as HazmatEvent[];
        }
      } catch {
        // Keep status mock-compatible until the D1-backed status builder exists.
      }

      return jsonResponse(status);
    }

    if (request.method === 'GET' && url.pathname === '/api/events') {
      return jsonResponse(await getEvents(env));
    }

    if (!['GET', 'POST'].includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
    }

    return jsonResponse({ error: 'Not found' }, { status: 404 });
  },
};
