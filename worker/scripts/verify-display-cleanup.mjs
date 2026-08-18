const BASE_URL = process.env.WORKER_BASE_URL ?? 'http://127.0.0.1:8787';

const ENDPOINTS = {
  events: `${BASE_URL}/api/events`,
  status: `${BASE_URL}/api/status`,
  rawEvents: `${BASE_URL}/api/events?includeLowQuality=true`,
};

const CMS_FURNITURE_FRAGMENTS = [
  'Skip to main content',
  'Accessibility Help',
  'Menu Open',
  'Government Residents Businesses Public Safety',
  'News Media Kit',
  'English Español',
  'Tiếng Việt',
  '한국어',
  'English Espa&#241;ol',
  'Ti&#7871;ng Vi&#7879;t',
  '&#54620;&#44397;&#50612;',
];

const GARDEN_GROVE_INCIDENT_FRAGMENTS = [
  'Chemical Spill Emergency - Garden Grove',
  'Emergency crews are responding to a chemical spill',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(name, url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`${name}: failed to fetch ${url}. Is npm run worker:dev running? ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`${name}: expected 2xx from ${url}, got ${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${name}: response was not valid JSON. ${error.message}`);
  }
}

function eventDisplayText(event) {
  return [event?.summary, event?.excerpt].filter(Boolean).join(' ');
}

function officialEvents(events) {
  return events.filter((event) => event?.sourceTier === 'official');
}

function assertArray(name, value) {
  assert(Array.isArray(value), `${name}: expected an array response`);
}

function assertNoOfficialFurniture(endpointName, events) {
  for (const event of officialEvents(events)) {
    const text = eventDisplayText(event);
    for (const fragment of CMS_FURNITURE_FRAGMENTS) {
      assert(
        !text.includes(fragment),
        `${endpointName}: official event ${event.id ?? '(missing id)'} from ${event.sourceName ?? '(missing source)'} still contains CMS furniture fragment "${fragment}"`,
      );
    }
  }
}

function assertGardenGroveIncidentExcerpt(events) {
  const gardenGroveEvents = officialEvents(events).filter((event) =>
    String(event.sourceName ?? '').toLowerCase().includes('garden grove'),
  );

  const matchingEvent = gardenGroveEvents.find((event) => {
    const text = eventDisplayText(event);
    return GARDEN_GROVE_INCIDENT_FRAGMENTS.every((fragment) => text.includes(fragment));
  });

  assert(
    matchingEvent,
    `status/events: expected a Garden Grove official display excerpt containing "${GARDEN_GROVE_INCIDENT_FRAGMENTS.join('" and "')}"`,
  );

  return matchingEvent;
}

function containsRawFurniture(events) {
  return events.some((event) => CMS_FURNITURE_FRAGMENTS.some((fragment) => eventDisplayText(event).includes(fragment)));
}

const events = await fetchJson('/api/events', ENDPOINTS.events);
const status = await fetchJson('/api/status', ENDPOINTS.status);
const rawEvents = await fetchJson('/api/events?includeLowQuality=true', ENDPOINTS.rawEvents);

assertArray('/api/events', events);
assertArray('/api/events?includeLowQuality=true', rawEvents);
assertArray('/api/status.newestEvents', status?.newestEvents);

assertNoOfficialFurniture('/api/events', events);
assertNoOfficialFurniture('/api/status.newestEvents', status.newestEvents);

const displaySurfaces = [...events, ...status.newestEvents];
const incidentEvent = assertGardenGroveIncidentExcerpt(displaySurfaces);

assert(
  rawEvents.length > events.length || containsRawFurniture(rawEvents),
  '/api/events?includeLowQuality=true: expected raw/debug access to expose more rows than /api/events or preserve uncleaned raw furniture for review',
);

console.log('Display cleanup verification passed');
console.log(`- /api/events rows: ${events.length}`);
console.log(`- /api/status.newestEvents rows: ${status.newestEvents.length}`);
console.log(`- /api/events?includeLowQuality=true rows: ${rawEvents.length}`);
console.log(`- Garden Grove official excerpt: ${incidentEvent.excerpt}`);
