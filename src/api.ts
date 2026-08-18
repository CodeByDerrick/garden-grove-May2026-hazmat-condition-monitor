import type { CurrentStatus } from './types';
import { mockStatus } from './mockStatus';

const DEFAULT_STATUS_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbysOxJZTtuKj9HlVUiQZe2KzzCn9_ucEGyViA_5KBT6uucNkJVYPTvPNM0lzWUwEjc/exec';
const STATUS_ENDPOINT = (import.meta.env.VITE_STATUS_ENDPOINT as string | undefined) || DEFAULT_STATUS_ENDPOINT;
let loggedStatusEndpoint = false;

export async function fetchCurrentStatus(): Promise<CurrentStatus> {
  if (!STATUS_ENDPOINT) {
    return {
      ...mockStatus,
      generatedAt: new Date().toISOString(),
      lastSuccessfulPollAt: new Date().toISOString(),
    };
  }

  if (!loggedStatusEndpoint) {
    console.info(`[dashboard] status endpoint: ${STATUS_ENDPOINT}`);
    loggedStatusEndpoint = true;
  }

  const response = await fetch(STATUS_ENDPOINT, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Status endpoint returned ${response.status}`);
  }

  return (await response.json()) as CurrentStatus;
}
