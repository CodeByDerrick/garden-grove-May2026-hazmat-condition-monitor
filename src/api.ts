import type { CurrentStatus } from './types';
import { mockStatus } from './mockStatus';

const STATUS_ENDPOINT = import.meta.env.VITE_STATUS_ENDPOINT as string | undefined;

export async function fetchCurrentStatus(): Promise<CurrentStatus> {
  if (!STATUS_ENDPOINT) {
    return {
      ...mockStatus,
      generatedAt: new Date().toISOString(),
      lastSuccessfulPollAt: new Date().toISOString(),
    };
  }

  const response = await fetch(STATUS_ENDPOINT, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Status endpoint returned ${response.status}`);
  }

  return (await response.json()) as CurrentStatus;
}
